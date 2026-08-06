// Détection de proximité par Bluetooth Low Energy : complément optionnel à
// la localisation GPS, désactivé par défaut, activable uniquement depuis les
// réglages (cf. BluetoothConsentScreen).
//
// Deux rôles BLE distincts, deux libs distinctes (react-native-ble-plx ne
// gère que le rôle "central" / scan) :
//  - Advertising (rôle "peripheral", react-native-ble-advertiser) : diffuse un
//    jeton éphémère fourni par le backend (jamais l'identifiant de compte).
//  - Scan (rôle "central", react-native-ble-plx) : détecte les jetons diffusés
//    par les autres utilisateurs à proximité et leur RSSI approximatif.
//
// Les détections sont mises en file localement et envoyées par lots dès que
// le réseau est disponible (fonctionnement "hors-réseau" recherché) — voir
// BleOfflineQueue.js.
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import BleAdvertiser from 'react-native-ble-advertiser';
import NetInfo from '@react-native-community/netinfo';
import { issueBleToken } from '../components/ApiRequest';
import { enqueueSighting, flushQueuedSightings } from './BleOfflineQueue';

// Identifiant de société BLE "test/réservé" (Bluetooth SIG) — LoocateMe n'a
// pas de company ID assigné ; suffisant pour filtrer nos propres trames sans
// collision pratique avec les autres apps environnantes.
const COMPANY_ID = 0xffff;
const TOKEN_ROTATION_MS = 9 * 60 * 1000; // avant l'expiration serveur (10 min)
const SCAN_REPORT_INTERVAL_MS = 15 * 1000;
const RSSI_MIN_THRESHOLD = -90;

let bleManager = null;
let scanActive = false;
let advertisingActive = false;
let currentToken = null;
let tokenRotationTimer = null;
let reportTimer = null;
let netUnsubscribe = null;
let pendingBatch = new Map(); // token -> { rssi, seenAt }

function getManager() {
  if (!bleManager) bleManager = new BleManager();
  return bleManager;
}

async function requestAndroidBlePermissions() {
  if (Platform.OS !== 'android') return true;
  const apiLevel = Platform.Version;
  try {
    if (apiLevel >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    }
    // Android < 12 : le scan BLE nécessite la localisation, déjà demandée
    // ailleurs dans l'app (LocationPermissionModal).
    const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return !!fine;
  } catch (e) {
    console.warn('[BLE] Permission request failed', e?.message || e);
    return false;
  }
}

export async function requestBluetoothPermissions() {
  if (Platform.OS === 'android') return requestAndroidBlePermissions();
  // iOS : la demande d'autorisation Bluetooth se déclenche automatiquement à
  // la première utilisation de BleManager/BleAdvertiser (NSBluetoothAlwaysUsageDescription).
  return true;
}

async function rotateToken() {
  try {
    const res = await issueBleToken();
    currentToken = res?.token || null;
    if (currentToken && advertisingActive) {
      await restartAdvertising();
    }
    return currentToken;
  } catch (e) {
    console.warn('[BLE] Token rotation failed', e?.message || e);
    return null;
  }
}

// RN/Hermes n'expose ni atob/btoa ni Buffer de façon garantie selon la
// configuration : implémentation base64 autonome pour éviter toute dépendance
// d'environnement sur ce chemin critique (encodage/décodage des trames BLE).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64) {
  const clean = b64.replace(/=+$/, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = B64_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += B64_CHARS[(buffer >> bits) & 0x3f];
    }
  }
  if (bits > 0) {
    result += B64_CHARS[(buffer << (6 - bits)) & 0x3f];
  }
  while (result.length % 4 !== 0) result += '=';
  return result;
}

function tokenToManufacturerBytes(token) {
  // Encode le jeton (base64url, ~16 octets) en tableau d'octets pour la
  // charge utile "manufacturer data" de l'advertising.
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(b64);
}

async function restartAdvertising() {
  try {
    await BleAdvertiser.stopBroadcast().catch(() => {});
    if (!currentToken) return;
    await BleAdvertiser.broadcast(COMPANY_ID, tokenToManufacturerBytes(currentToken), {
      advertiseMode: BleAdvertiser.ADVERTISE_MODE_BALANCED,
      txPowerLevel: BleAdvertiser.ADVERTISE_TX_POWER_MEDIUM,
      connectable: false,
      includeDeviceName: false,
    });
  } catch (e) {
    console.warn('[BLE] Advertising failed (device/OS may not support peripheral mode)', e?.message || e);
  }
}

function bytesToToken(bytes) {
  const b64 = bytesToBase64(bytes);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function handleScanResult(device) {
  if (!device?.manufacturerData || typeof device.rssi !== 'number') return;
  if (device.rssi < RSSI_MIN_THRESHOLD) return;
  try {
    // device.manufacturerData (react-native-ble-plx) est déjà du base64.
    const allBytes = base64ToBytes(device.manufacturerData);
    // Les 2 premiers octets sont le company ID (little-endian), le reste est le jeton.
    if (allBytes.length <= 2) return;
    const bytes = allBytes.slice(2);
    const token = bytesToToken(bytes);
    pendingBatch.set(token, { rssi: device.rssi, seenAt: new Date().toISOString() });
  } catch (_) {
    // Trame illisible ou provenant d'un autre appareil/app : ignorée
  }
}

async function flushBatch() {
  if (pendingBatch.size === 0) return;
  const sightings = Array.from(pendingBatch.entries()).map(([token, v]) => ({ token, rssi: v.rssi, seenAt: v.seenAt }));
  pendingBatch = new Map();

  const net = await NetInfo.fetch();
  if (!net?.isConnected || !net?.isInternetReachable) {
    // Hors-réseau : on garde les détections en local, elles seront envoyées
    // dès le retour de la connexion (cf. flushQueuedSightings ci-dessous).
    await enqueueSighting(sightings);
    return;
  }

  try {
    const { reportBleSightings } = await import('../components/ApiRequest');
    await reportBleSightings(sightings);
  } catch (e) {
    // Échec réseau ponctuel : on ne perd pas les détections, on les remet en file
    await enqueueSighting(sightings);
  }
}

export const BluetoothProximityService = {
  // À appeler uniquement si privacyPreferences.bluetoothProximity === true.
  start: async () => {
    if (scanActive) return true;
    const granted = await requestBluetoothPermissions();
    if (!granted) return false;

    const token = await rotateToken();
    if (!token) return false;

    advertisingActive = true;
    await restartAdvertising();

    const manager = getManager();
    try {
      manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
        if (error) {
          console.warn('[BLE] Scan error', error?.message || error);
          return;
        }
        handleScanResult(device);
      });
      scanActive = true;
    } catch (e) {
      console.warn('[BLE] Scan start failed', e?.message || e);
    }

    tokenRotationTimer = setInterval(rotateToken, TOKEN_ROTATION_MS);
    reportTimer = setInterval(flushBatch, SCAN_REPORT_INTERVAL_MS);

    // Dès que le réseau revient, on vide la file des détections capturées hors-ligne.
    netUnsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        flushQueuedSightings().catch(() => {});
      }
    });

    return true;
  },

  stop: async () => {
    try {
      if (scanActive) getManager().stopDeviceScan();
    } catch (_) {}
    scanActive = false;
    try {
      if (advertisingActive) await BleAdvertiser.stopBroadcast().catch(() => {});
    } catch (_) {}
    advertisingActive = false;
    currentToken = null;
    if (tokenRotationTimer) clearInterval(tokenRotationTimer);
    if (reportTimer) clearInterval(reportTimer);
    tokenRotationTimer = null;
    reportTimer = null;
    if (netUnsubscribe) netUnsubscribe();
    netUnsubscribe = null;
    pendingBatch = new Map();
  },

  isActive: () => scanActive,
};

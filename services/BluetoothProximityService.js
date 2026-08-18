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
import { computeVenueHashBytes, bytesEqual } from './BleVenueHash';

// Identifiant de société BLE "test/réservé" (Bluetooth SIG) — LoocateMe n'a
// pas de company ID assigné ; suffisant pour filtrer nos propres trames sans
// collision pratique avec les autres apps environnantes.
const COMPANY_ID = 0xffff;
const TOKEN_ROTATION_MS = 9 * 60 * 1000; // avant l'expiration serveur (10 min)
const SCAN_REPORT_INTERVAL_MS = 15 * 1000;
const RSSI_MIN_THRESHOLD = -90;

// UUID de service fixe utilisé pour l'advertising Android : react-native-ble-advertiser
// exige un UUID valide comme identifiant d'advertiser (ParcelUuid.fromString côté natif) ;
// ce n'est qu'un identifiant de "canal", la charge utile réelle (jeton + hash de lieu)
// voyage dans le manufacturer data, associé au COMPANY_ID via setCompanyId().
const ANDROID_SERVICE_UUID = 'a1e29a00-c3b1-4cae-8a49-6f4d5e2b7c10';

// iOS (CBPeripheralManager, via react-native-ble-advertiser) n'expose que
// CBAdvertisementDataServiceUUIDsKey en advertising : le manufacturer data est
// ignoré par la lib côté natif. On encode donc le jeton directement dans un UUID
// de service synthétique : 4 octets de préfixe "magique" (pour reconnaître nos
// propres trames au scan) + les 12 octets du jeton = 16 octets = 1 UUID (128 bits).
// Le hash de lieu (venue hash) ne tient pas dans les octets restants : sur iOS,
// un pair n'est donc utilisable que pour le report serveur, pas pour la
// résolution locale de lieu (resolveVenueLocally), qui reste Android-only.
const IOS_MAGIC_PREFIX = [0x4c, 0x4d, 0x76, 0x31]; // 'L','M','v','1'

const LIVE_PEER_TTL_MS = 30 * 1000;

let bleManager = null;
let scanActive = false;
let advertisingActive = false;
let currentToken = null;
let currentTokenBytes = null;
let localConfirmedVenueId = null;
let tokenRotationTimer = null;
let reportTimer = null;
let netUnsubscribe = null;
let pendingBatch = new Map(); // token -> { rssi, seenAt } — pour le report serveur périodique
let livePeers = new Map(); // token -> { rssi, venueHashBytes, seenAt } — pour la résolution locale, sans serveur

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
    currentTokenBytes = currentToken ? tokenToManufacturerBytes(currentToken) : null;
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

function bytesToUuidString(bytes16) {
  const hex = bytes16.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidStringToBytes(uuid) {
  const hex = String(uuid).replace(/-/g, '');
  if (hex.length !== 32) return null;
  const bytes = [];
  for (let i = 0; i < 32; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function tokenToManufacturerBytes(token) {
  // Encode le jeton (base64url, ~16 octets) en tableau d'octets pour la
  // charge utile "manufacturer data" de l'advertising.
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(b64);
}

function buildAdvertisedPayload() {
  const tokenBytes = currentTokenBytes || tokenToManufacturerBytes(currentToken);
  if (!localConfirmedVenueId) {
    // Pas de lieu confirmé localement : juste le jeton + un flag "0".
    return [...tokenBytes, 0];
  }
  const venueHashBytes = computeVenueHashBytes(localConfirmedVenueId, tokenBytes);
  return [...tokenBytes, 1, ...venueHashBytes];
}

async function restartAdvertising() {
  try {
    await BleAdvertiser.stopBroadcast().catch(() => {});
    if (!currentToken || !currentTokenBytes) return;
    // Requis par la lib native avant tout broadcast (sinon rejet "Invalid company id"
    // côté Android) ; sans effet côté iOS mais inoffensif à appeler.
    BleAdvertiser.setCompanyId(COMPANY_ID);
    // `uid` doit être un UUID valide (natif : ParcelUuid.fromString / CBUUID) — ce n'est
    // pas le champ qui transporte le jeton. Sur Android le jeton voyage dans le
    // manufacturer data (buildAdvertisedPayload) ; sur iOS, seul le service UUID est
    // réellement diffusé, donc le jeton y est encodé directement (cf. IOS_MAGIC_PREFIX).
    const uid =
      Platform.OS === 'ios' ? bytesToUuidString([...IOS_MAGIC_PREFIX, ...currentTokenBytes]) : ANDROID_SERVICE_UUID;
    await BleAdvertiser.broadcast(uid, buildAdvertisedPayload(), {
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

// crypto.randomBytes(12) côté serveur (voir ble.service.js issueBleToken) -> 12 octets bruts une fois décodés.
const TOKEN_BYTE_LEN = 12;

function recordPeerSighting(rssi, tokenBytes, venueHashBytes) {
  const token = bytesToToken(tokenBytes);
  const seenAt = new Date().toISOString();
  pendingBatch.set(token, { rssi, seenAt });
  livePeers.set(token, { rssi, tokenBytes, venueHashBytes, seenAt: Date.now() });
}

// Pairs Android : jeton + hash de lieu portés par le manufacturer data.
function handleManufacturerDataFrame(device) {
  try {
    // device.manufacturerData (react-native-ble-plx) est déjà du base64.
    const allBytes = base64ToBytes(device.manufacturerData);
    // Les 2 premiers octets sont le company ID (little-endian) ajoutés par l'OS.
    if (allBytes.length <= 2) return;
    const payload = allBytes.slice(2);
    if (payload.length < TOKEN_BYTE_LEN + 1) return;
    const tokenBytes = payload.slice(0, TOKEN_BYTE_LEN);
    const hasVenueFlag = payload[TOKEN_BYTE_LEN];
    const venueHashBytes = hasVenueFlag === 1 ? payload.slice(TOKEN_BYTE_LEN + 1, TOKEN_BYTE_LEN + 5) : null;
    recordPeerSighting(device.rssi, tokenBytes, venueHashBytes);
  } catch (_) {
    // Trame illisible ou provenant d'un autre appareil/app : ignorée
  }
}

// Pairs iOS : seul le service UUID est réellement diffusé côté advertiser (cf.
// restartAdvertising) ; le jeton y est encodé directement, sans hash de lieu
// (pas assez de place dans les 16 octets d'un UUID).
function handleServiceUuidFrames(device) {
  for (const uuid of device.serviceUUIDs) {
    const bytes = uuidStringToBytes(uuid);
    if (!bytes || bytes.length !== IOS_MAGIC_PREFIX.length + TOKEN_BYTE_LEN) continue;
    if (!bytesEqual(bytes.slice(0, IOS_MAGIC_PREFIX.length), IOS_MAGIC_PREFIX)) continue;
    const tokenBytes = bytes.slice(IOS_MAGIC_PREFIX.length);
    recordPeerSighting(device.rssi, tokenBytes, null);
  }
}

function handleScanResult(device) {
  if (typeof device?.rssi !== 'number' || device.rssi < RSSI_MIN_THRESHOLD) return;
  if (device.manufacturerData) handleManufacturerDataFrame(device);
  if (device.serviceUUIDs?.length) handleServiceUuidFrames(device);
}

function pruneLivePeers() {
  const cutoff = Date.now() - LIVE_PEER_TTL_MS;
  for (const [token, peer] of livePeers) {
    if (peer.seenAt < cutoff) livePeers.delete(token);
  }
}

async function flushBatch() {
  pruneLivePeers();
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
    currentTokenBytes = null;
    localConfirmedVenueId = null;
    if (tokenRotationTimer) clearInterval(tokenRotationTimer);
    if (reportTimer) clearInterval(reportTimer);
    tokenRotationTimer = null;
    reportTimer = null;
    if (netUnsubscribe) netUnsubscribe();
    netUnsubscribe = null;
    pendingBatch = new Map();
    livePeers = new Map();
  },

  isActive: () => scanActive,

  // Appelé par LocationService dès qu'un check-in serveur (ou une résolution
  // locale, voir ci-dessous) confirme le lieu courant : on le diffuse
  // (haché, salé par le jeton) pour que les pairs à proximité puissent s'y
  // recaler localement, y compris sans réseau.
  setLocalConfirmedVenue: async (venueId) => {
    const normalized = venueId ? String(venueId) : null;
    if (normalized === localConfirmedVenueId) return;
    localConfirmedVenueId = normalized;
    if (advertisingActive && currentToken) {
      await restartAdvertising();
    }
  },

  // Résolution 100% locale, sans aucun appel serveur : parmi les lieux
  // candidats (issus du GPS + du cache local, cf. NearbyVenueCache), renvoie
  // celui pour lequel un pair BLE actuellement à proximité diffuse un hash
  // correspondant — preuve locale que ce pair est déjà confirmé à ce lieu.
  // Utilisé en dernier recours quand le réseau est indisponible et ne
  // revient pas (cf. LocationService.immediateCheckIn).
  resolveVenueLocally: (candidateVenueIds) => {
    if (!candidateVenueIds?.length || livePeers.size === 0) return null;
    pruneLivePeers();
    // Le pair le plus proche (meilleur RSSI) tranche en priorité.
    const peers = Array.from(livePeers.values())
      .filter((p) => p.venueHashBytes)
      .sort((a, b) => b.rssi - a.rssi);
    for (const peer of peers) {
      for (const candidateId of candidateVenueIds) {
        const expected = computeVenueHashBytes(candidateId, peer.tokenBytes);
        if (bytesEqual(expected, peer.venueHashBytes)) {
          return candidateId;
        }
      }
    }
    return null;
  },
};

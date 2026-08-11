import { useContext, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { post } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { mapBackendUser } from '../utils/mappers';
import { getCurrentPositionSmart } from '../utils/locationHelper';
import { getDevLocationOverride, loadDevLocationOverride } from '../utils/devLocationOverride';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import { shouldSend, markSent, roundCoord } from '../utils/locationSendGuard';

/**
 * Hook pour gérer le "Heartbeat" (battement de cœur) de présence en premier plan.
 *
 * Stratégie pour une présence quasi instantanée :
 *  - Un heartbeat est envoyé immédiatement quand l'app passe en premier plan.
 *  - Un `watchPositionAsync` envoie un heartbeat dès qu'un mouvement significatif
 *    (~30 m) est détecté → l'entrée et la sortie d'un POI restent réactives.
 *  - Un fallback temporel envoie un heartbeat toutes les 90 s même si l'utilisateur
 *    ne bouge pas, pour maintenir la fraîcheur côté serveur.
 *  - `locationSendGuard` déduplique avec les envois faits par `LocationService`
 *    (check-in) pour éviter deux requêtes réseau pour le même déplacement.
 */
export function usePresence(isEnabled) {
  const { user, updateUser } = useContext(UserContext);
  const intervalRef = useRef(null);
  const watcherRef = useRef(null);
  const inFlightRef = useRef(false);
  const lastSentAtRef = useRef(0);
  // En mode manuel, seul le bouton explicite "Je suis là" (forceCheckIn avec
  // mode: 'manual') doit assigner currentPoiId — le backend ne connaît pas ce
  // mode et check-in dès qu'un heartbeat matche un lieu par proximité GPS
  // (cf. updateLocation côté API), donc le seul levier côté client est de ne
  // pas émettre ce heartbeat du tout. Même garde-fou déjà appliqué au
  // heartbeat en arrière-plan, cf. services/LocationService.js#immediateCheckIn.
  const isManualMode = user?.checkInMode === 'manual';

  useEffect(() => {
    if (!isEnabled || isManualMode) {
      return undefined;
    }

    const sendHeartbeat = async (coords) => {
      try {
        if (isLocationHeartbeatSuppressed()) return;
        let lat = coords?.latitude;
        let lon = coords?.longitude;

        if (typeof lat !== 'number' || typeof lon !== 'number') {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await getCurrentPositionSmart({ skipLastKnown: true });
          if (!pos?.coords) return;
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }

        if (inFlightRef.current) return;

        if (!shouldSend(lat, lon)) {
          // Un envoi (heartbeat ou check-in) a déjà eu lieu très récemment pour
          // une position quasi identique — évite un doublon réseau, mais on
          // marque quand même lastSentAtRef pour ne pas redéclencher le
          // fallback 60s juste après.
          lastSentAtRef.current = Date.now();
          return;
        }

        inFlightRef.current = true;

        const roundedLat = roundCoord(lat);
        const roundedLon = roundCoord(lon);

        const startTime = Date.now();
        try {
          const res = await post('/user/heartbeat', { lat: roundedLat, lon: roundedLon });
          if (res?.user) updateUser(mapBackendUser(res.user));
          lastSentAtRef.current = Date.now();
          markSent(roundedLat, roundedLon);
          const duration = Date.now() - startTime;
          logger.log(`[usePresence] Foreground heartbeat sent successfully in ${duration}ms`);
        } finally {
          inFlightRef.current = false;
        }
      } catch (err) {
        inFlightRef.current = false;
        console.warn('[usePresence] Heartbeat failed:', err.message || err);
      }
    };

    const startWatcher = async () => {
      try {
        if (__DEV__) {
          await loadDevLocationOverride();
          if (getDevLocationOverride()) return; // watchPositionAsync ne peut pas être overridden
        }
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        // Stop any previous watcher before starting a new one
        if (watcherRef.current) {
          try {
            watcherRef.current.remove();
          } catch {}
          watcherRef.current = null;
        }
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            // Heartbeat dès qu'on bouge de ~30 m (entrée/sortie de POI réactives).
            distanceInterval: 30,
            // Et au pire toutes les 45 s (sécurité).
            timeInterval: 45000,
          },
          (pos) => {
            if (pos?.coords) sendHeartbeat(pos.coords);
          },
        );
      } catch (err) {
        console.warn('[usePresence] watchPositionAsync failed:', err.message || err);
      }
    };

    const startHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Envoyer un heartbeat immédiatement (entrée instantanée dans un POI)
      sendHeartbeat();
      // Démarrer la surveillance des mouvements pour réagir instantanément
      startWatcher();
      // Fallback : forcer un heartbeat toutes les 90s si rien n'a été envoyé entre-temps
      intervalRef.current = setInterval(() => {
        if (Date.now() - lastSentAtRef.current >= 90000) {
          sendHeartbeat();
        }
      }, 90000);
    };

    const stopHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      if (watcherRef.current) {
        try {
          watcherRef.current.remove();
        } catch {}
        watcherRef.current = null;
      }
    };

    // Gérer les changements d'état de l'app (Foreground/Background)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    });

    // Démarrer au montage si actif
    if (AppState.currentState === 'active') {
      startHeartbeat();
    }

    return () => {
      subscription.remove();
      stopHeartbeat();
    };
  }, [isEnabled, isManualMode, updateUser]);
}

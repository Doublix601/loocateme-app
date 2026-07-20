import { useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { post } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { mapBackendUser } from '../utils/mappers';
import { getCurrentPositionSmart } from '../utils/locationHelper';
import { getDevLocationOverride, loadDevLocationOverride } from '../utils/devLocationOverride';

/**
 * Hook pour gérer le "Heartbeat" (battement de cœur) de présence en premier plan.
 *
 * Stratégie pour une présence instantanée :
 *  - Un heartbeat est envoyé immédiatement quand l'app passe en premier plan.
 *  - Un `watchPositionAsync` envoie un heartbeat dès qu'un mouvement significatif
 *    (~20 m) est détecté → l'entrée et la sortie d'un POI sont quasi instantanées.
 *  - Un fallback temporel envoie un heartbeat toutes les 60 s même si l'utilisateur
 *    ne bouge pas, pour maintenir la fraîcheur côté serveur.
 */
export function usePresence(isEnabled) {
  const { updateUser } = useContext(UserContext);
  const intervalRef = useRef(null);
  const watcherRef = useRef(null);
  const inFlightRef = useRef(false);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }

    const sendHeartbeat = async (coords) => {
      try {
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
        inFlightRef.current = true;

        const startTime = Date.now();
        try {
          const res = await post('/user/heartbeat', { lat, lon });
          if (res?.user) updateUser(mapBackendUser(res.user));
          lastSentAtRef.current = Date.now();
          const duration = Date.now() - startTime;
          console.log(`[usePresence] Foreground heartbeat sent successfully in ${duration}ms`);
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
          try { watcherRef.current.remove(); } catch {}
          watcherRef.current = null;
        }
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            // Heartbeat dès qu'on bouge de ~20 m (entrée/sortie de POI réactives).
            distanceInterval: 20,
            // Et au pire toutes les 30 s (sécurité).
            timeInterval: 30000,
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
      // Fallback : forcer un heartbeat toutes les 60s si rien n'a été envoyé entre-temps
      intervalRef.current = setInterval(() => {
        if (Date.now() - lastSentAtRef.current >= 60000) {
          sendHeartbeat();
        }
      }, 60000);
    };

    const stopHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      if (watcherRef.current) {
        try { watcherRef.current.remove(); } catch {}
        watcherRef.current = null;
      }
    };

    // Gérer les changements d'état de l'app (Foreground/Background)
    const subscription = AppState.addEventListener('change', nextAppState => {
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
  }, [isEnabled, updateUser]);
}

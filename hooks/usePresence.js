import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { post } from '../components/ApiRequest';

/**
 * Hook pour gérer le "Heartbeat" (battement de cœur) de présence en premier plan.
 * Envoie périodiquement la position de l'utilisateur au backend toutes les minutes
 * quand l'application est active.
 */
export function usePresence(isEnabled) {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isEnabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const sendHeartbeat = async () => {
      try {
        // On récupère la position actuelle
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });

        if (pos?.coords) {
          await post('/user/heartbeat', {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          console.log('[usePresence] Foreground heartbeat sent');
        }
      } catch (err) {
        console.warn('[usePresence] Heartbeat failed:', err);
      }
    };

    const startHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Envoyer un heartbeat immédiatement
      sendHeartbeat();
      // Puis toutes les minutes (60000ms)
      intervalRef.current = setInterval(sendHeartbeat, 60000);
    };

    const stopHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
  }, [isEnabled]);
}

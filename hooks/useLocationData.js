import { useState, useEffect, useCallback } from 'react';
import { getLocationById } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';

/**
 * Hook réutilisable pour gérer les données d'un lieu (Location) et sa liste d'utilisateurs.
 * Gère le chargement initial, le rafraîchissement manuel et l'auto-rafraîchissement sur mutation.
 * 
 * @param {string} locationId - L'ID du lieu à charger
 * @returns {object} { location, users, loading, refreshing, refresh }
 */
export function useLocationData(locationId) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(null);
  const [users, setUsers] = useState([]);

  const fetchDetails = useCallback(async (isRefreshing = false) => {
    if (!locationId) return;
    try {
      if (!isRefreshing) setLoading(true);
      const res = await getLocationById(locationId);
      if (res && res.location) {
        const loc = res.location;
        const userCount = res.users?.length || 0;
        const stars = typeof loc.stars === 'number' ? loc.stars : parseInt(loc.stars, 10) || 0;

        setLocation({ ...loc, stars, userCount });
        setUsers(res.users || []);
      }
    } catch (e) {
      console.error('[useLocationData] Error:', e);
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  }, [locationId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDetails(true);
    setRefreshing(false);
  }, [fetchDetails]);

  useEffect(() => {
    fetchDetails();

    // Auto-rafraîchissement lors d'une mutation (changement de statut, profil, etc.)
    const unsub = subscribe('api:mutation', ({ path }) => {
      // On rafraîchit si la mutation concerne l'utilisateur ou son profil
      if (path.includes('/user/') || path.includes('/profile') || path.includes('/settings')) {
        fetchDetails(true);
      }
    });

    return () => unsub();
  }, [locationId, fetchDetails]);

  return {
    location,
    users,
    loading,
    refreshing,
    refresh
  };
}

import { useState, useEffect, useCallback } from 'react';
import { getLocationById } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';

/**
 * Hook réutilisable pour gérer les données d'un lieu (Location) et sa liste d'utilisateurs.
 * Gère le chargement initial, le rafraîchissement manuel et l'auto-rafraîchissement sur mutation.
 *
 * @param {string} locationId - L'ID du lieu à charger
 * @param {object} [initialLocation] - Données déjà connues (ex. venant de la liste des
 *   lieux autour de soi) pour un affichage instantané, sans spinner, en attendant le
 *   rafraîchissement silencieux en arrière-plan.
 * @returns {object} { location, users, loading, refreshing, refresh }
 */
export function useLocationData(locationId, initialLocation) {
  const [loading, setLoading] = useState(!initialLocation);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(() => {
    if (!initialLocation) return null;
    const stars =
      typeof initialLocation.stars === 'number' ? initialLocation.stars : parseInt(initialLocation.stars, 10) || 0;
    return { ...initialLocation, stars, userCount: initialLocation.userCount ?? 0 };
  });
  const [users, setUsers] = useState([]);
  const [monthlyUsers, setMonthlyUsers] = useState(0);

  const fetchDetails = useCallback(
    async (isRefreshing = false) => {
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
          setMonthlyUsers(typeof res.monthlyUsers === 'number' ? res.monthlyUsers : loc.popularity || 0);
        }
      } catch (e) {
        console.error('[useLocationData] Error:', e);
      } finally {
        if (!isRefreshing) setLoading(false);
      }
    },
    [locationId],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDetails(true);
    setRefreshing(false);
  }, [fetchDetails]);

  useEffect(() => {
    // Si on a déjà des données (venant de la liste), on affiche instantanément
    // et on ne rafraîchit qu'en silence, sans jamais réafficher le spinner.
    fetchDetails(!!initialLocation);

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
    monthlyUsers,
    loading,
    refreshing,
    refresh,
  };
}

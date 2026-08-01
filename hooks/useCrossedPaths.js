import { useState, useEffect, useCallback } from 'react';
import { getCrossedPathsUsers } from '../components/ApiRequest';

const LIMIT = 20;

/**
 * Hook pour la section "Croisé récemment" de LocationScreen : liste paginée
 * des utilisateurs croisés à ce lieu (24h en gratuit, 7j en Premium — la
 * fenêtre est appliquée côté backend selon le statut Premium du viewer).
 *
 * @param {string} locationId
 * @returns {object} { items, loading, loadingMore, hasMore, loadMore, refresh, isPremium }
 */
export function useCrossedPaths(locationId) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (pageNum, append) => {
      if (!locationId) return;
      const res = await getCrossedPathsUsers(locationId, { page: pageNum, limit: LIMIT });
      setItems((prev) => (append ? [...prev, ...(res.items || [])] : res.items || []));
      setTotal(res.total || 0);
      setIsPremium(!!res.isPremium);
      setPage(pageNum);
    },
    [locationId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(1, false)
      .catch((e) => console.error('[useCrossedPaths] Error:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, true);
    } catch (e) {
      console.error('[useCrossedPaths] loadMore error:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [page, items.length, total, loadingMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(1, false), [fetchPage]);

  return {
    items,
    loading,
    loadingMore,
    hasMore: items.length < total,
    loadMore,
    refresh,
    isPremium,
  };
}

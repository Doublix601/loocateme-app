import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFeatureFlags } from '../ApiRequest';

const FeatureFlagsContext = createContext({
  flags: {},
  loading: true,
  purchasesReady: false,
  error: null,
  refresh: () => {},
});

export function FeatureFlagsProvider({ children, ready = false }) {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (options = {}) => {
    const { force = false } = options;
    setLoading(true);
    setError(null);
    try {
      const res = await getFeatureFlags({ cache: force ? 'reload' : 'default' });
      setFlags(res?.flags || {});
    } catch (e) {
      console.warn('[FeatureFlags] Failed to fetch flags:', e?.message || e);
      setError(e?.message || 'Erreur lors du chargement des flags');
      // Keep previous flags on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, purchasesReady: ready, error, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// Helper hooks for specific flags
export function usePremiumEnabled() {
  const { flags } = useFeatureFlags();
  return flags.premiumEnabled ?? false;
}

export function useStatisticsEnabled() {
  const { flags } = useFeatureFlags();
  return flags.statisticsEnabled ?? false;
}

export function useBoostEnabled() {
  const { flags } = useFeatureFlags();
  return flags.boostEnabled ?? true; // Par défaut actif si pas spécifié
}

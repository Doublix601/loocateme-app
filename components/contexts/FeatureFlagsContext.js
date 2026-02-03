import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFeatureFlags } from '../ApiRequest';

const FeatureFlagsContext = createContext({
  flags: {},
  loading: true,
  error: null,
  refresh: () => {},
});

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFeatureFlags();
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
    <FeatureFlagsContext.Provider value={{ flags, loading, error, refresh }}>
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

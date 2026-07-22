import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as api from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { usePremiumAccess } from './usePremiumAccess';
import ProfileBoostService from '../services/ProfileBoostService';
import PremiumService from '../services/PremiumService';

export function useBoost() {
  const [loading, setLoading] = useState(false);
  const [boostBalance, setBoostBalance] = useState(() => PremiumService.getBoostsRemaining());
  const { boostUntil, updateUser } = usePremiumAccess();

  const isBoosted = ProfileBoostService.isActive(boostUntil);

  const activateBoost = useCallback(
    async (locationId) => {
      if (loading) return;
      setLoading(true);
      try {
        const result = await ProfileBoostService.activateWithConfirm(
          locationId,
          boostUntil instanceof Date ? boostUntil.toISOString() : boostUntil,
        );

        if (result.success) {
          setBoostBalance(PremiumService.getBoostsRemaining());
          try {
            const res = await api.get('/user/me');
            if (res?.user && updateUser) updateUser(res.user);
          } catch (_) {}
        } else if (result.reason === 'no_boosts') {
          publish('ui:open_consumables', { type: 'boost' });
        }
      } catch (e) {
        if (!e?.userCancelled) {
          Alert.alert('Erreur', e?.message || "Impossible d'activer le boost.");
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, boostUntil, updateUser],
  );

  return {
    activateBoost,
    loading,
    boostBalance,
    isBoosted,
    boostUntil,
  };
}

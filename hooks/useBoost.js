import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import Purchases from 'react-native-purchases';
import { api } from '../components/ApiRequest';
import { usePremiumAccess } from './usePremiumAccess';

export function useBoost() {
  const [loading, setLoading] = useState(false);
  const { boostBalance, isBoosted, boostUntil, purchasesReady, updateUser } = usePremiumAccess();

  const purchaseBoost = useCallback(async () => {
    if (!purchasesReady) {
      Alert.alert('Patientez...', 'Le service d\'achat est en cours d\'initialisation.');
      return;
    }
    setLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        const boostPackage = offerings.current.availablePackages.find(
          pkg => pkg.product.identifier === 'boost'
        );

        if (!boostPackage) {
          throw new Error('Produit Boost non trouvé dans les offres.');
        }

        await Purchases.purchasePackage(boostPackage);
        // Le webhook s'occupera de mettre à jour la DB, mais on rafraîchit le profil pour voir l'effet
        const res = await api.get('/user/me');
        if (res?.user && updateUser) {
          updateUser(res.user);
        }
      } else {
        throw new Error('Aucune offre disponible.');
      }
    } catch (e) {
      if (!e.userCancelled) {
        console.error('[useBoost] Purchase Error:', e);
        Alert.alert('Erreur', e.message || 'Impossible de finaliser l\'achat.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const activateBoost = useCallback(async () => {
    // ONE-TAP: Si déjà boosté, on ne fait rien (bouton normalement désactivé en amont)
    if (isBoosted) return;

    // Si on a déjà un crédit de boost (ex: via abonnement Premium), on l'active directement
    if (boostBalance > 0) {
      setLoading(true);
      try {
        await api.post('/premium/boost/activate');
        const res = await api.get('/user/me'); // Refresh context
        if (res?.user && updateUser) {
          updateUser(res.user);
        }
        Alert.alert('Activé !', 'Votre profil est maintenant boosté pour 1 heure.');
      } catch (e) {
        console.error('[useBoost] Activation Error:', e);
        Alert.alert('Erreur', e.response?.data?.message || 'Impossible d\'activer le boost.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Sinon, déclenchement DIRECT de l'achat RevenueCat
    await purchaseBoost();
  }, [boostBalance, isBoosted, purchaseBoost, purchasesReady, updateUser]);

  return {
    purchaseBoost,
    activateBoost,
    loading,
    boostBalance,
    isBoosted,
    boostUntil
  };
}

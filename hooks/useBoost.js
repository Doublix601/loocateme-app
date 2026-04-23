import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import Purchases from 'react-native-purchases';
import * as api from '../components/ApiRequest';
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
      // Debug: Log all available offerings and package identifiers
      console.log('[useBoost] Offerings:', JSON.stringify(offerings, null, 2));

      const currentOffering = offerings.current;
      if (!currentOffering) {
        console.warn('[useBoost] No current offering found.');
        // En mode dev, on peut simuler un succès pour tester l'UI
        if (__DEV__) {
          Alert.alert('Mode Test', 'Simulation d\'achat réussi (Offre absente)');
          await api.post('/premium/boost/activate', { isMock: true }); // Simule l'activation côté serveur
          const res = await api.get('/user/me');
          if (res?.user && updateUser) updateUser(res.user);
          return;
        }
        throw new Error('Aucune offre active trouvée.');
      }

      const availablePackages = currentOffering.availablePackages || [];
      console.log('[useBoost] Available Packages:', availablePackages.map(pkg => pkg.product?.identifier || pkg.identifier));

      const boostPackage = availablePackages.find(
        pkg => pkg.product?.identifier === 'boost' || pkg.identifier === 'boost' || pkg.identifier === '$rc_boost'
      );

      if (!boostPackage) {
        console.warn('[useBoost] Product "boost" not found in current offering.');

        // Mock success in DEV if product is missing
        if (__DEV__) {
          Alert.alert('Mode Test', 'Simulation d\'achat réussi (Produit "boost" manquant)');
          await api.post('/premium/boost/activate', { isMock: true });
          const res = await api.get('/user/me');
          if (res?.user && updateUser) updateUser(res.user);
          return;
        }
        throw new Error('Le produit Boost n\'est pas disponible pour le moment.');
      }

      // Safe call to purchase
      const purchaseResult = await Purchases.purchasePackage(boostPackage);
      console.log('[useBoost] Purchase Success:', purchaseResult);

      // Refresh user profile
      const res = await api.get('/user/me');
      if (res?.user && updateUser) {
        updateUser(res.user);
      }
    } catch (e) {
      if (!e.userCancelled) {
        console.error('[useBoost] Purchase Error:', e);

        // Final fallback for DEV
        if (__DEV__ && (e.message?.includes('Test purchase failure') || e.message?.includes('no real transaction'))) {
          Alert.alert('Mode Test', 'Achat simulé avec succès malgré l\'erreur du store.');
          await api.post('/premium/boost/activate', { isMock: true });
          const res = await api.get('/user/me');
          if (res?.user && updateUser) updateUser(res.user);
          return;
        }

        Alert.alert('Erreur', e.message || 'Impossible de finaliser l\'achat.');
      }
    } finally {
      setLoading(false);
    }
  }, [purchasesReady, updateUser]);

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
        Alert.alert('Activé !', 'Votre profil est maintenant boosté pour 30 min.');
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

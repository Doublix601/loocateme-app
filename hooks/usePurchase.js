import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import Purchases from 'react-native-purchases';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';

export const usePurchase = () => {
  const { purchasesReady } = useFeatureFlags();
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (purchasesReady) {
      fetchOfferings();
    }
  }, [purchasesReady]);

  const fetchOfferings = async () => {
    if (!purchasesReady) return;
    try {
      const fetchedOfferings = await Purchases.getOfferings();
      if (fetchedOfferings.current !== null) {
        setOfferings(fetchedOfferings.current);
      }
    } catch (e) {
      console.error('[usePurchase] Error fetching offerings:', e);
      setError(e);
    }
  };

  const purchasePackage = async (pkg) => {
    if (!purchasesReady) {
      Alert.alert('Patientez...', 'Le service d\'achat est en cours d\'initialisation.');
      return { success: false };
    }
    setLoading(true);
    setError(null);
    try {
      // En mode développement, on simule parfois l'achat pour éviter le blocage du Test Store
      if (__DEV__ && pkg.identifier === 'mock_success') {
        return { success: true, isMock: true };
      }

      const { purchaserInfo } = await Purchases.purchasePackage(pkg);

      // Handle premium entitlement
      if (purchaserInfo?.entitlements?.active && typeof purchaserInfo.entitlements.active['premium'] !== 'undefined') {
        // Entitlement is active
        return { success: true, purchaserInfo };
      }

      return { success: true, purchaserInfo };
    } catch (e) {
      if (!e.userCancelled) {
        // En mode dev, l'erreur code 5 "Test purchase failure" est fréquente sur simulateur
        // On la traite de façon plus souple pour ne pas polluer les logs ou l'UI
        if (__DEV__ && (e.code === '5' || e.message?.includes('Test purchase failure'))) {
          console.warn('[usePurchase] Test purchase detected (Sandbox/Sim):', e.message);
          // On peut retourner success: true pour tester le flux UI en dev si besoin
          // ou simplement éviter l'Alert effrayante
          return { success: true, isMock: true };
        }

        console.error('[usePurchase] Purchase error:', e);
        setError(e);

        if (e.code === Purchases.PURCHASE_ERROR_CODES.IAP_NOT_AVAILABLE_ERROR) {
          Alert.alert('Store Unavailable', 'In-app purchases are not available on this device.');
        } else {
          Alert.alert('Purchase Error', e.message || 'An error occurred during the purchase.');
        }
      }
      return { success: false, error: e };
    } finally {
      setLoading(false);
    }
  };

  return {
    offerings,
    loading,
    error,
    purchasePackage,
    refreshOfferings: fetchOfferings
  };
};

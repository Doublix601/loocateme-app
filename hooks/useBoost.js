import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import Purchases from 'react-native-purchases';
import { api } from '../components/ApiRequest';
import { usePremiumAccess } from './usePremiumAccess';

export function useBoost() {
  const [loading, setLoading] = useState(false);
  const { boostBalance, isBoosted, boostUntil } = usePremiumAccess();

  const purchaseBoost = useCallback(async () => {
    setLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        // Supposons que le package boost est identifiable par son identifiant produit
        const boostPackage = offerings.current.availablePackages.find(
          pkg => pkg.product.identifier === 'com.loocateme.boost.single'
        );

        if (!boostPackage) {
          throw new Error('Produit Boost non trouvé dans les offres.');
        }

        await Purchases.purchasePackage(boostPackage);
        // Le webhook s'occupera de mettre à jour la DB, mais on peut rafraîchir le profil
        await api.get('/user/me'); 
        Alert.alert('Succès', 'Votre boost a été acheté !');
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
    if (isBoosted) {
      Alert.alert('Info', 'Vous avez déjà un boost actif.');
      return;
    }

    if (boostBalance <= 0) {
      Alert.alert('Aucun Boost', 'Voulez-vous en acheter un ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Acheter', onPress: purchaseBoost }
      ]);
      return;
    }

    setLoading(true);
    try {
      await api.post('/premium/boost/activate');
      await api.get('/user/me'); // Refresh
      Alert.alert('Activé !', 'Votre profil est maintenant boosté pour 1 heure.');
    } catch (e) {
      console.error('[useBoost] Activation Error:', e);
      Alert.alert('Erreur', e.response?.data?.message || 'Impossible d\'activer le boost.');
    } finally {
      setLoading(false);
    }
  }, [boostBalance, isBoosted, purchaseBoost]);

  return {
    purchaseBoost,
    activateBoost,
    loading,
    boostBalance,
    isBoosted,
    boostUntil
  };
}

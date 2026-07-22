import { usePremiumAccess } from './usePremiumAccess';
import { Alert } from 'react-native';

/**
 * useFeatureGate
 *
 * Provides a unified way to gate features and handle missing permissions gracefully.
 */
export function useFeatureGate() {
  const premiumAccess = usePremiumAccess();

  const checkAccess = (feature, options = { silent: false }) => {
    let hasAccess = false;
    let title = 'Fonctionnalité Premium';
    let message = 'Cette fonctionnalité est réservée aux abonnés Premium.';

    switch (feature) {
      case 'statistics':
        hasAccess = premiumAccess.hasStatsAccess;
        title = 'Statistiques Premium';
        message = premiumAccess.premiumSystemEnabled
          ? 'Passez Premium pour accéder à vos statistiques détaillées.'
          : 'Les statistiques sont temporairement indisponibles.';
        break;

      case 'boost':
        hasAccess = premiumAccess.canAccessBoost;
        title = 'Boost Indisponible';
        message = 'Le système de Boost est temporairement désactivé.';
        break;

      case 'invisible':
        hasAccess = premiumAccess.isPremium;
        title = 'Mode invisible Premium';
        message = 'Passez Premium pour activer le mode invisible et disparaître de la liste des utilisateurs proches.';
        break;

      case 'extended_radius':
        hasAccess = premiumAccess.isPremium;
        title = 'Rayon étendu Premium';
        message = "Passez Premium pour explorer jusqu'à 2 km autour de vous (500 m en version gratuite).";
        break;

      default:
        hasAccess = false;
    }

    if (!hasAccess && !options.silent) {
      Alert.alert(title, message);
    }

    return hasAccess;
  };

  return {
    ...premiumAccess,
    checkAccess,
  };
}

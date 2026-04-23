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
    let title = 'Feature Restricted';
    let message = 'This feature requires a Premium subscription.';

    switch (feature) {
      case 'statistics':
        hasAccess = premiumAccess.hasStatsAccess;
        title = 'Statistics Restricted';
        message = premiumAccess.premiumSystemEnabled
          ? 'Upgrade to Premium to access detailed statistics.'
          : 'Statistics are currently unavailable.';
        break;

      case 'boost':
        // Boost is available to all if the system is enabled
        hasAccess = premiumAccess.canAccessBoost;
        title = 'Boost Indisponible';
        message = 'Le système de Boost est temporairement désactivé.';
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
    checkAccess
  };
}

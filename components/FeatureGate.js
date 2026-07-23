import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { useProgressiveUnlock } from '../hooks/useProgressiveUnlock';
import { useTheme } from './contexts/ThemeContext';

/**
 * FeatureGate
 * Composant wrapper pour gérer l'accès aux fonctionnalités Premium, système, ou
 * en cours de déblocage progressif.
 *
 * @param {string} feature - Nom de la fonctionnalité (ex: 'statistics', 'stories', 'boost', 'superlike')
 * @param {function} fallback - Composant ou fonction de rendu alternatif
 * @param {boolean} hideImplicitly - Si true, le composant est caché sans message s'il n'y a pas d'accès
 */
export const FeatureGate = ({ children, feature = 'statistics', fallback, hideImplicitly = false, style }) => {
  const { hasStatsAccess, effectiveStatisticsEnabled, canAccessBoost } = usePremiumAccess();
  const { storiesUnlocked, boostUnlocked, superlikeUnlocked } = useProgressiveUnlock();
  const { colors } = useTheme();

  let hasAccess = false;
  let isSystemEnabled = true;
  let progressiveLocked = false;
  let progressiveMessage = '';

  if (feature === 'statistics') {
    hasAccess = hasStatsAccess;
    isSystemEnabled = effectiveStatisticsEnabled;
  } else if (feature === 'stories') {
    hasAccess = true;
    progressiveLocked = !storiesUnlocked;
    progressiveMessage = 'Débloqué après ton premier check-in';
  } else if (feature === 'boost') {
    hasAccess = canAccessBoost;
    progressiveLocked = canAccessBoost && !boostUnlocked;
    progressiveMessage = 'Débloqué après 2 check-ins (ou un superlike envoyé)';
  } else if (feature === 'superlike') {
    hasAccess = true;
    progressiveLocked = !superlikeUnlocked;
    progressiveMessage = 'Débloqué après ton premier check-in';
  }

  // Fonctionnalité pas encore débloquée pour ce nouvel utilisateur (pas un verrou Premium)
  if (progressiveLocked) {
    if (hideImplicitly) return null;
    return (
      <View style={[styles.gateContainer, style]}>
        <View style={styles.progressiveBadge}>
          <Text style={styles.progressiveText}>🔓 Bientôt</Text>
        </View>
        <Text style={[styles.gateText, { color: colors.textPrimary }]}>{progressiveMessage}</Text>
      </View>
    );
  }

  // Si la fonctionnalité n'est pas activée au niveau système (flag OFF)
  if (!isSystemEnabled) {
    if (hideImplicitly) return null;
    return (
      <View style={[styles.gateContainer, style]}>
        <Text style={[styles.gateText, { color: colors.textPrimary, opacity: 0.5 }]}>Bientôt disponible</Text>
      </View>
    );
  }

  // Si l'utilisateur n'a pas les droits (pas Premium)
  if (!hasAccess) {
    if (hideImplicitly) return null;
    if (fallback) return fallback;

    return (
      <View style={[styles.gateContainer, style]}>
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumText}>PREMIUM</Text>
        </View>
        <Text style={[styles.gateText, { color: colors.textPrimary }]}>Réservé aux membres Premium</Text>
      </View>
    );
  }

  return children;
};

const styles = StyleSheet.create({
  gateContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(0,194,203,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.1)',
    marginVertical: 10,
  },
  gateText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  premiumBadge: {
    backgroundColor: '#f1c40f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    marginBottom: 8,
  },
  premiumText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
  progressiveBadge: {
    backgroundColor: 'rgba(0,194,203,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    marginBottom: 8,
  },
  progressiveText: {
    color: '#00C2CB',
    fontSize: 10,
    fontWeight: '900',
  },
});

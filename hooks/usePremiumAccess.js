import { useContext } from 'react';
import { UserContext } from '../components/contexts/UserContext';
import { usePremiumEnabled, useStatisticsEnabled, useBoostEnabled } from '../components/contexts/FeatureFlagsContext';

/**
 * Hook centralisé pour gérer l'accès aux fonctionnalités Premium et Statistiques de LoocateMe.
 */
export function usePremiumAccess() {
  const { user } = useContext(UserContext);
  const premiumSystemEnabled = usePremiumEnabled();
  const statisticsSystemEnabled = useStatisticsEnabled();
  const boostSystemEnabled = useBoostEnabled();

  // Statut de l'utilisateur (Indépendant des flags système)
  const isUserPremium = !!user?.isPremium;
  const isUserModeratorOrAdmin = ['admin', 'moderator'].includes(user?.role);

  // L'utilisateur a le droit d'accès au premium si isPremium ou s'il est staff
  const hasPremiumRight = isUserPremium || isUserModeratorOrAdmin;

  // ACCÈS EFFECTIF : Combiner le droit de l'utilisateur avec l'activation système
  // Si le système premium est désactivé (OFF), personne n'est considéré premium (pour le front)
  const isPremiumActive = premiumSystemEnabled && hasPremiumRight;

  // ACCÈS AUX STATS : (statisticsSystemEnabled || premiumSystemEnabled) && (si premiumSystemEnabled ON, alors hasPremiumRight requis)
  const effectiveStatisticsEnabled = statisticsSystemEnabled || premiumSystemEnabled;
  // Strict Gating Logic: If premium system is enabled, user MUST have premium right to access stats.
  const hasStatsAccess = effectiveStatisticsEnabled && (!premiumSystemEnabled || hasPremiumRight);

  // ACCÈS AUX BOOSTS : Ouvert à tous si boostSystemEnabled est ON
  const canAccessBoost = boostSystemEnabled;

  return {
    isPremium: isPremiumActive,          // Statut premium effectif
    hasStatsAccess,                     // Accès aux stats (respecte les flags et le statut)
    effectiveStatisticsEnabled,          // Ajout de l'accès effectif global
    canAccessBoost,                     // Accès aux boosts
    premiumSystemEnabled,               // État du flag global
    statisticsSystemEnabled,            // État du flag stats
    boostSystemEnabled,                 // État du flag boost
    isUserPremium,                      // Statut brut isPremium de la DB
    isUserModeratorOrAdmin,             // Statut staff
    hasPremiumRight,                    // A le droit d'être premium
    boostBalance: user?.boostBalance || 0,
    boostUntil: user?.boostUntil ? new Date(user.boostUntil) : null,
    isBoosted: user?.boostUntil && new Date(user.boostUntil) > new Date()
  };
}

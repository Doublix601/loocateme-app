import { useContext } from 'react';
import { UserContext } from '../components/contexts/UserContext';
import { usePremiumEnabled, useStatisticsEnabled } from '../components/contexts/FeatureFlagsContext';

/**
 * Hook centralisé pour gérer l'accès aux fonctionnalités Premium et Statistiques de LoocateMe.
 */
export function usePremiumAccess() {
  const { user } = useContext(UserContext);
  const premiumSystemEnabled = usePremiumEnabled();
  const statisticsSystemEnabled = useStatisticsEnabled();

  // Statut de l'utilisateur (Indépendant des flags système)
  const isUserPremium = !!user?.isPremium;
  const isUserModeratorOrAdmin = ['admin', 'moderator'].includes(user?.role);

  // L'utilisateur a le droit d'accès au premium si isPremium ou s'il est staff
  const hasPremiumRight = isUserPremium || isUserModeratorOrAdmin;

  // ACCÈS EFFECTIF : Combiner le droit de l'utilisateur avec l'activation système
  // Si le système premium est désactivé (OFF), personne n'est considéré premium (pour le front)
  const isPremiumActive = premiumSystemEnabled && hasPremiumRight;

  // ACCÈS AUX STATS : (statisticsSystemEnabled || premiumSystemEnabled) && (si premiumSystemEnabled ON, alors hasPremiumRight requis)
  // C'est la logique complexe identifiée dans MyAccountScreen et StatisticsScreen
  const effectiveStatisticsEnabled = statisticsSystemEnabled || premiumSystemEnabled;
  const hasStatsAccess = effectiveStatisticsEnabled && (!premiumSystemEnabled || hasPremiumRight);

  return {
    isPremium: isPremiumActive,          // Statut premium effectif
    hasStatsAccess,                     // Accès aux stats (respecte les flags et le statut)
    premiumSystemEnabled,               // État du flag global
    statisticsSystemEnabled,            // État du flag stats
    isUserPremium,                      // Statut brut isPremium de la DB
    isUserModeratorOrAdmin,             // Statut staff
    hasPremiumRight                     // A le droit d'être premium
  };
}

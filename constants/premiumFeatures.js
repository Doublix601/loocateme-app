// Rayon de découverte (en mètres) pour la recherche de lieux à proximité.
// Doit rester aligné avec le backend (`findNearbyLocations` : gratuit 2 km,
// Premium 30 km). Les lieux applicatifs sont déjà plafonnés côté serveur ;
// côté client ces valeurs ne servent qu'aux POIs OpenStreetMap complémentaires
// injectés dans la liste (cf. LocationListScreen + OverpassService).
export const DISCOVERY_RADIUS_FREE_M = 2000;
export const DISCOVERY_RADIUS_PREMIUM_M = 30000;

// Le rayon Overpass Premium est volontairement borné bien en dessous des 30 km
// backend : une requête Overpass multi-catégories à 30 km dépasse le timeout de
// l'API publique et sature le thread JS au rendu de la liste.
export const OVERPASS_RADIUS_FREE_M = DISCOVERY_RADIUS_FREE_M;
export const OVERPASS_RADIUS_PREMIUM_M = 8000;

// Rayon Overpass effectif selon le gating premium. Quand le système premium est
// désactivé (`premiumSystemEnabled` false), tout le monde a le rayon étendu.
export function getOverpassRadiusM({ isPremium, premiumSystemEnabled }) {
  const unlocked = !premiumSystemEnabled || isPremium;
  return unlocked ? OVERPASS_RADIUS_PREMIUM_M : OVERPASS_RADIUS_FREE_M;
}

// Avantages Premium, utilisés à la fois par le paywall (carousel de vente)
// et par l'onboarding de bienvenue affiché juste après le passage au Premium.
// `t` est la fonction de traduction i18next (useTranslation), passée par l'appelant.
export function getPremiumSlides(t) {
  return [
    { emoji: '👀', title: t('premiumPaywall.slides.views.title'), desc: t('premiumPaywall.slides.views.desc') },
    { emoji: '🔥', title: t('premiumPaywall.slides.boosts.title'), desc: t('premiumPaywall.slides.boosts.desc') },
    { emoji: '⭐', title: t('premiumPaywall.slides.superlikes.title'), desc: t('premiumPaywall.slides.superlikes.desc') },
    { emoji: '🫥', title: t('premiumPaywall.slides.invisible.title'), desc: t('premiumPaywall.slides.invisible.desc') },
    { emoji: '🗺️', title: t('premiumPaywall.slides.radius.title'), desc: t('premiumPaywall.slides.radius.desc') },
    { emoji: '📊', title: t('premiumPaywall.slides.stats.title'), desc: t('premiumPaywall.slides.stats.desc') },
  ];
}

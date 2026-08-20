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

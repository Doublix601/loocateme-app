// Styles de tuiles MapLibre pour la vue carte, alignés sur le thème Sun/Moon
// (cf. hooks/useVibeTheme.js). La clé MapTiler est publique côté client
// (Expo `EXPO_PUBLIC_*`), comme pour RevenueCat — elle doit être restreinte
// par domaine/bundle ID dans le dashboard MapTiler, pas gardée secrète.
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;

const buildStyleUrl = (styleId) => `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_KEY}`;

// "basic-v2" (clair) pour la vibe Sun, "basic-v2-dark" (sombre) pour la
// vibe Moon — style MapTiler "base" (plus épuré que "streets", moins de
// labels/détails routiers), cohérent avec le fond clair/néon ailleurs dans l'app.
export const MAP_STYLE_URL_SUN = buildStyleUrl('basic-v2');
export const MAP_STYLE_URL_MOON = buildStyleUrl('basic-v2-dark');

export function getMapStyleUrl(isMoon) {
  return isMoon ? MAP_STYLE_URL_MOON : MAP_STYLE_URL_SUN;
}

export const isMapTilerConfigured = () => typeof MAPTILER_KEY === 'string' && MAPTILER_KEY.length > 0;

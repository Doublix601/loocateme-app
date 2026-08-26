// Hauteur estimée du tooltip (titre + description + barre de progression +
// boutons) : sert de budget d'espace pour garantir qu'il tient à l'écran,
// dans les deux directions (au-dessus ou en dessous de l'élément surligné).
export const SPOTLIGHT_ESTIMATED_HEIGHT = 260;
// Marge minimale sous la status bar / l'encoche, en dessous de laquelle le
// tooltip ne doit jamais remonter.
export const SPOTLIGHT_SAFE_TOP = 50;

// Position verticale (style `top`, en px) du tooltip d'onboarding, calculée
// pour qu'il reste toujours entièrement visible à l'écran.
//
// `sy`/`sh` : position/hauteur (en coordonnées écran) de l'élément surligné.
// `screenHeight` : hauteur de l'écran.
//
// Contrairement à l'ancienne heuristique (`sy + sh < H * 0.58`), qui ne
// regardait que le bas de l'élément, celle-ci compare l'espace réellement
// disponible au-dessus (`sy`) et en dessous (`screenHeight - (sy + sh)`) —
// un grand élément qui commence près du haut de l'écran (ex: la carte photo
// de profil) a peu de place au-dessus malgré un bas qui dépasse 58% de
// l'écran ; l'ancien calcul le plaçait quand même au-dessus, hors écran.
export function computeSpotlightTooltipTop({
  sy,
  sh,
  screenHeight,
  estimatedHeight = SPOTLIGHT_ESTIMATED_HEIGHT,
  safeTop = SPOTLIGHT_SAFE_TOP,
}) {
  const spaceBelow = screenHeight - (sy + sh);
  const showBelow = spaceBelow >= estimatedHeight || spaceBelow >= sy;
  const desiredTop = showBelow ? sy + sh + 16 : sy - 16 - estimatedHeight;
  return Math.min(Math.max(desiredTop, safeTop), screenHeight - estimatedHeight);
}

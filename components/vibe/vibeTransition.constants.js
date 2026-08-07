import { Easing } from 'react-native-reanimated';

// Durée du spin 360° de l'icône du FAB.
export const VIBE_SPIN_DURATION_MS = 450;

// Durée totale de la transition jour/nuit (overlay plein écran, tap manuel).
export const VIBE_TRANSITION_DURATION_MS = 3200;

// Plancher de durée pour beginVibeTransition.
export const VIBE_TRANSITION_MIN_MS = 900;

// Durée d'affichage du toast non bloquant pour le basculement automatique horaire.
export const VIBE_AMBIENT_PULSE_MS = 1800;

// Durée de la transition en mode "réduire les animations".
export const VIBE_REDUCED_MOTION_DURATION_MS = 1400;

// Fraction de la durée totale consacrée au fondu d'entrée de l'overlay (rapide/snappy).
export const VIBE_FADE_IN_RATIO = 0.05;

// Fraction de la durée totale consacrée au fondu de sortie de l'overlay (plus lent,
// délibérément asymétrique par rapport au fondu d'entrée).
export const VIBE_FADE_OUT_RATIO = 0.28;

// Fraction de la durée totale à laquelle setVibe(target) est réellement appliqué.
// Doit rester confortablement avant le début du fondu de sortie (1 - VIBE_FADE_OUT_RATIO)
// pour laisser le temps au re-render du nouveau thème pendant que l'overlay est encore opaque.
export const VIBE_THEME_SWAP_RATIO = 0.55;

// Écart de stagger entre les pills de contenu dans l'overlay.
export const VIBE_CONTENT_STAGGER_MS = 90;

export const VIBE_EASING = Easing.inOut(Easing.cubic);

import { Easing } from 'react-native-reanimated';

// Durée du spin 360° de l'icône du FAB.
export const VIBE_SPIN_DURATION_MS = 450;

// Durée totale de la transition jour/nuit (overlay plein écran, tap manuel).
export const VIBE_TRANSITION_DURATION_MS = 2200;

// Plancher de durée pour beginVibeTransition.
export const VIBE_TRANSITION_MIN_MS = 900;

// Durée d'affichage du toast non bloquant pour le basculement automatique horaire.
export const VIBE_AMBIENT_PULSE_MS = 1800;

// Durée de la transition en mode "réduire les animations".
export const VIBE_REDUCED_MOTION_DURATION_MS = 900;

// Écart de stagger entre les pills de contenu dans l'overlay.
export const VIBE_CONTENT_STAGGER_MS = 90;

export const VIBE_EASING = Easing.inOut(Easing.cubic);

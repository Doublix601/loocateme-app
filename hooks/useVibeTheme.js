import { useMemo } from 'react';
import { useVibe } from '../components/contexts/VibeContext';

/**
 * useVibeTheme — design tokens centralisés Day/Night.
 *
 * Toutes les valeurs visuelles "premium" du LocationScreen (et autres écrans refondus)
 * doivent passer par ce hook, afin d'éviter les `if (isMoon) ... else ...` éparpillés.
 *
 *  - sun  : Clean & Productif (fond clair, typo sombre, ombres douces)
 *  - moon : Néon Social (fond profond, typo blanche, gradients LoocateMe Rose/Bleu)
 */
export function useVibeTheme() {
  const { vibe, isMoon } = useVibe();

  return useMemo(() => {
    const palette = isMoon
      ? {
          // ── MOON ───────────────────────────────────────────────
          bg: '#050505',
          bgElevated: '#0E0E12',
          surface: 'rgba(255,255,255,0.06)',
          surfaceStrong: 'rgba(255,255,255,0.10)',
          overlay: 'rgba(0,0,0,0.55)',
          text: '#FFFFFF',
          textMuted: 'rgba(255,255,255,0.72)',
          textFaint: 'rgba(255,255,255,0.45)',
          border: 'rgba(255,255,255,0.10)',
          borderStrong: 'rgba(255,255,255,0.22)',
          accent: '#FF3DAD', // rose LoocateMe
          accentAlt: '#3DA9FF', // bleu LoocateMe
          accentSoft: 'rgba(255,61,173,0.18)',
          gradient: ['#FF3DAD', '#8A4BFF', '#3DA9FF'], // sweep néon
          heroGradient: ['rgba(5,5,5,0)', 'rgba(5,5,5,0.55)', 'rgba(5,5,5,1)'],
          heroFallback: ['#1B1030', '#0A0617'],
          shadow: 'rgba(255,61,173,0.35)',
        }
      : {
          // ── SUN ────────────────────────────────────────────────
          bg: '#F9F9F9',
          bgElevated: '#FFFFFF',
          surface: '#FFFFFF',
          surfaceStrong: '#FFFFFF',
          overlay: 'rgba(255,255,255,0.65)',
          text: '#0E1116',
          textMuted: '#4A5260',
          textFaint: '#8A93A1',
          border: 'rgba(14,17,22,0.08)',
          borderStrong: 'rgba(14,17,22,0.16)',
          accent: '#00C2CB',
          accentAlt: '#0091A0',
          accentSoft: 'rgba(0,194,203,0.12)',
          gradient: ['#00C2CB', '#5BD4D9'],
          heroGradient: ['rgba(249,249,249,0)', 'rgba(249,249,249,0.55)', 'rgba(249,249,249,1)'],
          heroFallback: ['#A8D8FF', '#87CEEB'],
          shadow: 'rgba(14,17,22,0.10)',
        };

    const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
    const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

    const shadows = isMoon
      ? {
          card: {
            shadowColor: palette.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 18,
            elevation: 0,
          },
          floating: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.6,
            shadowRadius: 24,
            elevation: 14,
          },
        }
      : {
          card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 3,
          },
          floating: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.14,
            shadowRadius: 24,
            elevation: 12,
          },
        };

    const typography = {
      h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: palette.text },
      h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.text },
      body: { fontSize: 14, fontWeight: '500', color: palette.textMuted },
      caption: { fontSize: 12, fontWeight: '600', color: palette.textFaint, letterSpacing: 0.4 },
    };

    return {
      vibe,
      isMoon,
      palette,
      radius,
      spacing,
      shadows,
      typography,
    };
  }, [vibe, isMoon]);
}

export default useVibeTheme;

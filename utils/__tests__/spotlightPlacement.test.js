import { computeSpotlightTooltipTop, SPOTLIGHT_ESTIMATED_HEIGHT, SPOTLIGHT_SAFE_TOP } from '../spotlightPlacement';

describe('computeSpotlightTooltipTop', () => {
  const H = 800;

  it('places the tooltip below a small element near the top of the screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 100, sh: 80, screenHeight: H });
    expect(top).toBe(100 + 80 + 16);
  });

  it('places the tooltip above a small element near the bottom of the screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 700, sh: 60, screenHeight: H });
    expect(top).toBe(700 - 16 - SPOTLIGHT_ESTIMATED_HEIGHT);
  });

  it('regression: a tall element starting near the top (ex: la carte photo de profil) no longer renders the tooltip off-screen above', () => {
    // sy petit (peu d'espace au-dessus) mais sy+sh dépasse 58% de l'écran :
    // l'ancienne heuristique plaçait le tooltip au-dessus avec un top négatif.
    const top = computeSpotlightTooltipTop({ sy: 50, sh: 450, screenHeight: H });
    expect(top).toBe(50 + 450 + 16); // assez de place en dessous -> tooltip en dessous
    expect(top).toBeGreaterThanOrEqual(SPOTLIGHT_SAFE_TOP);
    expect(top + SPOTLIGHT_ESTIMATED_HEIGHT).toBeLessThanOrEqual(H);
  });

  it('clamps the tooltip so it never overflows the bottom of a short screen', () => {
    const top = computeSpotlightTooltipTop({ sy: 100, sh: 200, screenHeight: 400 });
    expect(top).toBe(400 - SPOTLIGHT_ESTIMATED_HEIGHT);
    expect(top + SPOTLIGHT_ESTIMATED_HEIGHT).toBeLessThanOrEqual(400);
  });

  it('never renders above the safe top margin', () => {
    const top = computeSpotlightTooltipTop({ sy: 300, sh: 50, screenHeight: 400 });
    expect(top).toBeGreaterThanOrEqual(SPOTLIGHT_SAFE_TOP);
  });
});

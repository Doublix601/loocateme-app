import { haversineMeters } from '../geo';

// Parity check before deleting the 6 independently-duplicated copies of this
// formula (LocationService.js, LocationSyncService.js, locationSendGuard.js,
// CheckinVerificationScheduler.js, NearbyLocationPicker.js, ServerUtils.js).

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it('matches a known reference distance (Paris to Lyon, ~392km)', () => {
    const d = haversineMeters(48.8566, 2.3522, 45.764, 4.8357);
    expect(d).toBeGreaterThan(390000);
    expect(d).toBeLessThan(395000);
  });

  it('is symmetric', () => {
    const a = haversineMeters(48.8566, 2.3522, 45.764, 4.8357);
    const b = haversineMeters(45.764, 4.8357, 48.8566, 2.3522);
    expect(a).toBeCloseTo(b, 6);
  });
});

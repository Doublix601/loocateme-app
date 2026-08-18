// locationSendGuard now persists to AsyncStorage (cf. markSent/shouldSendPersisted)
// so BackgroundLocation.js can read it from a separate JS context. No
// AsyncStorage mock is configured project-wide (no jest setupFiles), so this
// file wires up the official in-memory mock itself.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// locationSendGuard has module-level mutable state (lastSentAt/lastCoords)
// shared across every caller (usePresence, LocationService, and — after the
// fix consolidating the 4 location-sending subsystems — LocationListScreen
// and BackgroundLocation too). jest.isolateModules gives each test a fresh
// module instance so tests don't leak state into each other.
function freshGuard() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../locationSendGuard');
  });
  return mod;
}

describe('locationSendGuard', () => {
  const PARIS = { lat: 48.8566, lon: 2.3522 };
  const NEARBY = { lat: 48.85665, lon: 2.35225 }; // ~6m away
  const FAR = { lat: 48.86, lon: 2.3522 }; // ~480m away

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows the very first send (no prior markSent)', () => {
    const { shouldSend } = freshGuard();
    expect(shouldSend(PARIS.lat, PARIS.lon)).toBe(true);
  });

  it('blocks a send that is both too soon and too close after markSent', () => {
    const { shouldSend, markSent } = freshGuard();
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    markSent(PARIS.lat, PARIS.lon);

    jest.spyOn(Date, 'now').mockReturnValue(now + 5000); // 5s later, still < 15s
    expect(shouldSend(NEARBY.lat, NEARBY.lon)).toBe(false);
  });

  it('allows a send once MIN_INTERVAL_MS has elapsed, even at the same spot', () => {
    const { shouldSend, markSent } = freshGuard();
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    markSent(PARIS.lat, PARIS.lon);

    jest.spyOn(Date, 'now').mockReturnValue(now + 15000); // exactly MIN_INTERVAL_MS
    expect(shouldSend(PARIS.lat, PARIS.lon)).toBe(true);
  });

  it('allows a send that moved far enough, even if it is soon after the last one', () => {
    const { shouldSend, markSent } = freshGuard();
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    markSent(PARIS.lat, PARIS.lon);

    jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // 1s later
    expect(shouldSend(FAR.lat, FAR.lon)).toBe(true);
  });

  it('force:true always allows a send regardless of timing/distance', () => {
    const { shouldSend, markSent } = freshGuard();
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    markSent(PARIS.lat, PARIS.lon);

    jest.spyOn(Date, 'now').mockReturnValue(now + 1);
    expect(shouldSend(NEARBY.lat, NEARBY.lon, { force: true })).toBe(true);
  });

  it('roundCoord rounds to ~11m precision (4 decimals), matching the backend cache key rounding', () => {
    const { roundCoord } = freshGuard();
    expect(roundCoord(48.856612345)).toBe(48.8566);
  });

  // BackgroundLocation.js (TaskManager task) can run in a separate JS context
  // from the rest of the app (app killed, headless task) where this module's
  // in-memory state is empty even if another module just sent a heartbeat —
  // same problem already solved for user_checkInMode via AsyncStorage.
  describe('cross-context persistence (shouldSendPersisted / markSent)', () => {
    it('markSent persists lastSentAt/lastCoords to AsyncStorage', async () => {
      let guard;
      let AsyncStorageMock;
      jest.isolateModules(() => {
        guard = require('../locationSendGuard');
        AsyncStorageMock = require('@react-native-async-storage/async-storage');
      });
      const now = 1_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      guard.markSent(PARIS.lat, PARIS.lon);
      await new Promise((resolve) => setImmediate(resolve)); // flush fire-and-forget setItem

      const raw = await AsyncStorageMock.getItem('location_send_guard_v1');
      expect(JSON.parse(raw)).toEqual({ lastSentAt: now, lastCoords: PARIS });
    });

    it('shouldSendPersisted adopts a send recorded in AsyncStorage by another context, blocking a near-duplicate', async () => {
      let guard;
      let AsyncStorageMock;
      jest.isolateModules(() => {
        guard = require('../locationSendGuard');
        AsyncStorageMock = require('@react-native-async-storage/async-storage');
      });
      const now = 1_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      // Simulates a write made moments ago by a different JS context (e.g.
      // BackgroundLocation.js) for a position close to PARIS.
      await AsyncStorageMock.setItem(
        'location_send_guard_v1',
        JSON.stringify({ lastSentAt: now, lastCoords: PARIS }),
      );

      jest.spyOn(Date, 'now').mockReturnValue(now + 5000); // 5s later, within MIN_INTERVAL_MS
      const result = await guard.shouldSendPersisted(NEARBY.lat, NEARBY.lon);
      expect(result).toBe(false);
    });

    it('shouldSendPersisted still allows a send when the persisted state is far away or stale', async () => {
      let guard;
      let AsyncStorageMock;
      jest.isolateModules(() => {
        guard = require('../locationSendGuard');
        AsyncStorageMock = require('@react-native-async-storage/async-storage');
      });
      const now = 1_000_000;
      await AsyncStorageMock.setItem(
        'location_send_guard_v1',
        JSON.stringify({ lastSentAt: now, lastCoords: PARIS }),
      );

      jest.spyOn(Date, 'now').mockReturnValue(now + 5000);
      const result = await guard.shouldSendPersisted(FAR.lat, FAR.lon);
      expect(result).toBe(true);
    });
  });
});

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, Low: 2, Lowest: 1 },
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));
jest.mock('../devLocationOverride', () => ({
  loadDevLocationOverride: jest.fn(),
  getDevLocationOverride: jest.fn(() => null),
}));

const Location = require('expo-location');
const { getPositionWithTimeout, getCurrentPositionSmart } = require('../locationHelper');

const POS = { coords: { latitude: 49.4, longitude: 2.8 } };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
});
afterEach(() => jest.useRealTimers());

describe('getPositionWithTimeout', () => {
  test("rejette au bout du délai si aucun signal n'arrive (getCurrentPositionAsync bloqué)", async () => {
    Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    const p = getPositionWithTimeout(Location.Accuracy.Balanced, 5000);
    const assertion = expect(p).rejects.toThrow('LOCATION_TIMEOUT');
    jest.advanceTimersByTime(5001);
    await assertion;
  });

  test('accepte le premier signal du suivi de position quand la demande ponctuelle reste bloquée', async () => {
    Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    let cb;
    Location.watchPositionAsync.mockImplementation((_opts, callback) => {
      cb = callback;
      return Promise.resolve({ remove: jest.fn() });
    });
    const p = getPositionWithTimeout(Location.Accuracy.Balanced, 5000);
    await Promise.resolve();
    cb(POS);
    await expect(p).resolves.toBe(POS);
  });
});

describe('getCurrentPositionSmart', () => {
  test('retombe sur la dernière position connue (même ancienne) quand tout expire', async () => {
    Location.getLastKnownPositionAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(POS);
    Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
    const p = getCurrentPositionSmart();
    // Balanced (10 s) puis Low (12 s) expirent, puis repli sur la dernière position connue.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
      jest.advanceTimersByTime(12001);
    }
    await expect(p).resolves.toBe(POS);
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockRequestForegroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args) => mockRequestForegroundPermissionsAsync(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateAfterAuth } from '../onboarding';

describe('navigateAfterAuth', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRequestForegroundPermissionsAsync.mockClear();
  });

  it('requests location permission once before sending a returning user straight to MainTabs', async () => {
    await AsyncStorage.setItem('loocateme_onboarding_done', 'true');
    const navigation = { reset: jest.fn() };

    await navigateAfterAuth(navigation);

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'MainTabs' }] });
  });

  it('does not request location permission for a first-time user routed to Onboarding (it is requested at the end of the slides instead)', async () => {
    const navigation = { reset: jest.fn() };

    await navigateAfterAuth(navigation);

    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Onboarding' }] });
  });
});

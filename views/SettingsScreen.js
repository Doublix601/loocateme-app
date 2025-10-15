import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Image,
  Dimensions,
  PanResponder,
  Alert,
} from 'react-native';

const { width, height } = Dimensions.get('window');

import { UserContext } from '../components/contexts/UserContext';
import { setVisibility as apiSetVisibility, logout as apiLogout } from '../components/ApiRequest';
import { startBackgroundLocationForOneHour, stopBackgroundLocation } from '../components/BackgroundLocation';

const SettingsScreen = ({ onReturnToAccount, onLogout }) => {
  const { user, updateUser } = useContext(UserContext);
  const [isVisible, setIsVisible] = useState(user?.isVisible ?? true);
  const [saving, setSaving] = useState(false);

  const saveAndReturn = async () => {
    try {
      setSaving(true);
      await apiSetVisibility(isVisible);
      if (updateUser) {
        updateUser({ ...user, isVisible });
      }
      // Start or stop background location according to new visibility
      try {
        if (isVisible) await startBackgroundLocationForOneHour();
        else await stopBackgroundLocation();
      } catch (_) {}
      onReturnToAccount && onReturnToAccount();
    } catch (e) {
      console.error('[SettingsScreen] Save visibility error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || 'Impossible de sauvegarder le paramètre');
    } finally {
      setSaving(false);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 50 || vx > 0.3) {
        saveAndReturn();
      }
    },
  });

  const toggleVisibility = () => setIsVisible((prevState) => !prevState);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={saveAndReturn}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Image
          source={require('../assets/appIcons/backArrow.png')}
          style={styles.backButtonImage}
        />
      </TouchableOpacity>
      <Text style={styles.title}>Paramètres</Text>

      <View style={styles.optionContainer}>
        <Text style={styles.optionText}>Être visible</Text>
        <Switch
          value={isVisible}
          onValueChange={toggleVisibility}
          trackColor={{ false: '#ccc', true: '#00c2cb' }}
          thumbColor={isVisible ? '#00c2cb' : '#f4f3f4'}
        />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={async () => { try { await apiLogout(); } catch(_) {} finally { onLogout && onLogout(); } }}>
        <Text style={styles.logoutText}>Déconnexion</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: width * 0.05,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  backButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: height * 0.05,
    color: '#00c2cb',
  },
  optionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionText: {
    fontSize: width * 0.05,
    color: '#333',
  },
  logoutButton: {
    marginTop: height * 0.05,
    backgroundColor: '#ff4d4d',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: width * 0.05,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default SettingsScreen;

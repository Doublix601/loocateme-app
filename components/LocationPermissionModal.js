import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useTheme } from './contexts/ThemeContext';
import { resetBackgroundPermissionPrompt } from '../utils/backgroundPermissionPrompt';
import { startBackgroundLocationForSixHours } from './BackgroundLocation';
import CloseButton from './CloseButton';

// Primer (écran de pré-permission) pour la position "Toujours".
//
// Ce n'est pas un prérequis de l'app : la localisation "Toujours" ne sert qu'au
// mode de check-in automatique — rester visible dans un lieu même sans ouvrir
// l'app. On l'affiche donc au moment pertinent (activation du mode auto, ou
// rappel plafonné), jamais à chaque lancement.
const LocationPermissionModal = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (onClose) onClose();
  };

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        if (reqFg.status !== 'granted') {
          Linking.openSettings();
          close();
          return;
        }
      }

      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        resetBackgroundPermissionPrompt();
        startBackgroundLocationForSixHours();
        close();
        return;
      }

      // iOS/Android : si on peut encore demander, la boîte de dialogue système
      // s'affiche. Sinon (déjà refusé une fois), il faut passer par les réglages.
      if (bg.canAskAgain === false) {
        Linking.openSettings();
        close();
        return;
      }

      const reqBg = await Location.requestBackgroundPermissionsAsync();
      if (reqBg.status === 'granted') {
        resetBackgroundPermissionPrompt();
        startBackgroundLocationForSixHours();
      } else if (reqBg.canAskAgain === false) {
        Linking.openSettings();
      }
    } catch (_) {
      Linking.openSettings();
    } finally {
      setBusy(false);
      close();
    }
  };

  const iosHint = Platform.OS === 'ios' ? t('locationPrimer.alwaysIosHint') : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <CloseButton onPress={close} style={styles.closeBtn} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('locationPrimer.alwaysTitle')}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{t('locationPrimer.alwaysDesc')}</Text>
          {iosHint ? <Text style={[styles.instructions, { color: colors.accent }]}>{iosHint}</Text> : null}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
              onPress={close}
              disabled={busy}
            >
              <Text style={[styles.buttonText, { color: colors.textSecondary }]}>{t('locationPrimer.later')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
              onPress={handleEnable}
              disabled={busy}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>{t('locationPrimer.enable')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  instructions: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 25,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LocationPermissionModal;

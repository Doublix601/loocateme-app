import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { useTheme } from './contexts/ThemeContext';

const LocationPermissionModal = ({ visible, type, onClose }) => {
  const { colors } = useTheme();

  const handleOpenSettings = () => {
    Linking.openSettings();
    if (onClose) onClose();
  };

  const isAlwaysType = type === 'always';

  const renderContent = () => {
    if (isAlwaysType) {
      const instructions = Platform.OS === 'ios'
        ? "Pour une expérience optimale, réglez l'autorisation sur \"Toujours\" dans les réglages de votre iPhone (Réglages > LoocateMe > Position)."
        : "Pour une expérience optimale, réglez l'autorisation sur \"Toujours\" dans les paramètres de votre Android (Paramètres > Applications > LoocateMe > Autorisations > Position).";

      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Position "Toujours"</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            L'application fonctionne mieux si vous autorisez la localisation en mode "Toujours". Cela permet de vous localiser même lorsque l'application est en arrière-plan.
          </Text>
          <Text style={[styles.instructions, { color: colors.accent }]}>
            {instructions}
          </Text>
        </>
      );
    }

    return (
      <>
        <Text style={[styles.title, { color: colors.danger }]}>Localisation requise</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          LoocateMe ne peut pas fonctionner sans accès à votre position. Veuillez activer la localisation dans les réglages de votre appareil pour continuer.
        </Text>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isAlwaysType ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          {renderContent()}

          <View style={styles.buttonContainer}>
            {isAlwaysType && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={[styles.buttonText, { color: colors.textSecondary }]}>Plus tard</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={handleOpenSettings}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>Ouvrir les réglages</Text>
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

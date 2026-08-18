import React from 'react';
import { View, Text, Modal, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';

const QrModal = ({ visible, onClose, colors, isDark, qrImageUri, qrUrl, qrSize, onImageError }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.accent }]}>Scanne pour voir mon profil</Text>
          {qrImageUri ? (
            <Image
              source={{ uri: qrImageUri }}
              style={{ width: qrSize, height: qrSize }}
              resizeMode="contain"
              onError={() => onImageError?.()}
            />
          ) : null}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Si l'app n'est pas installée, tu seras redirigé(e) vers le store (
            {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}).
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.accent }]}
            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          >
            <Text style={styles.closeButtonText}>✖</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    alignItems: 'center',
    padding: 16,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  hint: {
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.8,
  },
  closeButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 18,
  },
});

export default QrModal;

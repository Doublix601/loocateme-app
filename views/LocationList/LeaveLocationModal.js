import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

// Ouverte par appui long sur la carte du lieu où l'utilisateur est
// actuellement checké (cf. LocationCard.onLongPressHere) : propose un
// check-out manuel via forceCheckOut (cf. LocationListScreen.handleConfirmLeaveLocation).
const LeaveLocationModal = ({ visible, item, colors, isDark, loading, onConfirm, onClose }) => {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>
            {item?.name || t('locationList.leaveModal.defaultName')}
          </Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
            {t('locationList.leaveModal.subtitle')}
          </Text>

          <TouchableOpacity onPress={onConfirm} disabled={loading} style={styles.confirmTouchable}>
            <LinearGradient colors={colors.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.confirmButton}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>{t('locationList.leaveModal.confirm')}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} disabled={loading} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>{t('locationList.leaveModal.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: width * 0.06,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Math.max(20, height * 0.025),
  },
  confirmTouchable: {
    width: '100%',
    marginBottom: 10,
  },
  confirmButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  closeButton: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LeaveLocationModal;

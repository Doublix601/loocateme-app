import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

const StatusPickerModal = ({ visible, onClose, colors, isDark, currentStatus, onSelect }) => {
  const { t } = useTranslation();
  const STATUS_OPTIONS = [
    { key: 'green', label: t('myAccount.status.public'), color: '#4CAF50' },
    { key: 'orange', label: t('myAccount.status.private'), color: '#FF9800' },
    { key: 'red', label: t('myAccount.status.incognito'), color: '#F44336' },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.status.title')}</Text>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.optionRow,
                { borderColor: colors.border },
                currentStatus === opt.key && { backgroundColor: colors.accentSoft },
              ]}
              onPress={() => onSelect(opt.key)}
            >
              <View style={[styles.dot, { backgroundColor: opt.color }]} />
              <Text style={[styles.optionLabel, { color: isDark ? '#fff' : colors.textPrimary }]}>{opt.label}</Text>
              {currentStatus === opt.key ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.closeButtonText, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.status.close')}</Text>
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
    maxWidth: 500,
    borderRadius: 16,
    padding: width * 0.05,
  },
  modalTitle: {
    fontSize: width * 0.06,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: height * 0.02,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    padding: width * 0.03,
    borderRadius: 10,
    marginBottom: height * 0.01,
    width: '80%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  closeButtonText: {
    fontSize: width * 0.05,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

export default StatusPickerModal;

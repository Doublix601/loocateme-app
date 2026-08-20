import React from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, Image, StyleSheet, Pressable, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import socialMediaIcons from '../../constants/socialMediaIcons';

const { width, height } = Dimensions.get('window');

const EditSocialModal = ({ visible, onClose, colors, isDark, platform, value, onChangeValue, onSave, onDelete }) => {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={styles.modalBackButton}
            onPress={onClose}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          >
            <Image
              source={require('../../assets/appIcons/backArrow.png')}
              style={[styles.modalBackButtonImage, { tintColor: colors.accent }]}
            />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.accent }]}>{t('myAccount.social.editTitle', { platform })}</Text>
          <View style={[styles.inputWrapper, { borderColor: colors.accent, backgroundColor: isDark ? '#0f1115' : '#ffffff' }]}>
            {platform && socialMediaIcons[platform] ? (
              <Image source={socialMediaIcons[platform]} style={styles.inputPrefixIcon} />
            ) : null}
            <TextInput
              value={value}
              onChangeText={onChangeValue}
              placeholder={t('myAccount.social.usernamePlaceholderSimple')}
              placeholderTextColor={isDark ? '#666' : '#999'}
              style={[styles.wrappedInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={onDelete} style={[styles.iconRoundButton, { backgroundColor: colors.danger }]} accessibilityLabel={t('myAccount.social.delete')}>
              <Text style={[styles.iconEmoji, { color: isDark ? colors.background : '#fff', textAlign: 'center' }]}>✖</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={[styles.iconRoundButton, { backgroundColor: colors.accent }]} accessibilityLabel={t('myAccount.social.saveLabel')}>
              <Text style={styles.iconEmoji}>💾</Text>
            </TouchableOpacity>
          </View>
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: height * 0.06,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: height * 0.02,
  },
  inputPrefixIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
    resizeMode: 'contain',
  },
  wrappedInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: height * 0.01,
    marginBottom: height * 0.005,
  },
  iconRoundButton: {
    width: Math.min(width * 0.16, 64),
    height: Math.min(width * 0.16, 64),
    borderRadius: Math.min(width * 0.08, 32),
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  iconEmoji: {
    fontSize: Math.min(width * 0.08, 28),
    color: '#fff',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalBackButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1,
    padding: 8,
  },
  modalBackButtonImage: {
    width: 28,
    height: 28,
  },
});

export default EditSocialModal;

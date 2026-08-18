import React, { useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import socialMediaIcons from '../../constants/socialMediaIcons';

const { width, height } = Dimensions.get('window');

const AddSocialModal = ({
  visible,
  onClose,
  colors,
  isDark,
  selectedPlatform,
  onSelectPlatform,
  value,
  onChangeValue,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%' }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
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
            <Text style={[styles.modalTitle, { color: colors.accent }]}>Ajouter un réseau</Text>
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Math.max(24, height * 0.05) }}
            >
              <View style={styles.iconContainer}>
                {Object.keys(socialMediaIcons).map((platform) => (
                  <TouchableOpacity
                    key={platform}
                    onPress={() => {
                      onSelectPlatform(platform);
                      setTimeout(() => {
                        inputRef.current?.focus();
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 50);
                    }}
                    style={[
                      styles.tile,
                      selectedPlatform === platform && [styles.selectedTile, { borderColor: colors.accent }],
                      selectedPlatform === platform && { backgroundColor: colors.border + '40' },
                    ]}
                  >
                    <Image
                      source={socialMediaIcons[platform]}
                      style={[styles.tileIcon, selectedPlatform !== platform && { opacity: 0.6 }]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    borderColor: selectedPlatform ? colors.accent : colors.border,
                    backgroundColor: isDark ? '#0f1115' : '#ffffff',
                  },
                ]}
              >
                {selectedPlatform ? (
                  <Image source={socialMediaIcons[selectedPlatform]} style={styles.inputPrefixIcon} />
                ) : null}
                <TextInput
                  ref={inputRef}
                  value={value}
                  onChangeText={onChangeValue}
                  placeholder={selectedPlatform ? `@username ou ID ${selectedPlatform}` : 'Sélectionnez un réseau'}
                  placeholderTextColor={isDark ? '#666' : '#999'}
                  style={[styles.wrappedInput, { color: colors.textPrimary }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onFocus={() => {
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
                  }}
                />
              </View>
              {selectedPlatform === 'Snapchat' && (
                <Text style={styles.modalHint}>
                  Note: Snapchat n'autorise pas les liens directs, entrez juste votre nom d'utilisateur.
                </Text>
              )}
            </ScrollView>
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={onSave}
                style={[
                  styles.iconRoundButton,
                  { backgroundColor: colors.accent },
                  (!selectedPlatform || !value) && { opacity: 0.5 },
                ]}
                disabled={!selectedPlatform || !value}
                accessibilityLabel="Enregistrer"
              >
                <Text style={styles.iconEmoji}>💾</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  iconContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height * 0.015,
    marginHorizontal: width * 0.02,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTile: {
    borderWidth: 2,
  },
  tileIcon: {
    width: Math.min(width * 0.12, 44),
    height: Math.min(width * 0.12, 44),
    resizeMode: 'contain',
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
  modalHint: {
    fontSize: 12,
    color: '#fff',
    alignSelf: 'flex-start',
    marginBottom: height * 0.01,
    opacity: 0.7,
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

export default AddSocialModal;

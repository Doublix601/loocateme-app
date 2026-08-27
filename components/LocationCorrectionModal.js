import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './contexts/ThemeContext';
import CloseButton from './CloseButton';
import { submitLocationCorrection } from './ApiRequest';

// Doit rester aligné sur l'enum Location.type du backend.
const LOCATION_TYPE_OPTIONS = [
  'Bar 🍺', 'Boîte de nuit 💃', 'Restaurant 🍴', 'Café ☕', 'Cinéma 🎬', 'Loisir 🎯',
  'Salle de sport 🏋️', 'Centre sportif 🏟️', 'Parc 🌳', 'Plage 🏖️', "Parc d'attractions 🎢",
  'Bibliothèque 📚', 'Éducation 🎓', 'Coworking 🧑‍💻', 'Glacier 🍦', 'Marché 🛒', 'Musée 🏛️',
  'Brunch 🥞', 'Rooftop 🌆', 'Karaoké 🎤', 'Club de jeux 🎮',
];

const LocationCorrectionModal = ({ visible, onClose, locationId, currentName, currentType }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setType('');
    setReason('');
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const nameChanged = trimmedName && trimmedName !== currentName;
    const typeChanged = type && type !== currentType;
    if (!nameChanged && !typeChanged) {
      Alert.alert(t('locationCorrection.title'), t('locationCorrection.nothingToChange'));
      return;
    }
    setSubmitting(true);
    try {
      await submitLocationCorrection(locationId, {
        name: nameChanged ? trimmedName : undefined,
        type: typeChanged ? type : undefined,
        reason: reason.trim() || undefined,
      });
      close();
      Alert.alert(t('locationCorrection.sentTitle'), t('locationCorrection.sentMessage'));
    } catch (e) {
      setSubmitting(false);
      Alert.alert(t('locationCorrection.title'), e?.message || t('locationCorrection.genericError'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <CloseButton onPress={close} style={styles.close} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('locationCorrection.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('locationCorrection.subtitle')}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ alignSelf: 'stretch' }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('locationCorrection.nameLabel')}</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={name}
              onChangeText={setName}
              placeholder={currentName || ''}
              placeholderTextColor={colors.placeholder}
              maxLength={120}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('locationCorrection.typeLabel')}</Text>
            <View style={styles.chips}>
              {LOCATION_TYPE_OPTIONS.map((opt) => {
                const active = type === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setType(active ? '' : opt)}
                    style={[
                      styles.chip,
                      { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('locationCorrection.reasonLabel')}</Text>
            <TextInput
              style={[styles.input, styles.reasonInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={reason}
              onChangeText={setReason}
              placeholder={t('locationCorrection.reasonPlaceholder')}
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={500}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.submit, { backgroundColor: colors.accent, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{t('locationCorrection.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 26,
    maxHeight: '85%',
    alignItems: 'center',
  },
  close: { position: 'absolute', top: 12, right: 12 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  reasonInput: { minHeight: 70, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  submit: { alignSelf: 'stretch', marginTop: 16, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

export default LocationCorrectionModal;

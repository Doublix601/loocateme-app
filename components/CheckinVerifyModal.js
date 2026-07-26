import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVibeTheme } from '../hooks/useVibeTheme';

// Demande de confirmation "Es-tu bien ici ?" affichée ~5 min après un check-in
// (déclenchée par tap sur la notification programmée par
// CheckinVerificationScheduler). Propose de confirmer ou de corriger le lieu.
export default function CheckinVerifyModal({ visible, locationName, onConfirm, onCorrect, onClose }) {
  const { palette, typography, spacing, radius } = useVibeTheme();

  return (
    <Modal visible={!!visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={[styles.card, { backgroundColor: palette.bgElevated, borderRadius: radius.lg, padding: spacing.lg }]}>
          <Ionicons name="location" size={32} color={palette.accent} style={{ alignSelf: 'center' }} />
          <Text style={[typography.h2, { color: palette.text, textAlign: 'center', marginTop: spacing.sm }]}>
            Es-tu bien ici ?
          </Text>
          <Text
            style={[
              typography.body,
              { color: palette.textMuted, textAlign: 'center', marginTop: spacing.xs || 4, marginBottom: spacing.lg },
            ]}
          >
            {locationName ? `On t'a détecté à ${locationName}.` : "On t'a détecté dans ce lieu."} Confirme ou corrige.
          </Text>

          <TouchableOpacity
            onPress={onConfirm}
            style={[styles.primaryBtn, { backgroundColor: palette.accent, borderRadius: radius.pill, marginBottom: spacing.sm }]}
          >
            <Text style={styles.primaryBtnText}>Oui, c'est bon</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCorrect}
            style={[styles.secondaryBtn, { borderColor: palette.border, borderRadius: radius.pill }]}
          >
            <Text style={[typography.body, { color: palette.text, fontWeight: '700' }]}>Changer de lieu</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
  },
  primaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
});

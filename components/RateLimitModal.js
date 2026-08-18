import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVibeTheme } from '../hooks/useVibeTheme';

// Affichée quand le backend renvoie RATE_LIMITED sur un endpoint de position
// (heartbeat, check-in manuel, correction de check-in — cf.
// heartbeatLimiter côté API) : remplace l'Alert.alert générique avec le
// message technique brut du backend par un message compréhensible, avec un
// compte à rebours basé sur le header Retry-After quand il est disponible.
export default function RateLimitModal({ visible, retryAfterSeconds, onClose }) {
  const { palette, typography, spacing, radius } = useVibeTheme();
  const [remaining, setRemaining] = useState(retryAfterSeconds || 0);

  useEffect(() => {
    if (!visible) return;
    setRemaining(retryAfterSeconds || 0);
    if (!retryAfterSeconds) return;
    const interval = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, retryAfterSeconds]);

  return (
    <Modal visible={!!visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={[styles.card, { backgroundColor: palette.bgElevated, borderRadius: radius.lg, padding: spacing.lg }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${palette.accent}22` }]}>
            <Ionicons name="hourglass-outline" size={28} color={palette.accent} />
          </View>
          <Text style={[typography.h2, { color: palette.text, textAlign: 'center', marginTop: spacing.sm }]}>
            Doucement !
          </Text>
          <Text
            style={[
              typography.body,
              { color: palette.textMuted, textAlign: 'center', marginTop: spacing.xs || 4, marginBottom: spacing.lg },
            ]}
          >
            {"Tu as mis à jour ta position plusieurs fois d'affilée. Laisse-nous quelques instants pour suivre le rythme."}
            {remaining > 0 ? ` Réessaie dans ${remaining}s.` : ' Tu peux réessayer maintenant.'}
          </Text>

          <TouchableOpacity
            onPress={onClose}
            style={[styles.primaryBtn, { backgroundColor: palette.accent, borderRadius: radius.pill }]}
          >
            <Text style={styles.primaryBtnText}>J'ai compris</Text>
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
  iconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
});

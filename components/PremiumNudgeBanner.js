import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribe, publish } from './EventBus';
import { useTheme } from './contexts/ThemeContext';
import PremiumNudgeService from '../services/PremiumNudgeService';

// Bannière discrète et dismissible proposant Premium de façon contextuelle.
// Calquée sur PolicyUpdateBanner.js, mais pilotée par EventBus ('premium:nudge')
// plutôt que par un poll réseau — les émetteurs (LocationListScreen, UserProfileScreen, ...)
// décident déjà via PremiumNudgeService si le nudge est éligible avant de publier.
// Rendue en dehors du <NavigationContainer> (comme PolicyUpdateBanner), donc la navigation
// passe par l'événement 'ui:open_premium' déjà écouté globalement dans App.js plutôt que
// par useNavigation() (indisponible hors de l'arbre du NavigationContainer).
export default function PremiumNudgeBanner() {
  const [nudge, setNudge] = useState(null); // { id, title, message, source }
  const { colors } = useTheme();
  // NB: le thème n'expose pas `colors.text` (seulement textPrimary/textSecondary/textMuted) —
  // utiliser ces clés directement plutôt que `colors.text` (undefined -> retombe sur le noir
  // par défaut, illisible sur fond sombre).

  useEffect(() => {
    const unsub = subscribe('premium:nudge', (payload) => {
      if (!payload?.id) return;
      setNudge(payload);
      PremiumNudgeService.recordShown(payload.id).catch(() => {});
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  const handleDismiss = () => {
    if (nudge) PremiumNudgeService.recordDismissed(nudge.id).catch(() => {});
    setNudge(null);
  };

  const handlePress = () => {
    if (!nudge) return;
    publish('ui:open_premium', { source: nudge.source });
    setNudge(null);
  };

  if (!nudge) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.wrapper} pointerEvents="box-none">
      <TouchableOpacity
        style={[
          styles.container,
          { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.accent },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{nudge.title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>{nudge.message}</Text>
          </View>
          <View style={[styles.cta, { backgroundColor: colors.accent }]}>
            <Text style={styles.ctaText}>Voir</Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
            <Text style={[styles.close, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0 },
  container: {
    marginHorizontal: 10,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  message: { fontSize: 12.5, lineHeight: 17 },
  cta: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 6,
  },
  ctaText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  closeBtn: { padding: 4 },
  close: { fontSize: 16, opacity: 0.7 },
});

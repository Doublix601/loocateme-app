import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAccessToken, getPolicyStatus, markPolicyVersionSeen } from './ApiRequest';
import { subscribe } from './EventBus';
import { useTheme } from './contexts/ThemeContext';

// Non-blocking, dismissible banner shown when a MINOR privacy policy update
// has been published and the user hasn't seen it yet. Never shown for MAJOR
// updates — those are handled by the blocking Consent screen instead.
export default function PolicyUpdateBanner() {
  const [update, setUpdate] = useState(null); // { changelog, version }
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (!getAccessToken()) return;
      try {
        const res = await getPolicyStatus();
        if (!mounted) return;
        setUpdate(res?.hasUnseenUpdate ? { changelog: res.changelog || '', version: res.currentVersion || '' } : null);
      } catch (_) {
        // Not authenticated yet or offline: no banner, fail silently.
      }
    };
    check();
    const unsub = subscribe('userlist:refresh', check);
    return () => { mounted = false; try { unsub && unsub(); } catch (_) {} };
  }, []);

  const handleDismiss = async () => {
    setDismissing(true);
    try { await markPolicyVersionSeen(); } catch (_) { /* ignore, will retry on next check */ }
    setUpdate(null);
    setDismissing(false);
  };

  if (!update) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: 'rgba(0,0,0,0.08)' }]}>
        <TouchableOpacity style={styles.row} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={expanded ? undefined : 1}>
            Politique de confidentialité mise à jour (v{update.version}) — voir les changements
          </Text>
          <TouchableOpacity onPress={handleDismiss} disabled={dismissing} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.close, { color: colors.textPrimary }]}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        {expanded && !!update.changelog && (
          <Text style={[styles.changelog, { color: colors.textSecondary }]}>{update.changelog}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0 },
  container: {
    marginHorizontal: 10,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 13, fontWeight: '600', marginRight: 12 },
  close: { fontSize: 16, opacity: 0.6, paddingHorizontal: 4 },
  changelog: { fontSize: 13, lineHeight: 20, marginTop: 8, opacity: 0.85 },
});

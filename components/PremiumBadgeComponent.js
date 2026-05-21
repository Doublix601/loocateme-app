import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { publish } from './EventBus';

// Badge réutilisable à placer sur toute fonctionnalité verrouillée.
// Props :
//   feature  : string  — identifiant de la feature (pour analytics)
//   onPress  : fn      — callback; si omis, ouvre la paywall via EventBus
//   style    : object  — override StyleSheet
//   compact  : bool    — variante petite taille (icône seule)
const PremiumBadgeComponent = ({ feature = '', onPress, style, compact = false }) => {
  const handlePress = () => {
    try {
      if (typeof onPress === 'function') {
        onPress(feature);
      } else {
        publish('ui:open_premium', { source: feature });
      }
    } catch (_) {}
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={handlePress} style={[styles.compact, style]} activeOpacity={0.75}>
        <Text style={styles.lock}>🔒</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.badge, style]} activeOpacity={0.75}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.label}>PRO</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    alignSelf: 'flex-start',
  },
  compact: {
    backgroundColor: 'rgba(0,194,203,0.15)',
    borderRadius: 8,
    padding: 4,
    alignSelf: 'flex-start',
  },
  lock: { fontSize: 11 },
  label: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

export default PremiumBadgeComponent;

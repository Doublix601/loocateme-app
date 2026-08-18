import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ReferralLink — bandeau parrainage déprioritisé : simple lien discret au
 * lieu de la grande bannière gradient d'avant. Tap -> navigation Referral.
 */
const ReferralLink = ({ colors, isDark, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: isDark ? 'rgba(0,194,203,0.08)' : 'rgba(0,194,203,0.06)' }]}
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityLabel="Parrainage : invite tes amis"
    >
      <Ionicons name="gift-outline" size={20} color={colors.accent} />
      <Text style={[styles.text, { color: colors.accent }]}>Invite tes amis</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.accent} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ReferralLink;

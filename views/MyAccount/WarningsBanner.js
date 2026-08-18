import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const WarningsBanner = ({ warningsCount, colors, onPress }) => {
  if (!warningsCount || warningsCount <= 0) return null;
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.title, { color: colors.accent }]}>Avertissements</Text>
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        Vous avez {warningsCount} avertissement{warningsCount > 1 ? 's' : ''}.
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>Appuyez pour voir le détail</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: width * 0.05,
    fontWeight: '700',
    marginBottom: 6,
  },
  text: {
    fontSize: width * 0.042,
    textAlign: 'center',
  },
  meta: {
    marginTop: 6,
    fontSize: width * 0.038,
    textAlign: 'center',
  },
});

export default WarningsBanner;

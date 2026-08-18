import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * BioSection — lecture seule sur MyAccountScreen. La bio se modifie
 * désormais uniquement depuis les Réglages (plus d'édition inline / appui
 * long ici). Le placeholder italique reste affiché si la bio est vide.
 */
const BioSection = ({ bioRef, bio, colors, isDark }) => {
  const bioText = String(bio || '').trim();
  const isEmpty = bioText.length === 0;
  const baseBioFont = Math.min(width * 0.04, 18);
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));

  return (
    <View ref={bioRef} style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.label, { color: colors.accent }]}>Bio</Text>
      </View>
      <Text
        style={[
          styles.value,
          {
            fontSize: bioFont,
            lineHeight: bioFont * 1.4,
            color: isEmpty ? colors.textMuted : isDark ? '#fff' : colors.textPrimary,
            fontStyle: isEmpty ? 'italic' : 'normal',
          },
        ]}
      >
        {isEmpty ? 'Ajoute une phrase pour te présenter.' : bioText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: Math.min(width * 0.045, 18),
    fontWeight: '700',
  },
  value: {
    width: '100%',
    textAlign: 'left',
  },
});

export default BioSection;

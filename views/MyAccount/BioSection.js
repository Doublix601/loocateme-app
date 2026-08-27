import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

/**
 * BioSection — affichage sur MyAccountScreen. Un tap ouvre l'éditeur (Réglages
 * → onglet Profil, champ bio ciblé), cf. UX-01. Le placeholder italique reste
 * affiché si la bio est vide.
 */
const BioSection = ({ bioRef, bio, colors, isDark, onEditBio }) => {
  const { t } = useTranslation();
  const bioText = String(bio || '').trim();
  const isEmpty = bioText.length === 0;
  const baseBioFont = Math.min(width * 0.04, 18);
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));

  return (
    <TouchableOpacity
      ref={bioRef}
      activeOpacity={0.75}
      onPress={onEditBio}
      disabled={!onEditBio}
      style={[styles.container, { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="button"
      accessibilityLabel={t('myAccount.bio.editA11y')}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.label, { color: colors.accent }]}>{t('myAccount.bio.label')}</Text>
        {onEditBio ? <Ionicons name="pencil" size={14} color={colors.accent} style={{ marginLeft: 6 }} /> : null}
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
        {isEmpty ? t('myAccount.bio.placeholder') : bioText}
      </Text>
    </TouchableOpacity>
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

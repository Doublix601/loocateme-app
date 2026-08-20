import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import LocationCard from './LocationCard';

// Section "Ça bouge maintenant" (top lieux par nombre de visiteurs actuels).
// Respecte le filtre de type actif (TypeFilterBar) — contrairement à
// SponsoredCarousel qui n'est jamais filtré.
const TrendingSection = ({ items, sectionTitleColor, colors, isDark, isMoon, cardProps }) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: sectionTitleColor }]}>{t('locationList.sections.trending')}</Text>
      {items.map((item, index) => (
        <LocationCard
          key={item._id || item.osmId || item.name}
          item={item}
          index={index}
          colors={colors}
          isDark={isDark}
          isMoon={isMoon}
          {...cardProps}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: -0.2,
  },
});

export default TrendingSection;

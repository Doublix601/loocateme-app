import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

// Simple titre de section "D'autres lieux pour toi" — le contenu de cette
// section est le corps même de la FlatList principale (`otherItems`, cf.
// LocationListScreen.js), affiché seulement quand "Ça bouge maintenant" a
// aussi du contenu (sinon le titre de section serait redondant/orphelin).
const MoreLocationsSection = ({ visible, sectionTitleColor }) => {
  const { t } = useTranslation();
  if (!visible) return null;
  return <Text style={[styles.title, { color: sectionTitleColor }]}>{t('locationList.sections.moreLocations')}</Text>;
};

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: -0.2,
  },
});

export default MoreLocationsSection;

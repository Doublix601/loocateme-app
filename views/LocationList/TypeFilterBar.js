import React, { useState } from 'react';
import { Text, TouchableOpacity, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Barre de filtres par type de lieu (chips horizontales scrollables) :
// "Tous" + les types réellement présents dans les lieux chargés (déjà
// normalisés par `formatLocationType`, cf. LocationUtils.js). Sélection
// simple, un seul type actif à la fois, "Tous" par défaut. Ce filtre ne
// s'applique JAMAIS à la section "Mis en avant" (cf. SponsoredCarousel).
const ALL_KEY = '__all__';

const TypeFilterBar = ({ types, selectedType, onSelect, colors, isDark, isMoon, lockSwiper, unlockSwiper }) => {
  if (!types || types.length === 0) return null;

  const chipBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)';
  const chipTextColor = isMoon ? colors.textPrimary : colors.textPrimary;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const canScroll = contentWidth > layoutWidth;
  const fadeColors = isDark
    ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)'];

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        // onTouchStart précède l'évaluation du PanResponder du swiper de
        // navigation (cf. MainSwiper.js) : il faut verrouiller le swipe ici,
        // avant tout mouvement, sinon un drag horizontal sur les chips est
        // intercepté par la navigation entre pages. Même pattern que
        // SponsoredCarousel.js.
        onTouchStart={() => lockSwiper?.()}
        onTouchEnd={() => unlockSwiper?.()}
        onTouchCancel={() => unlockSwiper?.()}
        onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
      >
        <Chip
          label="Tous"
          active={selectedType === ALL_KEY}
          onPress={() => onSelect(ALL_KEY)}
          colors={colors}
          chipBg={chipBg}
          chipTextColor={chipTextColor}
        />
        {types.map((t) => (
          <Chip
            key={t}
            label={t}
            active={selectedType === t}
            onPress={() => onSelect(t)}
            colors={colors}
            chipBg={chipBg}
            chipTextColor={chipTextColor}
          />
        ))}
      </ScrollView>
      {canScroll && (
        <LinearGradient
          colors={fadeColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
          pointerEvents="none"
        />
      )}
    </View>
  );
};

const Chip = ({ label, active, onPress, colors, chipBg, chipTextColor }) => {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.chipTouchable}>
        <LinearGradient
          colors={colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chip}
        >
          <Text style={styles.chipTextActive} numberOfLines={1}>
            {label}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, styles.chipTouchable, { backgroundColor: chipBg }]}>
      <Text style={[styles.chipText, { color: chipTextColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export { ALL_KEY };

const styles = StyleSheet.create({
  container: {
    paddingLeft: 20,
    paddingRight: 32,
    paddingBottom: 14,
    gap: 8,
    flexDirection: 'row',
  },
  chipTouchable: {
    marginRight: 8,
  },
  fade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 14,
    width: 32,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default TypeFilterBar;

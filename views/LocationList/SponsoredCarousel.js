import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import LocationCard from './LocationCard';

// Section "Mis en avant" (lieux `isSponsored`) — épinglée juste sous le
// header, TOUJOURS affichée intégralement : jamais filtrée ni masquée par
// TypeFilterBar (les pros payent pour ce placement, contrainte business non
// négociable, cf. plan). Carte pleine largeur si un seul sponsor, sinon
// FlatList horizontal avec auto-scroll toutes les 7s.
const CARD_WIDTH = 280;
const CARD_MARGIN_RIGHT = 14;

const SponsoredCarousel = ({
  items,
  colors,
  isDark,
  isMoon,
  sectionTitleColor,
  lockSwiper,
  unlockSwiper,
  cardProps,
}) => {
  const listRef = useRef(null);
  const scrollIndexRef = useRef(0);
  const touchActiveRef = useRef(false);
  const autoScrollIntervalRef = useRef(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();
    if (items.length <= 1) return;
    autoScrollIntervalRef.current = setInterval(() => {
      if (touchActiveRef.current) return;
      const nextIndex = (scrollIndexRef.current + 1) % items.length;
      scrollIndexRef.current = nextIndex;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 7000);
  }, [items.length, stopAutoScroll]);

  useEffect(() => {
    scrollIndexRef.current = 0;
    startAutoScroll();
    return stopAutoScroll;
  }, [items.length, startAutoScroll, stopAutoScroll]);

  // Reset défensif : une transition jour/nuit (remontage des cartes) peut
  // interrompre une séquence tactile en cours sur le carousel sans jamais
  // délivrer onTouchEnd/onTouchCancel — cf. commentaire historique dans
  // l'ancien LocationListScreen.js monolithique.
  useEffect(() => {
    touchActiveRef.current = false;
    unlockSwiper?.();
  }, [isMoon, unlockSwiper]);

  const handleScrollToIndexFailed = useCallback((info) => {
    listRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: true,
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.16)' },
      ]}
    >
      <Text style={[styles.title, { color: sectionTitleColor }]}>Mis en avant</Text>
      {items.length === 1 ? (
        // Un seul item dans un FlatList horizontal de 280px laisse un grand
        // vide à droite (l'écran ne fait presque jamais 280px de large) : on
        // l'affiche en carte pleine largeur, comme le reste de la liste.
        <LocationCard item={items[0]} index={0} colors={colors} isDark={isDark} isMoon={isMoon} {...cardProps} />
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `sponsored-${item._id || item.osmId || item.name}`}
          renderItem={({ item, index }) => (
            <View style={styles.cardWrapper}>
              <LocationCard item={item} index={index} colors={colors} isDark={isDark} isMoon={isMoon} {...cardProps} />
            </View>
          )}
          contentContainerStyle={{ paddingRight: 20 }}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onMomentumScrollEnd={(e) => {
            const itemWidth = CARD_WIDTH + CARD_MARGIN_RIGHT;
            const index = Math.round(e.nativeEvent.contentOffset.x / itemWidth);
            scrollIndexRef.current = Math.max(0, Math.min(index, items.length - 1));
          }}
          onTouchStart={() => {
            // onTouchStart précède tout mouvement, donc précède l'évaluation
            // de onMoveShouldSetPanResponderCapture du swiper de navigation
            // (cf. MainSwiper.js) : lockSwiper() doit être posé ici.
            if (touchActiveRef.current) return;
            touchActiveRef.current = true;
            stopAutoScroll();
            lockSwiper?.();
          }}
          onTouchEnd={() => {
            touchActiveRef.current = false;
            unlockSwiper?.();
            startAutoScroll();
          }}
          onTouchCancel={() => {
            touchActiveRef.current = false;
            unlockSwiper?.();
            startAutoScroll();
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN_RIGHT,
  },
});

export default SponsoredCarousel;

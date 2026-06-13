import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard, PanResponder, StyleSheet, View } from 'react-native';
import MainSwiperContext from '../components/contexts/MainSwiperContext';
import SearchView from '../views/SearchView';
import LocationListScreen from '../views/LocationListScreen';
import MyAccountScreen from '../views/MyAccountScreen';

const { width } = Dimensions.get('window');
const PAGE_COUNT = 3;
const INITIAL_PAGE = 1; // 0 = Search, 1 = LocationList, 2 = MyAccount

export default function MainSwiper() {
  const translateX = useRef(new Animated.Value(-width * INITIAL_PAGE)).current;
  const pageRef = useRef(INITIAL_PAGE);
  const gestureBaseRef = useRef(-width * INITIAL_PAGE);
  const [currentPage, setCurrentPage] = useState(INITIAL_PAGE);
  const swiperLockedRef = useRef(false);
  const goToPageRef = useRef(null);

  const goToPage = useCallback(
    (targetPage, animated = true) => {
      const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, Math.round(targetPage)));
      // Always dismiss the keyboard on page transitions. If we're heading to
      // page 0 (Search), SearchView's useEffect will re-open it after the
      // animation settles.
      Keyboard.dismiss();
      pageRef.current = clamped;
      setCurrentPage(clamped);
      if (animated) {
        Animated.spring(translateX, {
          toValue: -width * clamped,
          useNativeDriver: true,
          tension: 100,
          friction: 14,
        }).start();
      } else {
        translateX.setValue(-width * clamped);
      }
    },
    [translateX],
  );

  goToPageRef.current = goToPage;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        !swiperLockedRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 3,
      onPanResponderGrant: () => {
        // Dismiss keyboard immediately when a swipe starts so it never
        // obstructs the animation.
        Keyboard.dismiss();
        // Snapshot current animated position so the drag starts from where it is
        // (handles the case where a spring is still in progress).
        translateX.stopAnimation((value) => {
          gestureBaseRef.current = value;
          translateX.setValue(value);
          pageRef.current = Math.round(-value / width);
        });
      },
      onPanResponderMove: (_, { dx }) => {
        const raw = gestureBaseRef.current + dx;
        const min = -width * (PAGE_COUNT - 1);
        const max = 0;
        // Rubber-band effect at the edges
        let val;
        if (raw < min) val = min + (raw - min) * 0.2;
        else if (raw > max) val = max + (raw - max) * 0.2;
        else val = raw;
        translateX.setValue(val);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const cur = pageRef.current;
        if (dx < -50 || vx < -0.5) goToPageRef.current(cur + 1);
        else if (dx > 50 || vx > 0.5) goToPageRef.current(cur - 1);
        else goToPageRef.current(cur);
      },
      onPanResponderTerminate: () => {
        // Another responder took over — snap back to current page
        goToPageRef.current(pageRef.current);
      },
    }),
  ).current;

  const lockSwiper   = useCallback(() => { swiperLockedRef.current = true; }, []);
  const unlockSwiper = useCallback(() => { swiperLockedRef.current = false; }, []);

  const contextValue = useMemo(
    () => ({ goToPage, currentPage, insideSwiper: true, lockSwiper, unlockSwiper }),
    [goToPage, currentPage, lockSwiper, unlockSwiper],
  );

  return (
    <MainSwiperContext.Provider value={contextValue}>
      <View style={styles.container} {...panResponder.panHandlers}>
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
          <View style={styles.page}>
            <SearchView />
          </View>
          <View style={styles.page}>
            <LocationListScreen />
          </View>
          <View style={styles.page}>
            <MyAccountScreen />
          </View>
        </Animated.View>
      </View>
    </MainSwiperContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  track: {
    // Absolutely positioned so it can bleed in height while overflow:hidden clips
    // only the horizontal sides.  top/bottom pins give it the full container height.
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: width * PAGE_COUNT,
    flexDirection: 'row',
  },
  page: { width },
});

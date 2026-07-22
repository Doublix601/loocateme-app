import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * UltraBoostProgressBar — barre de progression du temps passé sur place
 * pendant une offre Ultra Boost (cible : 20 min, cf. ULTRA_BOOST_CLAIM_MS
 * côté backend). Purement présentational : ne décide pas de sa visibilité,
 * calcule et anime la progression à partir de `startedAt`.
 */
const UltraBoostProgressBar = ({ startedAt, targetMs = 20 * 60 * 1000, palette, spacing, radius, typography }) => {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);

  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Math.min(Date.now() - startMs, targetMs)));

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Math.min(Date.now() - startMs, targetMs)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs, targetMs]);

  const progressRatio = targetMs > 0 ? Math.max(0, Math.min(1, elapsedMs / targetMs)) : 0;

  const progress = useSharedValue(progressRatio);
  useEffect(() => {
    progress.value = withTiming(progressRatio, { duration: 950, easing: Easing.linear });
  }, [progressRatio, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={{ marginTop: spacing.sm }}>
      <View
        style={[
          styles.track,
          {
            borderRadius: radius.pill,
            backgroundColor: palette.border || 'rgba(255,215,0,0.15)',
          },
        ]}
      >
        <Animated.View style={[styles.fill, { borderRadius: radius.pill }, fillStyle]} />
      </View>
      <Text style={[typography.caption, { color: palette.textMuted, marginTop: 4 }]}>
        {`${formatClock(elapsedMs)} / ${formatClock(targetMs)}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
});

export default UltraBoostProgressBar;

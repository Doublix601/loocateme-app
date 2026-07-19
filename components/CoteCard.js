import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

const LEVELS = [0, 25, 50, 75, 100];

function levelColor(percent) {
  if (percent >= 100) return '#FF6B35';
  if (percent >= 75) return '#FF8A3D';
  if (percent >= 50) return '#FFA94D';
  if (percent >= 25) return '#FFC078';
  return '#8A8F98';
}

function levelMessage(percent) {
  if (percent >= 100) return 'Au top ! Connecte-toi demain pour la garder.';
  if (percent === 0) return 'Connecte-toi aujourd’hui pour la relancer.';
  return 'Connecte-toi chaque jour pour la faire grimper.';
}

/**
 * CoteCard — affiche le score de présence ("Cote") de l'utilisateur, sur le
 * modèle des flammes Snapchat : une flamme + un pourcentage + une jauge en
 * 5 paliers (0/25/50/75/100). Tap = petite explication de la règle.
 */
const CoteCard = ({ percent = 100, colors, isDark, onPress }) => {
  const safePercent = LEVELS.includes(percent) ? percent : 100;
  const color = levelColor(safePercent);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const message = useMemo(() => levelMessage(safePercent), [safePercent]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: colors.surfaceAlt }]}
      >
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            <Text style={[styles.flame, safePercent === 0 && styles.flameDim]}>🔥</Text>
            <Text style={[styles.title, { color: isDark ? '#fff' : colors.textPrimary }]}>Ta Cote</Text>
          </View>
          <Text style={[styles.percent, { color }]}>{safePercent}%</Text>
        </View>

        <View style={styles.gaugeRow}>
          {LEVELS.slice(1).map((level) => (
            <View
              key={level}
              style={[
                styles.segment,
                {
                  backgroundColor: safePercent >= level ? levelColor(level) : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.hint, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]} numberOfLines={2}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flame: {
    fontSize: 20,
    marginRight: 6,
  },
  flameDim: {
    opacity: 0.35,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  percent: {
    fontSize: 20,
    fontWeight: '800',
  },
  gaugeRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  hint: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 16,
  },
});

export default CoteCard;

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';

const MAX_DAYS = 14;
const SUPERVISE_DAY = 7;
const BOOST_DAY = 14;

/**
 * StreakCard — affiche "Ta série" (streak quotidien 0→14 jours) sur le
 * modèle visuel de l'ancienne CoteCard : titre + compteur + jauge en
 * paliers, avec un bouton "Réclamer" actif à J7 (superviselike) et J14
 * (boost) quand la récompense est en attente côté backend.
 */
const StreakCard = ({
  count = 0,
  supervisePendingClaim = false,
  boostPendingClaim = false,
  claiming = false,
  colors,
  isDark,
  onPress,
  onClaim,
}) => {
  const safeCount = Math.max(0, Math.min(MAX_DAYS, count || 0));
  const scale = useRef(new Animated.Value(1)).current;
  const canClaim = supervisePendingClaim || boostPendingClaim;

  // Pulsation continue et discrète du conteneur ("Ta série") pour attirer l'oeil,
  // même pattern Animated (react-native) que le scale au press ci-dessous.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const claimLabel = boostPendingClaim ? 'Réclamer ton boost' : supervisePendingClaim ? 'Réclamer ton superlike' : null;

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
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
            <Text style={[styles.flame, safeCount === 0 && styles.flameDim]}>🔥</Text>
            <Text style={[styles.title, { color: isDark ? '#fff' : colors.textPrimary }]}>Ta série</Text>
          </View>
          <Text style={[styles.percent, { color: '#FF6B35' }]}>{safeCount}/{MAX_DAYS}</Text>
        </View>

        <View style={styles.gaugeRow}>
          {Array.from({ length: MAX_DAYS }).map((_, idx) => {
            const day = idx + 1;
            const reached = safeCount >= day;
            const isMilestone = day === SUPERVISE_DAY || day === BOOST_DAY;
            return (
              <View
                key={day}
                style={[
                  styles.segment,
                  isMilestone && styles.segmentMilestone,
                  {
                    backgroundColor: reached
                      ? '#FF6B35'
                      : isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.06)',
                  },
                ]}
              />
            );
          })}
        </View>

        <Text
          style={[styles.hint, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}
          numberOfLines={2}
        >
          {canClaim
            ? 'Ta récompense est prête !'
            : 'Connecte-toi chaque jour pour la faire grimper.'}
        </Text>

        {canClaim ? (
          <TouchableOpacity
            style={[styles.claimButton, { opacity: claiming ? 0.7 : 1 }]}
            onPress={onClaim}
            disabled={claiming}
            accessibilityLabel={claimLabel}
          >
            {claiming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.claimButtonText}>{claimLabel}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      </Animated.View>
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
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  segmentMilestone: {
    height: 10,
    borderRadius: 5,
  },
  hint: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 16,
  },
  claimButton: {
    marginTop: 12,
    backgroundColor: '#FF6B35',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default StreakCard;

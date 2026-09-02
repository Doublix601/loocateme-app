import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import StreakCard from '../../components/StreakCard';
import { formatCount } from '../../utils/formatCount';

/**
 * RewardsCard — carte "Récompenses" fusionnant visuellement StreakCard
 * (série quotidienne) et le bloc Superlikes/Boosts (compteurs animés, achat,
 * historique). Toute la logique (claim, animations pulse) reste dans
 * MyAccountScreen et est passée en props — ce composant ne fait qu'assembler
 * l'UI.
 */
const RewardsCard = ({
  colors,
  isDark,
  accentGradient,
  streak,
  streakClaiming,
  onClaimStreak,
  onStreakInfoPress,
  superlikeBalance,
  boostBalance,
  superlikePulse,
  boostPulse,
  onOpenSuperlikeHistory,
  onOpenConsumablesShop,
  isPremium,
  premiumSystemEnabled = true,
  onOpenPaywall,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={accentGradient || ['#00c2cb', '#7b5cff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.borderGradient}
      >
        <View style={[styles.inner, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.heading, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.rewards.heading')}</Text>

          <StreakCard
            count={streak?.count ?? 0}
            supervisePendingClaim={!!streak?.supervisePendingClaim}
            boostPendingClaim={!!streak?.boostPendingClaim}
            claiming={streakClaiming}
            colors={colors}
            isDark={isDark}
            onClaim={onClaimStreak}
            onPress={onStreakInfoPress}
          />

          <View style={[styles.consumablesCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff' }]}>
            <View style={styles.stat}>
              <Animated.View style={{ transform: [{ scale: boostPulse }] }}>
                <Ionicons name="flash" size={18} color={colors.accent} />
              </Animated.View>
              <Text style={[styles.statLabel, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.rewards.boosts')}</Text>
              <Text style={[styles.statValue, { color: isDark ? '#fff' : colors.textPrimary }]}>{boostBalance}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.stat}
              onPress={onOpenSuperlikeHistory}
              accessibilityLabel={t('myAccount.rewards.superlikeHistoryLabel', {
                count: Number.isFinite(superlikeBalance) ? superlikeBalance : 0,
              })}
            >
              <Animated.View style={{ transform: [{ scale: superlikePulse }] }}>
                <Ionicons name="star" size={18} color="#FFB800" />
              </Animated.View>
              <Text style={[styles.statLabel, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.rewards.superlikes')}</Text>
              <Text style={[styles.statValue, { color: isDark ? '#fff' : colors.textPrimary }]}>
                {formatCount(superlikeBalance)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buyButton, { backgroundColor: colors.accent }]}
              onPress={onOpenConsumablesShop}
              accessibilityLabel={t('myAccount.rewards.buyLabel')}
            >
              <Text style={styles.buyButtonText}>{t('myAccount.rewards.buy')}</Text>
            </TouchableOpacity>
          </View>

          {premiumSystemEnabled && !isPremium && (
            <TouchableOpacity
              style={styles.premiumCta}
              onPress={onOpenPaywall}
              accessibilityLabel={t('myAccount.rewards.premiumLabel')}
            >
              <Text style={styles.premiumCtaText}>{t('myAccount.rewards.premiumCta')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginTop: 16,
  },
  borderGradient: {
    borderRadius: 22,
    padding: 1.5,
  },
  inner: {
    borderRadius: 21,
    padding: 14,
  },
  heading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  consumablesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.7,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  buyButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  premiumCta: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f6c453',
  },
  premiumCtaText: {
    color: '#2a1c00',
    fontWeight: '800',
    fontSize: 14,
  },
});

export default RewardsCard;

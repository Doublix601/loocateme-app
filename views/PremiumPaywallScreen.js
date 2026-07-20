import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTheme } from '../components/contexts/ThemeContext';
import { UserContext } from '../components/contexts/UserContext';
import { getMyUser } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import IAPStore from '../services/IAPStore';
import PremiumService from '../services/PremiumService';
import { DEBUG_CONFIG } from '../services/DebugConfig';

const { width } = Dimensions.get('window');

const SLIDES = [
  { emoji: '👀', title: 'Qui te visite ?', desc: 'Découvre en temps réel qui consulte ton profil.' },
  { emoji: '🔥', title: 'Boosts de visibilité', desc: 'Remonte en tête de liste pendant 30 min dans ton établissement.' },
  { emoji: '⭐', title: 'Superlikes', desc: 'Montre un intérêt particulier à quelqu\'un que tu remarques.' },
  { emoji: '🫥', title: 'Mode invisible', desc: 'Disparais de la liste des utilisateurs proches quand tu le souhaites.' },
  { emoji: '🗺️', title: 'Rayon étendu', desc: 'Explore jusqu\'à 2 km autour de toi (500 m en version gratuite).' },
  { emoji: '📊', title: 'Statistiques avancées', desc: 'Suis tes vues et clics sur tous tes réseaux sociaux.' },
];

const FEATURES = [
  'Voir qui consulte ton profil',
  'Boosts de visibilité (1 pack offert)',
  'Superlikes (3/semaine offerts)',
  'Mode invisible',
  'Rayon de recherche jusqu\'à 2 km',
  'Statistiques avancées',
  'Notifications enrichies',
];

const FALLBACK = { monthly: '4,99 €', annual: '39,99 €', savings: 33 };

export default function PremiumPaywallScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const routeParams = route.params ?? {};
  const onBack = () => navigation.goBack();
  const onAlreadyPremium = () => navigation.navigate('Statistics');
  const { colors, isDark } = useTheme();
  const { user, updateUser } = useContext(UserContext);
  const [period, setPeriod] = useState('annual');
  const [offerings, setOfferings] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const carouselRef = useRef(null);
  const autoRef = useRef(null);

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (user?.isPremium) {
      onAlreadyPremium ? onAlreadyPremium() : onBack?.();
    }
  }, [user?.isPremium]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (!me || cancelled) return;
        if (updateUser) updateUser({ ...user, isPremium: !!me.isPremium });
        if (me.isPremium) onAlreadyPremium ? onAlreadyPremium() : onBack?.();
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:reload', async () => {
      try {
        const res = await getMyUser();
        if (res?.user?.isPremium) onAlreadyPremium ? onAlreadyPremium() : onBack?.();
      } catch (_) {}
    });
    return () => { try { off?.(); } catch (_) {} };
  }, []);

  useEffect(() => {
    IAPStore.getOfferings().then(setOfferings).catch(() => {});
  }, []);

  useEffect(() => {
    autoRef.current = setInterval(() => {
      setSlideIdx((prev) => {
        const next = (prev + 1) % SLIDES.length;
        carouselRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 3200);
    return () => clearInterval(autoRef.current);
  }, []);

  const monthlyPkg = offerings?.availablePackages?.find((p) => p.packageType === 'MONTHLY') ?? null;
  const annualPkg = offerings?.availablePackages?.find((p) => p.packageType === 'ANNUAL') ?? null;
  const selectedPkg = period === 'monthly' ? monthlyPkg : annualPkg;

  const monthlyPrice = monthlyPkg?.product?.priceString ?? FALLBACK.monthly;
  const annualPrice = annualPkg?.product?.priceString ?? FALLBACK.annual;

  const handlePurchase = async () => {
    if (purchasing) return;
    if (!selectedPkg && !DEBUG_CONFIG.IAP_DISABLED) {
      Alert.alert('Offres indisponibles', 'Les offres d\'abonnement ne sont pas encore chargées. Réessayez dans quelques instants.');
      return;
    }
    setPurchasing(true);
    try {
      const result = await IAPStore.purchaseSubscription(selectedPkg, userId);
      if (result.success) {
        await PremiumService.refreshFromBackend();
        try {
          const res = await getMyUser();
          if (res?.user && updateUser) updateUser({ ...user, isPremium: !!res.user.isPremium });
        } catch (_) {}

        if (result.isMock) {
          Alert.alert(
            '✅ Simulation réussie',
            'Abonnement simulé (mode debug).',
            [{ text: 'Continuer', onPress: () => onAlreadyPremium ? onAlreadyPremium() : onBack?.() }]
          );
        } else {
          onAlreadyPremium ? onAlreadyPremium() : onBack?.();
          try {
            await Updates.reloadAsync();
          } catch (_) {
            // Reload non disponible (ex. Expo Go) : l'état premium reste à jour via updateUser ci-dessus.
          }
        }
      }
    } catch (e) {
      if (!e.userCancelled) Alert.alert('Erreur', e.message || 'Impossible de finaliser l\'achat.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await IAPStore.restorePurchases(userId);
      if (result.success) {
        await PremiumService.refreshFromBackend();
        const res = await getMyUser();
        if (res?.user && updateUser) updateUser({ ...user, isPremium: !!res.user.isPremium });
        if (res?.user?.isPremium) {
          Alert.alert('✅ Achats restaurés', 'Votre abonnement Premium est actif.');
          onAlreadyPremium ? onAlreadyPremium() : onBack?.();
        } else {
          Alert.alert('Aucun achat trouvé', 'Aucun abonnement actif n\'a pu être restauré.');
        }
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de restaurer les achats.');
    } finally {
      setRestoring(false);
    }
  };

  const bg = isDark ? '#0f0f1a' : colors.background;
  const cardBg = isDark ? 'rgba(255,255,255,0.07)' : colors.surface;
  const text = isDark ? '#fff' : colors.textPrimary;
  const sub = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
        >
          <Text style={{ fontSize: 16, color: text, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: text }]}>👑 Premium</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <Text style={[styles.headerSubtitle, { color: sub }]}>
        Débloquez toutes les fonctionnalités
      </Text>

      {/* Debug banner */}
      {DEBUG_CONFIG.IAP_DISABLED && (
        <View style={styles.debugBanner}>
          <Text style={styles.debugBannerText}>⚠️ Paiements désactivés (mode debug)</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>

        {/* Carousel */}
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => clearInterval(autoRef.current)}
          onMomentumScrollEnd={(e) => {
            setSlideIdx(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          style={{ marginTop: 16 }}
        >
          {SLIDES.map((s, i) => (
            <View key={i} style={{ width, paddingHorizontal: 20 }}>
              <View style={[styles.slide, { backgroundColor: cardBg }]}>
                <Text style={styles.slideEmoji}>{s.emoji}</Text>
                <Text style={[styles.slideTitle, { color: text }]}>{s.title}</Text>
                <Text style={[styles.slideDesc, { color: sub }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: '#00c2cb',
                  opacity: i === slideIdx ? 1 : 0.25,
                  width: i === slideIdx ? 18 : 6,
                },
              ]}
            />
          ))}
        </View>

        {/* Period toggle */}
        <View style={[styles.toggleRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}>
          <TouchableOpacity
            onPress={() => setPeriod('monthly')}
            style={[styles.toggleBtn, period === 'monthly' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleLabel, { color: period === 'monthly' ? '#fff' : sub }]}>Mensuel</Text>
            <Text style={[styles.togglePrice, { color: period === 'monthly' ? '#fff' : text }]}>
              {monthlyPrice}
              <Text style={{ fontSize: 12, fontWeight: '600' }}>/mois</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPeriod('annual')}
            style={[
              styles.toggleBtn,
              period === 'annual' && styles.toggleBtnActive,
              period !== 'annual' && styles.toggleBtnRecommended,
            ]}
          >
            <View style={styles.recommendedRibbon}>
              <Text style={styles.recommendedRibbonTxt}>LE PLUS CHOISI</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Text style={[styles.toggleLabel, { color: period === 'annual' ? '#fff' : sub }]}>Annuel</Text>
              <View style={[
                styles.savingsBadge,
                { backgroundColor: period === 'annual' ? 'rgba(255,255,255,0.28)' : '#00c2cb' },
              ]}>
                <Text style={styles.savingsTxt}>-{FALLBACK.savings}%</Text>
              </View>
            </View>
            <Text style={[styles.togglePrice, { color: period === 'annual' ? '#fff' : text }]}>
              {annualPrice}
              <Text style={{ fontSize: 12, fontWeight: '600' }}>/an</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Features */}
        <View style={[styles.featuresCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.featuresTitle, { color: sub }]}>TOUT EST INCLUS</Text>
          {FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, i === FEATURES.length - 1 && { marginBottom: 0 }]}>
              <View style={styles.checkMarkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={[styles.featureText, { color: text }]}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handlePurchase}
          disabled={purchasing || (!selectedPkg && !DEBUG_CONFIG.IAP_DISABLED)}
          activeOpacity={0.85}
          style={[
            styles.cta,
            { opacity: purchasing || (!selectedPkg && !DEBUG_CONFIG.IAP_DISABLED) ? 0.5 : 1 },
            DEBUG_CONFIG.IAP_DISABLED && { backgroundColor: '#f39c12' },
          ]}
        >
          {purchasing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.ctaText}>
                {DEBUG_CONFIG.IAP_DISABLED
                  ? 'Simuler un abonnement Premium'
                  : !selectedPkg
                    ? 'Chargement des offres…'
                    : 'Commencer mon essai gratuit 7 jours'}
              </Text>}
        </TouchableOpacity>

        {!DEBUG_CONFIG.IAP_DISABLED && (
          <Text style={[styles.trialSub, { color: sub }]}>
            🔒 {period === 'annual'
              ? `Puis ${annualPrice}/an · Résiliable à tout moment`
              : `Puis ${monthlyPrice}/mois · Résiliable à tout moment`}
          </Text>
        )}

        {/* Restore */}
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          {restoring
            ? <ActivityIndicator size="small" color="#00c2cb" />
            : <Text style={[styles.restoreTxt, { color: '#00c2cb' }]}>Restaurer mes achats</Text>}
        </TouchableOpacity>

        {/* Legal */}
        <Text style={[styles.legal, { color: sub }]}>
          {'L\'abonnement se renouvelle automatiquement sauf résiliation avant la fin de la période en cours. ' +
           'Gérez vos abonnements dans les réglages de l\'App Store / Google Play. '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://loocateme.com/privacy')}>
            Politique de confidentialité
          </Text>
          {' · '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://loocateme.com/terms')}>
            CGU
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 56,
    paddingBottom: 8,
  },
  closeBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  headerSubtitle: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  debugBanner: {
    backgroundColor: '#f39c12',
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  debugBannerText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  slide: {
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    minHeight: 170,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  slideEmoji: { fontSize: 52, marginBottom: 12 },
  slideTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  slideDesc: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4 },
  dot: { height: 6, borderRadius: 3 },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 26,
    borderRadius: 18,
    padding: 4,
    gap: 4,
  },
  toggleBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#00c2cb' },
  toggleBtnRecommended: { borderWidth: 1.5, borderColor: '#00c2cb' },
  recommendedRibbon: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#00c2cb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendedRibbonTxt: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  toggleLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  togglePrice: { fontSize: 17, fontWeight: '800' },
  savingsBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  savingsTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  featuresCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  featuresTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  checkMarkCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,194,203,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  checkMark: { color: '#00c2cb', fontSize: 13, fontWeight: '900' },
  featureText: { fontSize: 15, fontWeight: '600', flex: 1 },
  cta: {
    backgroundColor: '#00c2cb',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 22,
    elevation: 4,
    shadowColor: '#00c2cb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  trialSub: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  restoreBtn: { alignItems: 'center', paddingVertical: 16 },
  restoreTxt: { fontSize: 14, fontWeight: '600' },
  legal: { fontSize: 10, textAlign: 'center', paddingHorizontal: 24, lineHeight: 15, paddingBottom: 8 },
});

import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Purchases from 'react-native-purchases';
import { useTheme } from '../components/contexts/ThemeContext';
import { UserContext } from '../components/contexts/UserContext';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { getMyUser } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import IAPStore from '../services/IAPStore';
import PremiumService from '../services/PremiumService';
import { DEBUG_CONFIG } from '../services/DebugConfig';
import ScreenHeader from '../components/ScreenHeader';
import PremiumWelcomeOnboarding from '../components/PremiumWelcomeOnboarding';
import { getPremiumSlides } from '../constants/premiumFeatures';
import { useTranslation } from 'react-i18next';
import { PRIVACY_POLICY_URL, TERMS_URL, APPLE_EULA_URL, STORE_NAME } from '../constants/legal';
import { logger } from '../utils/logger';

const { width } = Dimensions.get('window');

// Aucun prix en dur : le prix affiché doit toujours être celui de StoreKit /
// Google Play (via RevenueCat `product.priceString`), sinon il risque de ne pas
// correspondre à la feuille d'achat réelle. Tant que l'offering n'est pas
// chargé, on affiche un placeholder neutre plutôt qu'un montant inventé.
const PRICE_PLACEHOLDER = '—';

// Traduit les erreurs RevenueCat/StoreKit connues en message lisible plutôt que
// d'afficher le `e.message` brut (technique, en anglais) au reviewer Apple.
function purchaseErrorMessage(e, t) {
  const CODES = Purchases?.PURCHASES_ERROR_CODE ?? {};
  const code = e?.code;
  if (code != null) {
    if (code === CODES.PURCHASE_NOT_ALLOWED_ERROR) return t('premiumPaywall.purchaseNotAllowed');
    if (code === CODES.PAYMENT_PENDING_ERROR) return t('premiumPaywall.storeProblem');
    if (
      code === CODES.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR ||
      code === CODES.PRODUCT_ALREADY_PURCHASED_ERROR
    )
      return t('premiumPaywall.productUnavailable');
    if (code === CODES.STORE_PROBLEM_ERROR) return t('premiumPaywall.storeProblem');
  }
  return e?.message || t('premiumPaywall.purchaseError');
}

export default function PremiumPaywallScreen() {
  const { t } = useTranslation();
  const SLIDES = getPremiumSlides(t);
  const FEATURES = t('premiumPaywall.features', { returnObjects: true });
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params ?? {};
  const onBack = () => navigation.goBack();
  // Vient d'un bouton "Stats" verrouillé -> on continue vers Statistics (en
  // remplaçant ce paywall dans la pile, pas en l'empilant, pour qu'un retour
  // arrière depuis Statistics ramène directement à l'écran d'origine au lieu
  // de re-tomber sur le paywall déjà payé). Pour toute autre origine
  // (carte Récompenses, Réglages...), on revient simplement à l'écran d'où
  // l'utilisateur est venu.
  const onAlreadyPremium = () => {
    if (routeParams.source === 'stats_button') {
      navigation.replace('Statistics');
    } else {
      onBack();
    }
  };
  const { colors, isDark } = useTheme();
  const { purchasesReady } = useFeatureFlags();
  const { user, updateUser } = useContext(UserContext);
  const [period, setPeriod] = useState('annual');
  const [offerings, setOfferings] = useState(null);
  const [offersError, setOffersError] = useState(false);
  const [offersRetry, setOffersRetry] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const carouselRef = useRef(null);
  const autoRef = useRef(null);

  const userId = user?._id || user?.id;

  const handleOnboardingClose = () => {
    setOnboardingVisible(false);
    onAlreadyPremium ? onAlreadyPremium() : onBack?.();
  };

  // Les trois effets ci-dessous redirigent automatiquement dès que le compte
  // est détecté premium — utile si l'utilisateur ouvre le paywall alors qu'il
  // l'est déjà. Ils doivent rester silencieux pendant que l'onboarding de
  // bienvenue est affiché (déclenché juste après un achat/essai réussi dans
  // handleTrial/handlePurchase/handleRestore), sinon ils navigueraient
  // par-dessus l'onboarding avant que l'utilisateur ait pu le voir.
  useEffect(() => {
    if (onboardingVisible) return;
    if (user?.isPremium) {
      onAlreadyPremium ? onAlreadyPremium() : onBack?.();
    }
  }, [user?.isPremium, onboardingVisible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (!me || cancelled) return;
        if (updateUser) updateUser({ ...user, isPremium: !!me.isPremium });
        if (me.isPremium && !onboardingVisible) onAlreadyPremium ? onAlreadyPremium() : onBack?.();
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:reload', async () => {
      try {
        const res = await getMyUser();
        if (res?.user?.isPremium && !onboardingVisible) onAlreadyPremium ? onAlreadyPremium() : onBack?.();
      } catch (_) {}
    });
    return () => {
      try {
        off?.();
      } catch (_) {}
    };
  }, [onboardingVisible]);

  useEffect(() => {
    let cancelled = false;
    setOffersError(false);
    // Ne jamais rester bloqué sur « Chargement des offres… » : timeout 10 s →
    // état d'erreur avec bouton « Réessayer » (BUG-05).
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    Promise.race([IAPStore.getOfferings(), timeout])
      .then((res) => {
        if (cancelled) return;
        const pkgs = res?.availablePackages ?? [];
        const hasSub = pkgs.some((p) => p.packageType === 'MONTHLY' || p.packageType === 'ANNUAL');
        // Offering présent mais sans abonnement mensuel/annuel exploitable →
        // même issue « Réessayer » plutôt qu'un CTA figé sur « Chargement… ».
        if (!res || (!hasSub && !DEBUG_CONFIG.IAP_DISABLED)) {
          setOffersError(true);
        } else {
          setOfferings(res);
        }
      })
      .catch(() => {
        if (!cancelled) setOffersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [offersRetry]);

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

  // Chaînes localisées telles que renvoyées par le store (source de vérité).
  const monthlyPrice = monthlyPkg?.product?.priceString ?? null;
  const annualPrice = annualPkg?.product?.priceString ?? null;

  // % d'économie calculé sur les montants numériques réels (product.price) —
  // plus de badge « -33% » figé qui ment quand les prix changent.
  const monthlyNum =
    typeof monthlyPkg?.product?.price === 'number' ? monthlyPkg.product.price : null;
  const annualNum = typeof annualPkg?.product?.price === 'number' ? annualPkg.product.price : null;
  const savingsPct =
    monthlyNum && annualNum && monthlyNum > 0
      ? Math.round((1 - annualNum / (monthlyNum * 12)) * 100)
      : null;

  // Diagnostic : ce que le store renvoie réellement pour chaque package (retiré
  // des bundles prod par le logger). Permet de comparer prix affiché vs feuille
  // d'achat si un écart est signalé.
  useEffect(() => {
    if (!offerings) return;
    const dump = (label, pkg) =>
      logger.log(
        `[Paywall] ${label}:`,
        JSON.stringify({
          id: pkg?.product?.identifier,
          priceString: pkg?.product?.priceString,
          price: pkg?.product?.price,
          currency: pkg?.product?.currencyCode,
          packageType: pkg?.packageType,
        }),
      );
    dump('monthly', monthlyPkg);
    dump('annual', annualPkg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings]);

  // Essai gratuit maison (7 jours, sans paiement, via /premium/trial/start) —
  // distinct de l'essai éventuellement proposé par Apple/Google sur l'abonnement
  // lui-même. Un utilisateur qui l'a déjà utilisé une fois (premiumTrialStart
  // déjà défini) ne doit plus se voir proposer "essai gratuit" : il doit
  // directement s'abonner.
  const trialEligible = !user?.premiumTrialStart;

  const handleTrial = async () => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      await IAPStore.startTrial(userId);
      const res = await getMyUser();
      if (res?.user && updateUser) updateUser({ ...user, isPremium: !!res.user.isPremium, premiumTrialStart: res.user.premiumTrialStart, premiumTrialEnd: res.user.premiumTrialEnd });
      setOnboardingVisible(true);
    } catch (e) {
      Alert.alert(t('premiumPaywall.errorTitle'), e.message || t('premiumPaywall.trialError'));
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchase = async () => {
    if (purchasing) return;
    if (!selectedPkg && !DEBUG_CONFIG.IAP_DISABLED) {
      Alert.alert(
        t('premiumPaywall.offersUnavailableTitle'),
        t('premiumPaywall.offersUnavailableMessage'),
      );
      return;
    }
    if (!purchasesReady && !DEBUG_CONFIG.IAP_DISABLED) {
      Alert.alert(t('premiumPaywall.errorTitle'), t('premiumPaywall.initializing'));
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

        // Dans les deux cas (simulation debug ou vrai achat), on célèbre le
        // passage au Premium avec l'onboarding avant de rediriger — pas de
        // reload forcé (Updates.reloadAsync) qui couperait court à
        // l'onboarding ; l'état premium est déjà à jour via updateUser.
        setOnboardingVisible(true);
      }
    } catch (e) {
      if (!e.userCancelled) Alert.alert(t('premiumPaywall.errorTitle'), purchaseErrorMessage(e, t));
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
          Alert.alert(t('premiumPaywall.restoredTitle'), t('premiumPaywall.restoredMessage'));
          onAlreadyPremium ? onAlreadyPremium() : onBack?.();
        } else {
          Alert.alert(t('premiumPaywall.noRestoreTitle'), t('premiumPaywall.noRestoreMessage'));
        }
      }
    } catch (e) {
      Alert.alert(t('premiumPaywall.errorTitle'), e.message || t('premiumPaywall.restoreError'));
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
      <ScreenHeader
        left={{ icon: 'close', onPress: onBack, accessibilityLabel: t('premiumPaywall.closeLabel') }}
        title={t('premiumPaywall.title')}
        subtitle={t('premiumPaywall.subtitle')}
      />

      {/* Debug banner */}
      {DEBUG_CONFIG.IAP_DISABLED && (
        <View style={styles.debugBanner}>
          <Text style={styles.debugBannerText}>{t('premiumPaywall.debugBanner')}</Text>
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
            <Text style={[styles.toggleLabel, { color: period === 'monthly' ? '#fff' : sub }]}>{t('premiumPaywall.monthly')}</Text>
            <Text style={[styles.togglePrice, { color: period === 'monthly' ? '#fff' : text }]}>
              {monthlyPrice ?? PRICE_PLACEHOLDER}
              <Text style={{ fontSize: 12, fontWeight: '600' }}>{t('premiumPaywall.perMonth')}</Text>
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
              <Text style={styles.recommendedRibbonTxt}>{t('premiumPaywall.mostChosen')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Text style={[styles.toggleLabel, { color: period === 'annual' ? '#fff' : sub }]}>{t('premiumPaywall.annual')}</Text>
              {savingsPct != null && savingsPct > 0 && (
                <View
                  style={[
                    styles.savingsBadge,
                    { backgroundColor: period === 'annual' ? 'rgba(255,255,255,0.28)' : '#00c2cb' },
                  ]}
                >
                  <Text style={styles.savingsTxt}>-{savingsPct}%</Text>
                </View>
              )}
            </View>
            <Text style={[styles.togglePrice, { color: period === 'annual' ? '#fff' : text }]}>
              {annualPrice ?? PRICE_PLACEHOLDER}
              <Text style={{ fontSize: 12, fontWeight: '600' }}>{t('premiumPaywall.perYear')}</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Features */}
        <View style={[styles.featuresCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.featuresTitle, { color: sub }]}>{t('premiumPaywall.allIncluded')}</Text>
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
        {(() => {
          const offersMissing = !trialEligible && !selectedPkg && !DEBUG_CONFIG.IAP_DISABLED;
          const showRetry = offersMissing && offersError;
          const onCtaPress = showRetry
            ? () => setOffersRetry((n) => n + 1)
            : trialEligible && !DEBUG_CONFIG.IAP_DISABLED
              ? handleTrial
              : handlePurchase;
          return (
            <TouchableOpacity
              onPress={onCtaPress}
              disabled={purchasing || (offersMissing && !offersError)}
              activeOpacity={0.85}
              style={[
                styles.cta,
                { opacity: purchasing || (offersMissing && !offersError) ? 0.5 : 1 },
                DEBUG_CONFIG.IAP_DISABLED && { backgroundColor: '#f39c12' },
              ]}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {DEBUG_CONFIG.IAP_DISABLED
                    ? t('premiumPaywall.ctaSimulate')
                    : showRetry
                      ? t('premiumPaywall.retry')
                      : trialEligible
                        ? t('premiumPaywall.ctaTrial')
                        : !selectedPkg
                          ? t('premiumPaywall.ctaLoading')
                          : t('premiumPaywall.ctaSubscribe')}
                </Text>
              )}
            </TouchableOpacity>
          );
        })()}
        {(() => {
          const offersMissing = !trialEligible && !selectedPkg && !DEBUG_CONFIG.IAP_DISABLED;
          return offersMissing && offersError ? (
            <Text style={[styles.trialSub, { color: sub }]}>{t('premiumPaywall.offersUnavailableMessage')}</Text>
          ) : null;
        })()}

        {!DEBUG_CONFIG.IAP_DISABLED && (period === 'annual' ? annualPrice : monthlyPrice) && (
          <Text style={[styles.trialSub, { color: sub }]}>
            🔒{' '}
            {period === 'annual'
              ? t('premiumPaywall.thenAnnual', { price: annualPrice })
              : t('premiumPaywall.thenMonthly', { price: monthlyPrice })}
          </Text>
        )}

        {/* Restore */}
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          {restoring ? (
            <ActivityIndicator size="small" color="#00c2cb" />
          ) : (
            <Text style={[styles.restoreTxt, { color: '#00c2cb' }]}>{t('premiumPaywall.restorePurchases')}</Text>
          )}
        </TouchableOpacity>

        {/* Legal */}
        <Text style={[styles.legal, { color: sub }]}>
          {t('premiumPaywall.legalText', { store: STORE_NAME })}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            {t('premiumPaywall.privacyPolicy')}
          </Text>
          {' · '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(TERMS_URL)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            {t('premiumPaywall.terms')}
          </Text>
          {' · '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(APPLE_EULA_URL)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            EULA
          </Text>
        </Text>
      </ScrollView>

      <PremiumWelcomeOnboarding visible={onboardingVisible} onClose={handleOnboardingClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 4,
  },
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,194,203,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
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

import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView, Image, PanResponder, Platform, Linking } from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { getMyUser, startPremiumTrial, verifyPurchase } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { UserContext } from '../components/contexts/UserContext';
import * as IAP from 'react-native-iap';

const { width, height } = Dimensions.get('window');

const itemSkus = Platform.select({
  ios: ['com.loocateme.premium.monthly', 'com.loocateme.premium.yearly'],
  android: ['com.loocateme.premium.monthly', 'com.loocateme.premium.yearly'],
});

export default function PremiumPaywallScreen({ onBack, onAlreadyPremium }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [iapAvailable, setIapAvailable] = useState(false);
  const { user, updateUser } = useContext(UserContext);

  // Initialisation IAP
  useEffect(() => {
    let purchaseUpdateSubscription;
    let purchaseErrorSubscription;
    let isMounted = true;

    const initIAP = async () => {
      try {
        console.log('[IAP] Initializing connection...');
        const connected = await IAP.initConnection();
        console.log('[IAP] Connected:', connected);

        if (!connected) {
          console.warn('[IAP] initConnection returned false');
          return;
        }

        if (isMounted) setIapAvailable(true);

        if (Platform.OS === 'android') {
          await IAP.flushFailedPurchasesCachedAsPendingAndroid();
        }
        const getProducts = await IAP.getSubscriptions({ skus: itemSkus });
        console.log('[IAP] Subscriptions found:', getProducts.length);
        if (isMounted) setProducts(getProducts);

        purchaseUpdateSubscription = IAP.purchaseUpdatedListener(async (purchase) => {
          const receipt = purchase.transactionReceipt;
          if (receipt) {
            try {
              if (isMounted) setLoading(true);
              const res = await verifyPurchase({
                platform: Platform.OS,
                receipt: receipt,
                productId: purchase.productId,
                packageName: Platform.OS === 'android' ? purchase.packageNameAndroid : undefined,
              });
              if (res.success) {
                await IAP.finishTransaction({ purchase, isConsumable: false });
                Alert.alert('Succès', 'Votre abonnement est activé !');
                const userRes = await getMyUser();
                if (updateUser && isMounted) updateUser(userRes.user);
              }
            } catch (err) {
              console.error('[IAP] Verification error', err);
              Alert.alert('Erreur', 'Impossible de valider votre achat auprès du serveur.');
            } finally {
              if (isMounted) setLoading(false);
            }
          }
        });

        purchaseErrorSubscription = IAP.purchaseErrorListener((error) => {
          console.warn('[IAP] purchaseErrorListener', error);
          if (error.code !== 'E_USER_CANCELLED') {
            Alert.alert('Erreur de paiement', error.message);
          }
        });
      } catch (err) {
        console.warn('[IAP] init error', err.code, err.message);
        // E_IAP_NOT_AVAILABLE is common in Expo Go / Emulators without Store
        if (err.code === 'E_IAP_NOT_AVAILABLE') {
          console.info('[IAP] Native IAP not available. This is expected in Expo Go or emulators without store support.');
        }
      }
    };

    initIAP();

    return () => {
      isMounted = false;
      if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
      if (purchaseErrorSubscription) purchaseErrorSubscription.remove();
      IAP.endConnection();
    };
  }, []);

  // Si l'utilisateur est déjà Premium, rediriger directement
  useEffect(() => {
    try {
      const premium = !!user?.isPremium;
      if (premium) {
        // Rediriger immédiatement vers Statistiques si possible, sinon retour
        if (onAlreadyPremium) onAlreadyPremium();
        else if (onBack) onBack();
      }
    } catch (_) {
      // ignore
    }
    // We only want to check when user or dates change
  }, [user?.isPremium]);

  // Double-vérification côté serveur pour éviter les états de contexte obsolètes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        if (!me || cancelled) return;
        // Optionnel: synchroniser le contexte si les flags ont changé
        try {
          if (updateUser) {
            updateUser({
              ...user,
              isPremium: !!me.isPremium,
              premiumTrialEnd: me.premiumTrialEnd || null,
            });
          }
        } catch (_) {}
        const premium = !!me.isPremium;
        if (premium) {
          if (onAlreadyPremium) onAlreadyPremium();
          else if (onBack) onBack();
        }
      } catch (_) {
        // en cas d'erreur réseau, on laisse l'écran tel quel
      }
    })();
    return () => { cancelled = true; };
    // On veut exécuter cette vérif uniquement au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Réagir au signal global de reload UI (ex: upgrade/downgrade depuis un autre écran/appareil)
  useEffect(() => {
    const off = subscribe('ui:reload', async () => {
      try {
        const res = await getMyUser();
        const me = res?.user;
        const nowPremium = !!me?.isPremium;
        if (nowPremium) {
          if (onAlreadyPremium) onAlreadyPremium();
          else if (onBack) onBack();
        }
      } catch (_) {}
    });
    return () => { try { off && off(); } catch (_) {} };
  }, []);

  // Geste de retour (slide droite)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => {
        const isH = Math.abs(g.dx) > Math.abs(g.dy);
        return isH && g.dx > 10; // gauche -> droite
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dx > 60 || g.vx > 0.3) {
          onBack && onBack();
        }
      },
    })
  ).current;

  const handleStartTrial = async () => {
    try {
      setLoading(true);
      const res = await startPremiumTrial();
      if (res.success) {
        Alert.alert('Essai activé !', 'Vous profitez maintenant de 7 jours gratuits.');
        const userRes = await getMyUser();
        if (updateUser) updateUser(userRes.user);
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || "Impossible de démarrer l'essai gratuit");
    } finally {
      setLoading(false);
    }
  };

  const requestSubscription = async (sku) => {
    try {
      setLoading(true);
      await IAP.requestSubscription({ sku });
    } catch (err) {
      console.warn(err.code, err.message);
      if (err.code !== 'E_USER_CANCELLED') {
        Alert.alert('Erreur', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: colors.accent }]} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.accent }]}>Passer en Premium</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.hero, { color: colors.textPrimary }]}>Débloque plus d’informations</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Accède aux détails des visiteurs de ton profil, reçois des notifications plus précises et suis tes statistiques plus finement.
          </Text>
          <View style={styles.bullets}>
            <Text style={[styles.bullet, { color: colors.textPrimary }]}>• Détails des visites</Text>
            <Text style={[styles.bullet, { color: colors.textPrimary }]}>• Notifications enrichies</Text>
            <Text style={[styles.bullet, { color: colors.textPrimary }]}>• Statistiques avancées</Text>
          </View>
        </View>

        {!user?.premiumTrialEnd && (
          <TouchableOpacity disabled={loading} onPress={handleStartTrial} style={[styles.cta, { backgroundColor: colors.accent, marginBottom: 20 }]}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Essai gratuit 7 jours</Text>
            )}
          </TouchableOpacity>
        )}

        {products.map((p) => (
          <TouchableOpacity
            key={p.productId}
            disabled={loading}
            onPress={() => requestSubscription(p.productId)}
            style={[styles.productBtn, { borderColor: colors.accent, backgroundColor: colors.surface }]}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.productTitle, { color: colors.textPrimary }]}>{p.title}</Text>
              <Text style={[styles.productDesc, { color: colors.textSecondary }]}>{p.description}</Text>
            </View>
            <Text style={[styles.productPrice, { color: colors.accent }]}>{p.localizedPrice}</Text>
          </TouchableOpacity>
        ))}

        {products.length === 0 && !loading && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            {iapAvailable ? (
              <Text style={{ textAlign: 'center', color: colors.textSecondary }}>
                Chargement des abonnements...
              </Text>
            ) : (
              <View>
                <Text style={{ textAlign: 'center', color: colors.textSecondary, marginBottom: 10 }}>
                  Les achats intégrés ne sont pas disponibles dans cet environnement.
                </Text>
                <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12 }}>
                  (Note : Utilisez un build natif EAS pour tester les paiements réels)
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: height * 0.02 },
  backBtn: { padding: 8 },
  backIcon: { width: 28, height: 28 },
  title: { fontSize: Math.min(width * 0.07, 28), fontWeight: 'bold' },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  hero: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15 },
  bullets: { marginTop: 12 },
  bullet: { fontSize: 16, marginVertical: 4 },
  cta: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  productBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  productTitle: { fontSize: 17, fontWeight: '700' },
  productDesc: { fontSize: 13 },
  productPrice: { fontSize: 18, fontWeight: '800' },
});

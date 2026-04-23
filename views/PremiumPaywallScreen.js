import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView, Image, PanResponder, Platform, Linking } from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { getMyUser, startPremiumTrial, verifyPurchase } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { UserContext } from '../components/contexts/UserContext';
import { usePurchase } from '../hooks/usePurchase';

const { width, height } = Dimensions.get('window');

export default function PremiumPaywallScreen({ onBack, onAlreadyPremium }) {
  const { colors, isDark } = useTheme();
  const { user, updateUser } = useContext(UserContext);
  const { offerings, loading, purchasePackage } = usePurchase();

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

  const handlePurchase = async (pkg) => {
    const res = await purchasePackage(pkg);
    if (res.success) {
      Alert.alert('Succès', 'Votre achat a été validé !');
      const userRes = await getMyUser();
      if (updateUser) updateUser(userRes.user);
      if (onAlreadyPremium) onAlreadyPremium();
      else if (onBack) onBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={onBack}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Passer en Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.hero, { color: '#00c2cb' }]}>Débloquez plus d’informations</Text>
          <Text style={[styles.subtitle, { color: colors.text, opacity: 0.7 }]}>
            Accédez aux détails des visiteurs de votre profil, recevez des notifications précises et suivez vos statistiques finement.
          </Text>
          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>👀</Text>
                <Text style={[styles.bullet, { color: colors.text }]}>Détails des visites</Text>
            </View>
            <View style={styles.bulletRow}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>🔔</Text>
                <Text style={[styles.bullet, { color: colors.text }]}>Notifications enrichies</Text>
            </View>
            <View style={styles.bulletRow}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>📊</Text>
                <Text style={[styles.bullet, { color: colors.text }]}>Statistiques avancées</Text>
            </View>
          </View>
        </View>

        {!user?.premiumTrialEnd && (
          <TouchableOpacity disabled={loading} onPress={handleStartTrial} style={[styles.cta, { backgroundColor: '#00c2cb', marginBottom: 25 }]}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Essai gratuit 7 jours</Text>
            )}
          </TouchableOpacity>
        )}

        {offerings?.availablePackages?.map((p) => (
          <TouchableOpacity
            key={p.identifier}
            disabled={loading}
            onPress={() => handlePurchase(p)}
            style={[styles.productBtn, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', backgroundColor: colors.surface }]}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.productTitle, { color: colors.text }]}>{p.product.title}</Text>
              <Text style={[styles.productDesc, { color: colors.text, opacity: 0.5 }]}>{p.product.description}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(0,194,203,0.1)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 }}>
                <Text style={[styles.productPrice, { color: '#00c2cb' }]}>{p.product.priceString}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {(!offerings || offerings.availablePackages.length === 0) && !loading && (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20 }}>
            <View>
              <Text style={{ textAlign: 'center', color: colors.text, opacity: 0.7, marginBottom: 10, fontWeight: '600' }}>
                Chargement des offres...
              </Text>
              <Text style={{ textAlign: 'center', color: colors.text, opacity: 0.4, fontSize: 12 }}>
                Assurez-vous d'être sur un appareil réel pour voir les abonnements.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  backButtonCircular: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { width: 24, height: 24 },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  hero: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  subtitle: { fontSize: 16, lineHeight: 22, marginBottom: 20 },
  bullets: { marginTop: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  bullet: { fontSize: 17, fontWeight: '600' },
  cta: { borderRadius: 15, paddingVertical: 18, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  productBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  productTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  productDesc: { fontSize: 14, lineHeight: 18 },
  productPrice: { fontSize: 18, fontWeight: '800' },
});

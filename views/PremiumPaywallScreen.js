import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView, Image, PanResponder, Platform, Linking } from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { getMyUser } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';

const { width, height } = Dimensions.get('window');

export default function PremiumPaywallScreen({ onBack, onAlreadyPremium }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const { user, updateUser } = useContext(UserContext);

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

  // Redirection vers les pages d’abonnement/paiement des stores
  const openPurchaseFlow = async () => {
    try {
      setLoading(true);
      const iosUrl = process.env.EXPO_PUBLIC_IOS_SUB_URL || process.env.EXPO_PUBLIC_IOS_APP_URL || '';
      const androidUrl = process.env.EXPO_PUBLIC_ANDROID_SUB_URL || process.env.EXPO_PUBLIC_ANDROID_APP_URL || '';
      const target = Platform.OS === 'ios' ? iosUrl : androidUrl;
      if (!target) {
        Alert.alert('Indisponible', 'Lien de paiement non configuré. Définissez EXPO_PUBLIC_IOS_SUB_URL / EXPO_PUBLIC_ANDROID_SUB_URL.');
        return;
      }
      const supported = await Linking.canOpenURL(target);
      if (supported) {
        await Linking.openURL(target);
      } else {
        Alert.alert('Indisponible', "Impossible d'ouvrir la page de paiement");
      }
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'ouvrir la page de paiement");
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

        <TouchableOpacity disabled={loading} onPress={openPurchaseFlow} style={[styles.cta, { backgroundColor: colors.accent }]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Essai gratuit 7 jours</Text>
          )}
        </TouchableOpacity>
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
});

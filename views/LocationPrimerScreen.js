import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { markLocationPrimerSeen } from '../utils/onboarding';
import { deferBackgroundPermissionPrompt } from '../utils/backgroundPermissionPrompt';

const { width: W } = Dimensions.get('window');

export default function LocationPrimerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const goToLogin = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const requestPermission = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Demande uniquement l'autorisation "foreground" (Lorsque l'app est active).
      // Le passage en mode "Toujours" reste géré plus tard (BackgroundLocation /
      // LocationPermissionModal), après connexion.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        // On vient de demander la localisation ici : on repousse le rappel
        // "Position Toujours" pour ne pas l'enchaîner juste après le login.
        await deferBackgroundPermissionPrompt();
      }
    } catch (_) {
      // On ne bloque jamais l'utilisateur sur une erreur du prompt système.
    } finally {
      await markLocationPrimerSeen();
      setBusy(false);
      goToLogin();
    }
  };

  const skip = async () => {
    await markLocationPrimerSeen();
    goToLogin();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0A0617', '#1B1030']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.bubble}>
            <Text style={styles.emoji}>📍</Text>
          </View>
          <View style={styles.accentLine} />
          <Text style={styles.title}>{t('locationPrimer.title')}</Text>
          <Text style={styles.desc}>{t('locationPrimer.desc')}</Text>
          <Text style={styles.note}>{t('locationPrimer.note')}</Text>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity onPress={requestPermission} activeOpacity={0.85} disabled={busy}>
            <LinearGradient
              colors={['#FF3DAD', '#8A4BFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.cta, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.ctaTxt}>{t('locationPrimer.allow')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={skip} style={styles.skipBtn} disabled={busy}>
            <Text style={styles.skipTxt}>{t('locationPrimer.later')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bubble: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    borderColor: '#FF3DAD55',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#FF3DAD',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  emoji: { fontSize: 48, textAlign: 'center' },
  accentLine: { width: 36, height: 3, borderRadius: 2, backgroundColor: '#FF3DAD', marginBottom: 20 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  desc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  note: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 19,
  },
  bottom: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  cta: {
    width: W - 48,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  skipBtn: { marginTop: 14, paddingVertical: 6 },
  skipTxt: { color: 'rgba(255,255,255,0.40)', fontSize: 14, fontWeight: '500' },
});

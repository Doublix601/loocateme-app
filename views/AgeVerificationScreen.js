import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { startAgeVerificationSession, getAgeVerificationStatus } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { navigateAfterAuth } from '../utils/onboarding';

// Vérification d'âge tierce (Didit) : obligatoire suite au consentement RGPD,
// avant l'accès à l'application (loi "majorité numérique" — le simple
// déclaratif de date de naissance saisi à l'inscription ne suffit pas).
export default function AgeVerificationScreen() {
  const navigation = useNavigation();
  const { user, updateUser } = useContext(UserContext);
  const { colors } = useTheme();
  const [verificationUrl, setVerificationUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    startSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startSession = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await startAgeVerificationSession();
      if (res?.status === 'approved') {
        return onApproved();
      }
      if (!res?.verificationUrl) throw new Error('URL de vérification manquante');
      setVerificationUrl(res.verificationUrl);
      startPolling();
    } catch (e) {
      setError("Impossible de démarrer la vérification d'âge. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await getAgeVerificationStatus();
        const status = res?.ageVerification?.status;
        if (status === 'approved') {
          clearInterval(pollRef.current);
          onApproved();
        } else if (status === 'declined') {
          clearInterval(pollRef.current);
          onDeclined();
        }
      } catch (_) {
        // silent retry on next tick
      }
    }, 4000);
  };

  const onApproved = async () => {
    try {
      if (updateUser) {
        updateUser({ ...user, ageVerification: { status: 'approved' } });
      }
    } catch (_) {}
    await navigateAfterAuth(navigation);
  };

  const onDeclined = () => {
    Alert.alert(
      'Vérification refusée',
      "Nous n'avons pas pu confirmer que vous avez plus de 18 ans. Vous pouvez réessayer.",
      [{ text: 'Réessayer', onPress: startSession }],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Vérification d'âge</Text>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={startSession}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && verificationUrl && (
        <WebView
          source={{ uri: verificationUrl }}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#00c2cb" />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  webview: { flex: 1 },
  errorText: { fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: '#00c2cb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '700' },
});

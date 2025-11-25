import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { startPremiumTrial } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export default function PremiumPaywallScreen({ onBack, onTrialStarted }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

  const onStartTrial = async () => {
    try {
      setLoading(true);
      const res = await startPremiumTrial();
      if (res?.success) {
        onTrialStarted && onTrialStarted();
        return;
      }
      Alert.alert('Erreur', "Impossible de démarrer l'essai gratuit");
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible de démarrer l'essai gratuit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>◀</Text>
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

        <TouchableOpacity disabled={loading} onPress={onStartTrial} style={[styles.cta, { backgroundColor: colors.accent }]}>
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
  backText: { fontSize: 18 },
  title: { fontSize: Math.min(width * 0.07, 28), fontWeight: 'bold' },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  hero: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15 },
  bullets: { marginTop: 12 },
  bullet: { fontSize: 16, marginVertical: 4 },
  cta: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});

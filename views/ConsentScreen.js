import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { getPrivacyPolicy, updateConsent, logout } from '../components/ApiRequest';

export default function ConsentScreen({ onAccepted, onDeclined }) {
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getPrivacyPolicy();
        if (mounted) setPolicy(res?.policy || '');
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleAccept = async () => {
    try {
      setAccepting(true);
      await updateConsent({ accepted: true, version: 'v1' });
      onAccepted && onAccepted();
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'enregistrer votre consentement. Réessayez.");
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    try {
      Alert.alert('Information', "Vous devez accepter la politique de confidentialité pour utiliser l'application.");
      await logout();
      onDeclined && onDeclined();
    } catch { /* noop */ }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Politique de confidentialité</Text></View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.policyText}>{policy}</Text>
        </ScrollView>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.decline]} onPress={handleDecline} disabled={accepting}>
          <Text style={styles.buttonText}>Refuser</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.accept]} onPress={handleAccept} disabled={accepting}>
          <Text style={styles.buttonText}>{accepting ? 'Enregistrement...' : 'Accepter'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: '#222' },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  policyText: { fontSize: 14, color: '#333', lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  button: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', marginHorizontal: 6 },
  decline: { backgroundColor: '#999' },
  accept: { backgroundColor: '#00c2cb' },
  buttonText: { color: '#fff', fontWeight: '600' },
});

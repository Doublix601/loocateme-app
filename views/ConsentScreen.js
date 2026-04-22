import React, { useEffect, useState, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPrivacyPolicy, updateConsent, logout } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';

export default function ConsentScreen({ onAccepted, onDeclined }) {
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState('');
  const [accepting, setAccepting] = useState(false);
  const { user, updateUser } = useContext(UserContext);
  const { colors, isDark } = useTheme();

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
      if (updateUser) {
        try {
          updateUser({ ...user, consent: { accepted: true, version: 'v1', consentAt: new Date().toISOString() } });
        } catch (_) { /* ignore mapping issues */ }
      }
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Confidentialité</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.policyText, { color: colors.text }]}>{policy}</Text>
          </View>
        </ScrollView>
      )}

      <View style={[styles.actions, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={[styles.button, styles.decline, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} onPress={handleDecline} disabled={accepting}>
          <Text style={[styles.buttonText, { color: colors.text, opacity: 0.6 }]}>Refuser</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.accept]} onPress={handleAccept} disabled={accepting}>
          <Text style={styles.buttonText}>{accepting ? 'Enregistrement...' : 'Accepter'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20 },
  card: { borderRadius: 20, padding: 20, marginBottom: 20 },
  policyText: { fontSize: 14, lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  button: { flex: 1, paddingVertical: 16, borderRadius: 15, alignItems: 'center', marginHorizontal: 8 },
  decline: {},
  accept: { backgroundColor: '#00c2cb' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView } from 'react-native';
import { exportMyData, deleteMyAccount, logout } from '../components/ApiRequest';

export default function DataManagementScreen({ onBackToAccount }) {
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);

  const handleExport = async () => {
    try {
      setWorking(true);
      const data = await exportMyData();
      // For simplicity in RN, just show a success and log the JSON in console.
      console.log('My data export:', data);
      Alert.alert('Export des données', "Votre export a été généré. Il a été affiché dans la console.");
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'exporter vos données maintenant. Réessayez.");
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Mot de passe requis', 'Merci de saisir votre mot de passe.');
      return;
    }
    Alert.alert('Confirmation', 'Cette action est irréversible. Voulez-vous vraiment supprimer votre compte ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            setWorking(true);
            await deleteMyAccount({ password });
            await logout();
            Alert.alert('Compte supprimé', 'Votre compte et vos données ont été supprimés.');
            onBackToAccount && onBackToAccount('Login');
          } catch (e) {
            Alert.alert('Erreur', "Suppression impossible. Mot de passe invalide ou problème serveur.");
          } finally {
            setWorking(false);
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onBackToAccount && onBackToAccount()} style={styles.backBtn}><Text style={styles.backText}>{'< Retour'}</Text></TouchableOpacity>
        <Text style={styles.title}>Données et confidentialité</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Exporter mes données</Text>
          <Text style={styles.cardDesc}>Téléchargez une copie de vos informations (profil, réseaux sociaux, paramètres).</Text>
          <TouchableOpacity style={styles.primary} disabled={working} onPress={handleExport}><Text style={styles.primaryText}>{working ? 'Veuillez patienter...' : 'Exporter'}</Text></TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Supprimer mon compte</Text>
          <Text style={styles.cardDesc}>Supprime définitivement votre compte et toutes les données associées.</Text>
          <TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Mot de passe" placeholderTextColor="#666" style={styles.input} />
          <TouchableOpacity style={styles.danger} disabled={working} onPress={handleDelete}><Text style={styles.dangerText}>Supprimer mon compte</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#00c2cb', fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  content: { padding: 16 },
  card: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#444', marginBottom: 12 },
  primary: { backgroundColor: '#00c2cb', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  danger: { backgroundColor: '#e03131', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
});

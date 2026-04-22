import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, Image, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exportMyData, deleteMyAccount, logout } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export default function DataManagementScreen({ onBackToAccount }) {
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const { colors, isDark } = useTheme();

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={() => onBackToAccount && onBackToAccount()}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Exporter mes données</Text>
          <Text style={[styles.cardDesc, { color: colors.text, opacity: 0.7 }]}>Téléchargez une copie de vos informations (profil, réseaux sociaux, paramètres).</Text>
          <TouchableOpacity style={styles.primary} disabled={working} onPress={handleExport}>
            <Text style={styles.primaryText}>{working ? 'Veuillez patienter...' : 'Exporter'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Supprimer mon compte</Text>
          <Text style={[styles.cardDesc, { color: colors.text, opacity: 0.7 }]}>Supprime définitivement votre compte et toutes les données associées.</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Confirmez avec votre mot de passe"
            placeholderTextColor={isDark ? '#888' : '#999'}
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          />
          <TouchableOpacity style={styles.danger} disabled={working} onPress={handleDelete}>
            <Text style={styles.dangerText}>Supprimer définitivement</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  content: { padding: 20 },
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
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  cardDesc: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  primary: { backgroundColor: '#00c2cb', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  danger: { backgroundColor: '#ff4444', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 15, fontSize: 15 },
});

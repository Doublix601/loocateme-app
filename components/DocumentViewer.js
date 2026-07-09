import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Linking, Alert } from 'react-native';
import { BASE_URL, getAccessToken } from './ApiRequest';

// Ouvre un document protégé (KBIS, pièce d'identité...) dans le navigateur/
// visualiseur système de l'appareil. Le token d'accès est passé en query car
// Linking.openURL ne permet pas d'attacher un header Authorization ; la route
// backend accepte explicitement ce mode pour cette preview (cf.
// requireAuthFromHeaderOrQuery dans businessClaim.routes.js).
const DocumentViewer = ({ path, label }) => {
  const handleOpen = async () => {
    const token = getAccessToken();
    if (!token || !path) return;
    const url = `${BASE_URL}${path}?token=${encodeURIComponent(token)}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir ce document.");
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleOpen}>
      <Text style={styles.buttonText}>📄 {label || 'Voir le document'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(0,194,203,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
    marginTop: 6,
  },
  buttonText: {
    color: '#00c2cb',
    fontWeight: '700',
    fontSize: 12,
  },
});

export default DocumentViewer;

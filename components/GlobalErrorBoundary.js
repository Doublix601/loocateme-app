import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_FATAL_ERROR_STORAGE_KEY } from '../errorReporting';

// Filet de sécurité ultime autour de tout l'arbre React : si un composant
// plante pendant le rendu (avant même que l'UI ne s'affiche), on affiche cet
// écran plutôt que de laisser l'exception non rattrapée remonter jusqu'à
// RCTFatal -> ErrorRecovery d'expo-updates -> abort() natif (cf. rejet Apple
// Review Guideline 2.1(a), "crashed on launch", review du 23/08/2026).
// Volontairement sans dépendance à ThemeContext/i18n/etc. : ce sont
// potentiellement elles qui plantent, cet écran doit rester autonome.
export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      const payload = JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: info?.componentStack || null,
        ts: Date.now(),
      });
      AsyncStorage.setItem(LAST_FATAL_ERROR_STORAGE_KEY, payload).catch(() => {});
    } catch (_) {}
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Un problème est survenu</Text>
          <Text style={styles.message}>
            L'application a rencontré une erreur inattendue. Réessayez, ou fermez et rouvrez
            l'application si le problème persiste.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#ffffff' },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#00c2cb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 16 },
});

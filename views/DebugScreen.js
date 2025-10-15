import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { getAllUsers } from '../components/ApiRequest';

const DebugScreen = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runAllApiUsers = async () => {
    try {
      setLoading(true);
      setResult(null);
      const res = await getAllUsers({ page: 1, limit: 100 });
      setResult(res);
    } catch (e) {
      console.error('[DebugScreen] All API users error', e);
      Alert.alert('Erreur', e?.message || 'Impossible de récupérer les utilisateurs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>{'< Retour'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Debug</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Commandes</Text>
        <TouchableOpacity style={styles.cmdBtn} onPress={runAllApiUsers} disabled={loading}>
          <Text style={styles.cmdTxt}>All API users</Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator size="small" color="#00c2cb" />
          </View>
        )}

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Résultat</Text>
            {typeof result.total !== 'undefined' && (
              <Text style={styles.resultMeta}>Total: {String(result.total)}</Text>
            )}
            <Text selectable style={styles.resultText}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1014' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2a34' },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  backTxt: { color: '#9ab', fontSize: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  content: { padding: 16 },
  sectionTitle: { color: '#cde', fontSize: 16, marginBottom: 8 },
  cmdBtn: { backgroundColor: '#14212b', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e2d39' },
  cmdTxt: { color: '#fff', fontSize: 16 },
  resultBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1e2d39', marginTop: 12 },
  resultTitle: { color: '#9ab', marginBottom: 4, fontWeight: '600' },
  resultMeta: { color: '#9ab', marginBottom: 8 },
  resultText: { color: '#cde', fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
});

export default DebugScreen;

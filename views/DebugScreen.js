import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { getAllUsers, setUserPremium, searchUsers } from '../components/ApiRequest';

const DebugScreen = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [users, setUsers] = useState([]);
  // Recherche utilisateur
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const debRef = useRef(null);

  const runAllApiUsers = async () => {
    try {
      setLoading(true);
      setResult(null);
      const res = await getAllUsers({ page: 1, limit: 100 });
      setResult(res);
      setUsers(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      console.error('[DebugScreen] All API users error', e);
      Alert.alert('Erreur', e?.message || 'Impossible de récupérer les utilisateurs.');
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = async (userId, isPremium) => {
    try {
      setLoading(true);
      await setUserPremium(userId, isPremium);
      // Optimistic update
      setUsers((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, isPremium } : u)));
      setResults((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, isPremium } : u)));
      setSelectedUser((prev) => (prev && String(prev._id || prev.id) === String(userId) ? { ...prev, isPremium } : prev));
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de changer le rôle.');
    } finally {
      setLoading(false);
    }
  };

  // Recherche avec debounce
  useEffect(() => {
    const q = String(query || '').trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (!q) { setResults([]); setSearching(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await searchUsers({ q, limit: 10 });
        const list = Array.isArray(res?.users) ? res.users : [];
        setResults(list);
      } catch (_e) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>{'< Retour'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Debug</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Recherche utilisateur */}
        <Text style={styles.sectionTitle}>Recherche utilisateur (debug)</Text>
        <View style={styles.searchBar}>
          <Text style={{ color: '#cde', marginRight: 8 }}>🔎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nom, prénom, username..."
            placeholderTextColor="#7a8a99"
            style={styles.input}
          />
        </View>
        {searching ? (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 8 }} />
        ) : (
          results.length > 0 && (
            <View style={styles.resultsBox}>
              {results.map((u) => (
                <TouchableOpacity key={String(u._id || u.id)} style={styles.resultRow} onPress={() => setSelectedUser(u)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {(u.username || u.customName || u.firstName || u.email || 'Utilisateur')}
                  </Text>
                  <Text style={[styles.badge, u.isPremium ? styles.badgePrem : styles.badgeFree]}>
                    {u.isPremium ? 'Premium' : 'Free'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {selectedUser && (
          <View style={styles.selectedBox}>
            <Text style={styles.selectedTitle}>Utilisateur sélectionné</Text>
            <Text style={styles.selectedName} numberOfLines={1}>
              {(selectedUser.username || selectedUser.customName || selectedUser.firstName || selectedUser.email || 'Utilisateur')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Text style={[styles.badge, selectedUser.isPremium ? styles.badgePrem : styles.badgeFree]}>
                {selectedUser.isPremium ? 'Premium' : 'Free'}
              </Text>
              <TouchableOpacity style={[styles.smallBtn, styles.btnPrem, { marginLeft: 8 }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, true)}>
                <Text style={styles.smallBtnTxt}>Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.btnFree, { marginLeft: 8 }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, false)}>
                <Text style={styles.smallBtnTxt}>Free</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Commandes</Text>
        <TouchableOpacity style={styles.cmdBtn} onPress={runAllApiUsers} disabled={loading}>
          <Text style={styles.cmdTxt}>All API users</Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator size="small" color="#00c2cb" />
          </View>
        )}

        {/* Liste des utilisateurs avec actions Premium/Free */}
        {users.length > 0 && (
          <View style={styles.usersBox}>
            {users.map((u) => (
              <View key={String(u._id || u.id)} style={styles.userRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u.username || u.customName || u.firstName || u.email || 'Utilisateur'}
                </Text>
                <Text style={[styles.badge, u.isPremium ? styles.badgePrem : styles.badgeFree]}>
                  {u.isPremium ? 'Premium' : 'Free'}
                </Text>
                <TouchableOpacity style={[styles.smallBtn, styles.btnPrem]}
                                  onPress={() => togglePremium(u._id || u.id, true)}>
                  <Text style={styles.smallBtnTxt}>Premium</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, styles.btnFree]}
                                  onPress={() => togglePremium(u._id || u.id, false)}>
                  <Text style={styles.smallBtnTxt}>Free</Text>
                </TouchableOpacity>
              </View>
            ))}
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
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#1e2d39', backgroundColor: '#0f1418', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, color: '#cde', fontSize: 16 },
  resultsBox: { backgroundColor: '#0f1418', borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#1e2d39' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#14212b' },
  resultName: { color: '#cde', flex: 1, marginRight: 8 },
  selectedBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e2d39', marginTop: 8 },
  selectedTitle: { color: '#9ab', marginBottom: 4, fontWeight: '600' },
  selectedName: { color: '#cde', fontSize: 16 },
  cmdBtn: { backgroundColor: '#14212b', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e2d39' },
  cmdTxt: { color: '#fff', fontSize: 16 },
  resultBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1e2d39', marginTop: 12 },
  resultTitle: { color: '#9ab', marginBottom: 4, fontWeight: '600' },
  resultMeta: { color: '#9ab', marginBottom: 8 },
  resultText: { color: '#cde', fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  usersBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#1e2d39', marginTop: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  userName: { color: '#cde', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8, fontSize: 12 },
  badgePrem: { backgroundColor: '#2d4', color: '#041' },
  badgeFree: { backgroundColor: '#246', color: '#cde' },
  smallBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, marginLeft: 6 },
  btnPrem: { backgroundColor: '#1e7f3b' },
  btnFree: { backgroundColor: '#7f1e1e' },
  smallBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default DebugScreen;

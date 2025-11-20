import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, PanResponder } from 'react-native';
import { searchUsers } from '../components/ApiRequest';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode';

export default function UserSearchView({ onClose, onSelectUser }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const debRef = useRef(null);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => {
        const isH = Math.abs(g.dx) > Math.abs(g.dy);
        return isH && g.dx < -10; // right-to-left to close
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dx < -60 || g.vx < -0.3) {
          onClose && onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    const q = query.trim();
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
      try {
        setLoading(true);
        const res = await searchUsers({ q, limit: 10 });
        const users = res?.users || [];
        const mapped = users.map((u) => ({
          _id: u._id || u.id,
          firstName: (u.firstName || '').trim(),
          lastName: (u.lastName || '').trim(),
          customName: (u.customName || '').trim(),
          username: (u.name || u.email?.split('@')[0] || 'Utilisateur'),
          photo: u.profileImageUrl || null,
        }));
        setResults(mapped);
      } catch (_e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  const getDisplayName = (item) => {
    const full = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
    const custom = (item.customName || '').trim();
    return full || custom || item.username || 'Utilisateur';
  };

  const renderRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => onSelectUser && onSelectUser(item)}>
      {item.photo ? (
        <Image source={{ uri: item.photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{(getDisplayName(item)[0] || 'U').toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.rowText} numberOfLines={1}>{getDisplayName(item)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>✖</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recherche</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.searchBar}>
        <Text style={{ marginRight: 8 }}>🔎</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher par nom"
          placeholderTextColor="#999"
          style={styles.input}
          autoFocus
        />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it, i) => String(it._id || it.id || i)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={(
            <View style={{ padding: 20 }}>
              <Text style={{ textAlign: 'center', color: '#666' }}>Tape au moins 2 lettres pour lancer la recherche</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: width * 0.05, paddingTop: height * 0.02 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: width * 0.07, fontWeight: 'bold', color: '#00c2cb' },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  input: { flex: 1, fontSize: 16, color: '#333' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowText: { marginLeft: 12, fontSize: 16, color: '#333', flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
});

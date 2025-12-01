import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, PanResponder } from 'react-native';
import { searchUsers, trackUserSearch } from '../components/ApiRequest';
import { proxifyImageUrl } from '../components/ServerUtils';
import { useTheme } from '../components/contexts/ThemeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode';

export default function UserSearchView({ onClose, onSelectUser }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const debRef = useRef(null);
  const { colors, isDark } = useTheme();

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
        // Fire-and-forget tracking of the search query
        try { await trackUserSearch(q); } catch (_) {}
        const res = await searchUsers({ q, limit: 10 });
        const users = res?.users || [];
        const mapped = users.map((u) => ({
          _id: u._id || u.id,
          firstName: (u.firstName || '').trim(),
          lastName: (u.lastName || '').trim(),
          customName: (u.customName || '').trim(),
          username: (u.username || u.name || u.email?.split('@')[0] || 'Utilisateur'),
          photo: u.profileImageUrl || null,
          bio: u.bio || '',
          // Pass raw backend social networks mapped to UI shape expected by UserProfileScreen
          socialMedias: Array.isArray(u.socialNetworks)
            ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
            : [],
          // Keep raw coordinates to allow distance computation in the Profile screen
          locationCoordinates: Array.isArray(u?.location?.coordinates) ? u.location.coordinates : null,
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
    const first = (item.firstName || '').trim();
    const last = (item.lastName || '').trim();
    const hasFull = first && last;
    const full = hasFull ? `${first} ${last}`.trim() : '';
    const custom = (item.customName || '').trim();
    return full || custom || item.username || 'Utilisateur';
  };

  const renderRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => onSelectUser && onSelectUser(item)}>
      {item.photo ? (
        <ImageWithPlaceholder uri={item.photo} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{(getDisplayName(item)[0] || 'U').toUpperCase()}</Text>
        </View>
      )}
      <Text style={[styles.rowText, { color: colors.textPrimary }]} numberOfLines={1}>{getDisplayName(item)}</Text>
    </TouchableOpacity>
  );

  const minChars = 2;
  const qTrim = query.trim();
  const showInfoMsg = !loading && results.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: colors.textPrimary }}>✖</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.accent }]}>Recherche</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ marginRight: 8 }}>🔎</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher par nom"
          placeholderTextColor={isDark ? '#999' : '#666'}
          style={[styles.input, { color: colors.textPrimary }]}
          autoFocus
        />
      </View>
      {showInfoMsg && (
        <View style={{ paddingVertical: 8 }}>
          <Text style={{ textAlign: 'center', color: colors.textMuted }}>
            {qTrim.length < minChars
              ? 'Tape au moins 2 lettres pour lancer la recherche'
              : 'Aucun résultat. Affine ta recherche pour trouver la personne que tu recherches'}
          </Text>
        </View>
      )}
      {loading ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it, i) => String(it._id || it.id || i)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={null}
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

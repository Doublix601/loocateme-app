import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, PanResponder } from 'react-native';
import { searchUsers, trackUserSearch } from '../components/ApiRequest';
import { proxifyImageUrl } from '../components/ServerUtils';
import { useTheme } from '../components/contexts/ThemeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode';

export default function UserSearchView({ onClose, onSelectUser, onSelectLocation, userLocation }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [includeUsers, setIncludeUsers] = useState(true);
  const [includeLocations, setIncludeLocations] = useState(true);
  const debRef = useRef(null);
  const { colors, isDark } = useTheme();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        // On capture si c'est un swipe vertical descendant prédominant
        const isVerticalSwipe = Math.abs(dy) > Math.abs(dx) && dy > 10;
        // On capture aussi si c'est un swipe horizontal vers la gauche prédominant (retour)
        const isHorizontalBackSwipe = Math.abs(dx) > Math.abs(dy) && dx < -10;
        return isVerticalSwipe || isHorizontalBackSwipe;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 50 || gestureState.dx < -50 || gestureState.vx < -0.3) {
          onClose();
        }
      },
    })
  ).current;

  const toggleFilter = (type) => {
    if (type === 'users') {
      if (!includeUsers) setIncludeUsers(true);
      else if (includeLocations) setIncludeUsers(false);
    } else {
      if (!includeLocations) setIncludeLocations(true);
      else if (includeUsers) setIncludeLocations(false);
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
      try {
        setLoading(true);
        // Fire-and-forget tracking of the search query
        try { await trackUserSearch(q); } catch (_) {}
        const res = await searchUsers({
          q,
          limit: 10,
          lat: userLocation?.latitude,
          lon: userLocation?.longitude,
          includeUsers,
          includeLocations
        });

        const users = (res?.users || []).map((u) => ({
          ...u,
          _type: 'user',
          _id: u._id || u.id,
          username: u.username || u.name || '',
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          customName: u.customName || '',
          photo: u.profileImageUrl || u.photo || null,
          bio: u.bio || '',
          socialMedias: Array.isArray(u.socialNetworks)
            ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
            : (Array.isArray(u.socialMedias) ? u.socialMedias : (Array.isArray(u.socialMedia) ? u.socialMedia : [])),
          locationCoordinates: Array.isArray(u?.location?.coordinates)
            ? u.location.coordinates
            : (Array.isArray(u.locationCoordinates) ? u.locationCoordinates : null),
          updatedAt: u.updatedAt,
        }));

        const locations = (res?.locations || []).map((l) => ({
          ...l,
          _type: 'location',
          _id: l._id || l.id,
        }));

        setResults([...users, ...locations].slice(0, 10));
      } catch (_e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, includeUsers, includeLocations]);

  const getDisplayName = (item) => {
    if (item._type === 'location') return item.name;
    const first = (item.firstName || '').trim();
    const last = (item.lastName || '').trim();
    const hasFull = first && last;
    const full = hasFull ? `${first} ${last}`.trim() : '';
    const custom = (item.customName || '').trim();
    return full || custom || item.username || 'Utilisateur';
  };

  const formatDistance = (dist) => {
    if (dist === undefined || dist === null) return '';
    if (dist < 1000) return `${Math.round(dist)}m`;
    return `${(dist / 1000).toFixed(1)}km`;
  };

  const renderRow = ({ item }) => {
    const isLocation = item._type === 'location';
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          if (isLocation) {
            onSelectLocation && onSelectLocation(item);
          } else {
            onSelectUser && onSelectUser(item);
          }
        }}
      >
        {isLocation ? (
          <View style={[styles.avatar, styles.avatarPh, { backgroundColor: '#ff9800' }]}>
            <Text style={{ fontSize: 20 }}>📍</Text>
          </View>
        ) : (
          item.photo ? (
            <ImageWithPlaceholder uri={item.photo} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{(getDisplayName(item)[0] || 'U').toUpperCase()}</Text>
            </View>
          )
        )}
        <View style={styles.rowContent}>
          <Text style={[styles.rowText, { color: colors.textPrimary }]} numberOfLines={1}>{getDisplayName(item)}</Text>
          {isLocation && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 12 }}>
              {item.city}{item.city && item.distance ? ' • ' : ''}{formatDistance(item.distance)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
          placeholder="Rechercher"
          placeholderTextColor={isDark ? '#999' : '#666'}
          style={[styles.input, { color: colors.textPrimary }]}
          autoFocus
        />
      </View>
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterBtn, includeUsers && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => toggleFilter('users')}
        >
          <Text style={[styles.filterText, includeUsers && { color: '#fff' }, { color: colors.textPrimary }]}>Utilisateur</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, includeLocations && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => toggleFilter('locations')}
        >
          <Text style={[styles.filterText, includeLocations && { color: '#fff' }, { color: colors.textPrimary }]}>Lieu</Text>
        </TouchableOpacity>
      </View>
      {showInfoMsg && (
        <View style={{ paddingVertical: 8 }}>
          <Text style={{ textAlign: 'center', color: colors.textMuted }}>
            {qTrim.length < minChars
              ? 'Tape au moins 2 lettres pour lancer la recherche'
              : 'Aucun résultat. Affine ta recherche pour trouver ce que tu recherches'}
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
  filters: { flexDirection: 'row', marginTop: 12, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ccc', marginRight: 8 },
  filterText: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowContent: { flex: 1, justifyContent: 'center' },
  rowText: { marginLeft: 12, fontSize: 16, color: '#333' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
});

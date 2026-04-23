import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, PanResponder, Platform } from 'react-native';
import { searchUsers, trackUserSearch } from '../components/ApiRequest';
import { proxifyImageUrl, formatDistance as sharedFormatDistance } from '../components/ServerUtils';
import { useTheme } from '../components/contexts/ThemeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode';

export default function SearchView({ onClose, onSelectUser, onSelectLocation, userLocation }) {
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


  const renderRow = ({ item, index }) => {
    const isLocation = item._type === 'location';
    return (
        <TouchableOpacity
        style={[
          styles.row,
          { backgroundColor: colors.surface },
          index === results.length - 1 && { marginBottom: 0 },
          item.isGhost && { opacity: 0.6 }
        ]}
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
          <View style={styles.avatarContainer}>
            {item.photo ? (
              <ImageWithPlaceholder uri={item.photo} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{(getDisplayName(item)[0] || 'U').toUpperCase()}</Text>
              </View>
            )}
            {item.isGhost && (
              <View style={styles.ghostBadge}>
                <Text style={{ fontSize: 10 }}>👻</Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.rowContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.rowText, { color: isDark ? '#fff' : colors.text }]} numberOfLines={1}>{getDisplayName(item)}</Text>
            {item.isGhost && <Text style={{ marginLeft: 6, fontSize: 12 }}>👻</Text>}
          </View>
          {isLocation && (
            <Text style={{ color: isDark ? '#eee' : colors.text, opacity: isDark ? 0.7 : 0.5, fontSize: 12, marginLeft: 15, marginTop: 2 }}>
              {item.city}{item.city && item.distance ? ' • ' : ''}{sharedFormatDistance(item.distance)}
            </Text>
          )}
          {!isLocation && item.isGhost && (
            <Text style={{ color: isDark ? '#aaa' : colors.text, opacity: 0.7, fontSize: 11, marginLeft: 15, marginTop: 2, fontStyle: 'italic' }}>
              N'est plus sur place
            </Text>
          )}
        </View>
        <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={{ width: 16, height: 16, tintColor: isDark ? '#fff' : colors.text, opacity: 0.2, transform: [{ rotate: '180deg' }] }}
        />
      </TouchableOpacity>
    );
  };

  const minChars = 2;
  const qTrim = query.trim();
  const showInfoMsg = !loading && results.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={onClose}
        >
          <Text style={{ fontSize: 18, color: '#00c2cb', fontWeight: 'bold' }}>✖</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.text }]}>Recherche</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={{ marginRight: 10, fontSize: 18 }}>🔎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nom d'utilisateur, lieu..."
            placeholderTextColor={isDark ? '#aaa' : '#999'}
            style={[styles.input, { color: isDark ? '#fff' : colors.text }]}
            autoFocus
          />
          {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                  <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.3, fontSize: 18 }}>ⓧ</Text>
              </TouchableOpacity>
          )}
        </View>

        <View style={styles.filters}>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: includeUsers ? '#00c2cb' : colors.surface,
                borderColor: includeUsers ? '#00c2cb' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
              }
            ]}
            onPress={() => toggleFilter('users')}
          >
            <Text style={[styles.filterText, { color: includeUsers ? '#fff' : colors.text }]}>Utilisateurs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: includeLocations ? '#00c2cb' : colors.surface,
                borderColor: includeLocations ? '#00c2cb' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
              }
            ]}
            onPress={() => toggleFilter('locations')}
          >
            <Text style={[styles.filterText, { color: includeLocations ? '#fff' : colors.text }]}>Lieux</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it, i) => String(it._id || it.id || i)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }}
          ListHeaderComponent={showInfoMsg ? (
            <View style={{ marginTop: 40, paddingHorizontal: 40 }}>
              <Text style={{ textAlign: 'center', color: isDark ? '#fff' : colors.text, opacity: isDark ? 0.7 : 0.5, lineHeight: 22 }}>
                {qTrim.length < minChars
                  ? 'Tape au moins 2 lettres pour lancer la recherche'
                  : 'Aucun résultat trouvé pour cette recherche.'}
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    marginBottom: 20,
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
  searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 15,
      paddingHorizontal: 15,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
  },
  input: { flex: 1, fontSize: 16 },
  filters: { flexDirection: 'row', marginTop: 15, marginBottom: 10 },
  filterBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      marginRight: 10,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
  },
  filterText: { fontSize: 14, fontWeight: '600' },
  row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 20,
      marginBottom: 12,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
  },
  avatarContainer: { position: 'relative' },
  ghostBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  rowContent: { flex: 1, justifyContent: 'center' },
  rowText: { marginLeft: 15, fontSize: 16, fontWeight: '600' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
});

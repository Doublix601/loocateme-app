import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { useNavigation } from '@react-navigation/native';
import { searchUsers, trackUserSearch } from '../components/ApiRequest';
import { proxifyImageUrl, formatDistance as sharedFormatDistance } from '../components/ServerUtils';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import { UserContext } from '../components/contexts/UserContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigateToUser } from '../hooks/useNavigateToUser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMainSwiper } from '../components/contexts/MainSwiperContext';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode';

export default function SearchView() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { goToPage, currentPage } = useMainSwiper();
  const navigateToUser = useNavigateToUser();
  const { user: appUser } = useContext(UserContext);
  const userLocation = appUser?.location?.coordinates
    ? { latitude: appUser.location.coordinates[1], longitude: appUser.location.coordinates[0] }
    : null;
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [includeUsers, setIncludeUsers] = useState(true);
  const [includeLocations, setIncludeLocations] = useState(true);
  const debRef = useRef(null);
  const inputRef = useRef(null);
  const { colors, isDark } = useTheme();
  const { isMoon } = useVibe();

  // Focus the input once the slide-in animation has settled (page 0 only).
  // The spring takes ~350 ms; we wait a bit longer to avoid fighting
  // with the keyboard dismiss that MainSwiper fires on every transition.
  useEffect(() => {
    if (currentPage === 0) {
      const t = setTimeout(() => { try { inputRef.current?.focus(); } catch (_) {} }, 450);
      return () => clearTimeout(t);
    }
  }, [currentPage]);

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
        activeOpacity={0.7}
        style={[
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
          },
          index === results.length - 1 && { marginBottom: 0 },
          item.isGhost && { opacity: 0.6 }
        ]}
        onPress={() => {
          if (isLocation) {
            navigation.navigate('Location', { locationId: item._id || item.id, tertiles: item.tertiles || null });
          } else {
            navigateToUser(item);
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
            <Text style={[styles.rowText, { color: isDark ? '#fff' : colors.textPrimary }]} numberOfLines={1}>{getDisplayName(item)}</Text>
            {item.isGhost && <Text style={{ marginLeft: 6, fontSize: 12 }}>👻</Text>}
          </View>
          {isLocation && (
            <Text style={{ color: isDark ? '#eee' : colors.textPrimary, opacity: isDark ? 0.7 : 0.5, fontSize: 12, marginLeft: 15, marginTop: 2 }}>
              {item.city}{item.city && item.distance ? ' • ' : ''}{sharedFormatDistance(item.distance)}
            </Text>
          )}
          {!isLocation && item.isGhost && (
            <Text style={{ color: isDark ? '#aaa' : colors.textPrimary, opacity: 0.7, fontSize: 11, marginLeft: 15, marginTop: 2, fontStyle: 'italic' }}>
              N'est plus sur place
            </Text>
          )}
        </View>
        <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={{ width: 16, height: 16, tintColor: isDark ? '#fff' : colors.textPrimary, opacity: 0.2, transform: [{ rotate: '180deg' }] }}
        />
      </TouchableOpacity>
    );
  };

  const minChars = 2;
  const qTrim = query.trim();
  const showInfoMsg = !loading && results.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      {isMoon ? (
        <NightSkyBackground style={StyleSheet.absoluteFill} />
      ) : (
        <DaySkyBackground style={StyleSheet.absoluteFill} />
      )}
      <View style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          paddingTop: insets.top + 10,
          borderBottomWidth: isDark ? 1 : 0,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent',
          shadowOpacity: isDark ? 0 : 0.08,
          elevation: isDark ? 0 : 4
        }
      ]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.12)' }]}
          onPress={() => goToPage(1)}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          accessibilityLabel="Fermer la recherche"
        >
          <Text style={{ fontSize: 18, color: '#00c2cb', fontWeight: 'bold' }}>✖</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#00c2cb' }]}>Recherche</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={{ marginRight: 10, fontSize: 18 }}>🔎</Text>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Nom d'utilisateur, lieu..."
            placeholderTextColor={isDark ? '#aaa' : '#999'}
            style={[styles.input, { color: isDark ? '#fff' : colors.textPrimary }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading ? (
            <ActivityIndicator size="small" color="#00c2cb" />
          ) : query.length > 0 ? (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                accessibilityLabel="Effacer la recherche"
              >
                  <Text style={{ color: isDark ? '#fff' : colors.textPrimary, opacity: 0.4, fontSize: 20 }}>ⓧ</Text>
              </TouchableOpacity>
          ) : null}
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
            <Text style={[styles.filterText, { color: includeUsers ? '#fff' : colors.textPrimary }]}>Utilisateurs</Text>
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
            <Text style={[styles.filterText, { color: includeLocations ? '#fff' : colors.textPrimary }]}>Lieux</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && results.length === 0 ? (
        <View style={{ marginTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#00c2cb" />
          <Text style={{ marginTop: 12, color: isDark ? '#fff' : colors.textPrimary, opacity: 0.5, fontSize: 13 }}>Recherche en cours…</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it, i) => String(it._id || it.id || i)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }}
          ListHeaderComponent={showInfoMsg ? (
            <View style={{ marginTop: 40, paddingHorizontal: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 44, marginBottom: 12, opacity: 0.6 }}>
                {qTrim.length < minChars ? '🔍' : '🤷'}
              </Text>
              <Text style={{ textAlign: 'center', color: isDark ? '#fff' : colors.textPrimary, opacity: isDark ? 0.75 : 0.55, lineHeight: 22, fontSize: 15 }}>
                {qTrim.length < minChars
                  ? 'Tape au moins 2 lettres pour lancer la recherche'
                  : 'Aucun résultat trouvé pour cette recherche.'}
              </Text>
              {qTrim.length >= minChars && (
                <Text style={{ textAlign: 'center', color: isDark ? '#aaa' : '#999', marginTop: 8, fontSize: 12 }}>
                  Vérifie les filtres ou essaie un autre mot-clé.
                </Text>
              )}
            </View>
          ) : (
            <Text style={{ color: isDark ? '#aaa' : '#777', fontSize: 12, marginBottom: 8, marginLeft: 4 }}>
              {results.length} résultat{results.length > 1 ? 's' : ''}
            </Text>
          )}
          ListEmptyComponent={null}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
      borderWidth: 1,
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

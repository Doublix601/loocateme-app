import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  PanResponder,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { proxifyImageUrl } from '../components/ServerUtils';
import { updateMyLocation, getUsersAroundMe, getMyUser, setVisibility as apiSetVisibility, getPopularUsers, searchUsers, invalidateApiCacheByPrefix } from '../components/ApiRequest';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import { UserContext } from '../components/contexts/UserContext';
import { subscribe } from '../components/EventBus';
import { startBackgroundLocationForSixHours, stopBackgroundLocation, BGLocKeys } from '../components/BackgroundLocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

const UserListScreen = ({ users = [], onSelectUser, onReturnToAccount, onOpenSearchView, initialScrollOffset = 0, onUpdateScrollOffset }) => {
  const { colors, isDark } = useTheme();
  // Swipe left anywhere on the list to open MyAccount
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        const isHorizontal = Math.abs(dx) > Math.abs(dy);
        // left or right swipe
        return isHorizontal && (dx < -10 || dx > 10);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx, vx } = gestureState;
        // strong left swipe → open account
        if (dx < -60 || vx < -0.3) {
          onReturnToAccount && onReturnToAccount();
          return;
        }
        // strong right swipe → open search view
        if (dx > 60 || vx > 0.3) {
          onOpenSearchView && onOpenSearchView();
        }
      },
    })
  ).current;
  const [loading, setLoading] = useState(false);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [popularUsers, setPopularUsers] = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const { user: currentUser, updateUser } = useContext(UserContext);
  const [displayPref, setDisplayPref] = useState('full'); // 'full' or 'custom'
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const searchDebounceRef = useRef(null);
  // Persisted caches/flags keys
  // Bump cache keys to v2 to invalidate old caches that might contain unverified accounts
  const STORAGE_NEARBY_USERS = 'lm_cached_nearby_users_v2';
  const STORAGE_POPULAR_USERS = 'lm_cached_popular_users_v2';
  const STORAGE_NEARBY_LOADED_ONCE = 'lm_nearby_loaded_once_flag_v1';
  const hasLoadedOnceRef = useRef(false);

  // Local social media icons map for quick badges in list
  const socialMediaIcons = {
    facebook: require('../assets/socialMediaIcons/fb_logo.png'),
    x: require('../assets/socialMediaIcons/x_logo.png'),
    linkedin: require('../assets/socialMediaIcons/linkedin_logo.png'),
    instagram: require('../assets/socialMediaIcons/instagram_logo.png'),
    tiktok: require('../assets/socialMediaIcons/tiktok_logo.png'),
    snapchat: require('../assets/socialMediaIcons/snapchat_logo.png'),
    youtube: require('../assets/socialMediaIcons/yt_logo.png'),
  };

  // Map backend user to context shape
  const mapBackendUserToContext = (u = {}) => ({
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || null,
    socialMedia: Array.isArray(u.socialNetworks)
      ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
      : [],
    isVisible: u.isVisible !== false,
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
  });

  // On mount, if we have a token (implicit) but context still default/empty socials, fetch my user
  useEffect(() => {
    const maybeFetchMe = async () => {
      try {
        // Heuristic: if no socials and empty/placeholder username, fetch
        const looksDefault = !currentUser?.socialMedia || currentUser.socialMedia.length === 0;
        if (!looksDefault) return;
        const res = await getMyUser();
        const me = res?.user;
        if (me && updateUser) {
          updateUser(mapBackendUserToContext(me));
        }
      } catch (e) {
        console.error('[UserListScreen] getMyUser error', { code: e?.code, message: e?.message, status: e?.status });
      }
    };
    maybeFetchMe();
  }, []);

  // Haversine distance in meters
  const distanceBetweenMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatDistance = (meters) => {
    if (meters == null || isNaN(meters)) return '—';
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  };

  const mapBackendUserToUi = (u, baseLatLon = null) => {
    const photo = u?.profileImageUrl || null;
    const name = (u?.username || u?.name || '').trim();
    const firstName = (u?.firstName || '').trim();
    const lastName = (u?.lastName || '').trim();
    const customName = (u?.customName || '').trim();
    const email = (u?.email || '').trim();
    const username = name || (email ? email.split('@')[0] : 'Utilisateur');
    const bio = u?.bio || '';
    const socials = Array.isArray(u?.socialNetworks)
      ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
      : [];
    let distance = null;
    let locationCoordinates = null;
    try {
      const coords = u?.location?.coordinates; // [lon, lat]
      if (Array.isArray(coords) && coords.length >= 2) {
        locationCoordinates = coords;
      }
      const ref = baseLatLon || myLocation;
      if (ref && Array.isArray(coords) && coords.length >= 2) {
        const [lon2, lat2] = coords;
        const meters = distanceBetweenMeters(ref.lat, ref.lon, lat2, lon2);
        distance = formatDistance(meters);
      }
    } catch {}
    return {
      _id: u?._id || u?.id,
      username,
      firstName,
      lastName,
      customName,
      bio,
      photo,
      distance,
      // Keep raw coordinates so Profile screen can compute distance when opening from Popular/search
      locationCoordinates,
      socialMedias: socials,
      updatedAt: u?.location?.updatedAt || u?.updatedAt || null,
    };
  };

  // Charger préférence d'affichage du nom
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISPLAY_NAME_PREF_KEY);
        if (v === 'custom' || v === 'full') setDisplayPref(v);
      } catch {}
    })();
  }, []);

  const getDisplayName = (item) => {
    const first = (item.firstName || '').trim();
    const last = (item.lastName || '').trim();
    const hasFull = first && last;
    const full = hasFull ? `${first} ${last}`.trim() : '';
    const custom = (item.customName || '').trim();
    if (displayPref === 'custom') return custom || full || item.username || 'Utilisateur';
    return full || custom || item.username || 'Utilisateur';
  };

  // Recherche inline en temps réel avec debounce
  useEffect(() => {
    if (!searchMode) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const q = (searchQuery || '').trim();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(async () => {
      if (!q || q.length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      try {
        setSearching(true);
        const res = await searchUsers({ q, limit: 10 });
        const apiUsers = res?.users || [];
        const mapped = apiUsers.map((u) => mapBackendUserToUi(u));
        setSearchResults(mapped);
      } catch (e) {
        // ignore errors, just clear
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchMode, searchQuery]);

  const fetchNearby = async ({ force = false } = {}) => {
    try {
      if (!currentUser?.isVisible) {
        setNearbyUsers([]);
        return;
      }
      setLoading(true);
      // Ask permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error("Permission de localisation refusée");
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      setMyLocation({ lat, lon });
      await updateMyLocation({ lat, lon }).catch(() => {});
      const res = await getUsersAroundMe({ lat, lon, radius: 2000 });
      const apiUsers = (res?.users || []).filter((u) => u?.emailVerified === true);
      const mapped = apiUsers.map((u) => mapBackendUserToUi(u, { lat, lon }));
      setNearbyUsers(mapped);
      // persist cache
      try { await AsyncStorage.setItem(STORAGE_NEARBY_USERS, JSON.stringify(mapped)); } catch (_) {}
      // mark as loaded once
      hasLoadedOnceRef.current = true;
      try { await AsyncStorage.setItem(STORAGE_NEARBY_LOADED_ONCE, '1'); } catch (_) {}
    } catch (e) {
      console.error('[UserListScreen] Nearby fetch error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Localisation', e?.message || 'Impossible de récupérer votre position.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPopular = async (limit = 20, { force = false } = {}) => {
    try {
      setLoadingPopular(true);
      if (!force) {
        // Try load from storage first
        try {
          const raw = await AsyncStorage.getItem(STORAGE_POPULAR_USERS);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPopularUsers(parsed);
              setLoadingPopular(false);
              return;
            }
          }
        } catch (_) {}
      }
      const res = await getPopularUsers({ limit });
      const apiUsers = (res?.users || []).filter((u) => u?.emailVerified === true);
      const mapped = apiUsers.map((u) => mapBackendUserToUi(u));
      setPopularUsers(mapped);
      try { await AsyncStorage.setItem(STORAGE_POPULAR_USERS, JSON.stringify(mapped)); } catch (_) {}
    } catch (e) {
      console.error('[UserListScreen] Popular fetch error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
    } finally {
      setLoadingPopular(false);
    }
  };

  // Initial load: restore caches
  useEffect(() => {
    (async () => {
      let hasNearbyCache = false;
      let hasPopularCache = false;

      try {
        const flag = await AsyncStorage.getItem(STORAGE_NEARBY_LOADED_ONCE);
        hasLoadedOnceRef.current = flag === '1';
      } catch (_) { hasLoadedOnceRef.current = false; }

      // Restore nearby cache
      try {
        const raw = await AsyncStorage.getItem(STORAGE_NEARBY_USERS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNearbyUsers(parsed);
            hasNearbyCache = true;
          }
        }
      } catch (_) {}

      // Restore popular cache (missing in previous version but useful)
      try {
        const rawPop = await AsyncStorage.getItem(STORAGE_POPULAR_USERS);
        if (rawPop) {
          const parsedPop = JSON.parse(rawPop);
          if (Array.isArray(parsedPop) && parsedPop.length > 0) {
            setPopularUsers(parsedPop);
            hasPopularCache = true;
          }
        }
      } catch (_) {}

      // If no cache and we haven't loaded yet in this session, force a refresh immediately
      // This ensures first opening of the app (empty cache) triggers a load.
      if (!hasNearbyCache || !hasPopularCache) {
        setRefreshing(true);
        fetchPopular(20, { force: true }).catch(() => {});
        fetchNearby({ force: true }).finally(() => setRefreshing(false));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for refresh events (e.g. from notification deep link)
  useEffect(() => {
    const unsub = subscribe('userlist:refresh', () => {
      setRefreshing(true);
      fetchPopular(20, { force: true }).catch(() => {});
      fetchNearby({ force: true }).finally(() => setRefreshing(false));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove auto-fetching popular on nearby change. Popular stays cached unless manually refreshed.

  // On app reopen, if visibility was auto-disabled by background timeout, restore it
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const flag = await AsyncStorage.getItem(BGLocKeys.STORAGE_AUTO_INVISIBLE_KEY);
        if (flag) {
          await apiSetVisibility(true);
          if (!mounted) return;
          if (updateUser) updateUser({ ...currentUser, isVisible: true });
          await AsyncStorage.removeItem(BGLocKeys.STORAGE_AUTO_INVISIBLE_KEY);
          // restart background updates window
          try { await startBackgroundLocationForSixHours(); } catch (_) {}
          // refetch nearby now that we're visible
          // This only happens if we were auto-hidden due to background timeout,
          // which qualifies as "opening after background"
          fetchNearby();
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop background location based on visibility
  useEffect(() => {
    if (currentUser?.isVisible) {
      startBackgroundLocationForSixHours();
    } else {
      stopBackgroundLocation();
    }
  }, [currentUser?.isVisible]);

  // Do not auto refetch when visibility toggles; respect manual refresh requirement
  useEffect(() => {
    if (!currentUser?.isVisible) {
      setNearbyUsers([]);
    }
  }, [currentUser?.isVisible]);
  const renderUserCard = (item) => (
    <TouchableOpacity
      style={[
        styles.userItem,
        { backgroundColor: colors.surface, borderColor: colors.border }
      ]}
      onPress={() => onSelectUser(item)}
      activeOpacity={0.8}
    >
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          {item.photo ? (
            <ImageWithPlaceholder uri={item.photo} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Image
                source={require('../assets/appIcons/userProfile.png')}
                style={{ width: 28, height: 28, tintColor: '#fff' }}
              />
            </View>
          )}
        </View>
        <View style={styles.userContent}>
          <View style={styles.headerRow}>
            <Text style={[styles.username, { color: colors.textPrimary }]} numberOfLines={1}>{item.username}</Text>
            {currentUser?.isVisible !== false && (
              <View style={[styles.distancePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                <Text style={[styles.distanceText, { color: colors.accent }]}>{item.distance ?? '—'}</Text>
              </View>
            )}
          </View>
          {(item.bio && String(item.bio).trim().length > 0) ? (
            <Text style={[styles.userBio, { color: colors.textSecondary }]} numberOfLines={2}>{item.bio}</Text>
          ) : null}
          {Array.isArray(item.socialMedias) && item.socialMedias.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              {item.socialMedias.slice(0, 3).map((s, idx) => {
                const iconSrc = s?.platform ? socialMediaIcons[s.platform] : undefined;
                if (!iconSrc) return null;
                return (
                  <Image
                    key={idx}
                    source={iconSrc}
                    style={{ width: 16, height: 16, marginRight: 8 }}
                    resizeMode="contain"
                  />
                );
              })}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => renderUserCard({ ...item, username: getDisplayName(item) });

  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current && initialScrollOffset > 0) {
      // Restore previous scroll position without animation
      listRef.current.scrollToOffset({ offset: initialScrollOffset, animated: false });
    }
  }, [initialScrollOffset]);

  const handleScroll = (e) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    if (onUpdateScrollOffset) onUpdateScrollOffset(y);
  };

  const data = (users && users.length > 0) ? users : nearbyUsers;

  // Éviter les doublons: filtrer les populaires contre les éléments réellement affichés (data)
  const displayedIds = new Set((data || []).map((u) => u._id || u.id));
  const filteredPopular = (popularUsers || []).filter((u) => !displayedIds.has(u._id || u.id));

  // Générateur de clé stable pour les items utilisateur
  const getUserKey = (item, index = 0) => {
    const k = item?._id || item?.id || item?.email || item?.username;
    return (k != null && k !== '') ? String(k) : `idx-${index}`;
  };

  // Responsive rules for Popular section
  const isSmallScreen = width < 420;
  const POPULAR_COLS = isSmallScreen ? 2 : 3;
  const POPULAR_ITEM_WIDTH_PERCENT = isSmallScreen ? '48%' : '32%';
  const POP_AVATAR = isSmallScreen ? 88 : 72;
  const POP_FONT = isSmallScreen ? 16 : 14;

  const renderPopularUserCard = (item) => (
    <TouchableOpacity
      style={styles.popularUserItem}
      onPress={() => onSelectUser(item)}
      activeOpacity={0.8}
   >
      {item.photo ? (
        <ImageWithPlaceholder uri={item.photo} style={[styles.popularAvatarImage, { width: POP_AVATAR, height: POP_AVATAR, borderRadius: POP_AVATAR / 2 }]} />
      ) : (
        <View style={[styles.popularAvatarPlaceholder, { width: POP_AVATAR, height: POP_AVATAR, borderRadius: POP_AVATAR / 2 }]}>
          <Image
            source={require('../assets/appIcons/userProfile.png')}
            style={{ width: Math.min(40, POP_AVATAR * 0.5), height: Math.min(40, POP_AVATAR * 0.5), tintColor: '#fff' }}
          />
        </View>
      )}
      <Text style={[styles.popularUsername, { fontSize: POP_FONT, color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{getDisplayName(item)}</Text>
    </TouchableOpacity>
  );

  const PopularSection = ({ inline = false }) => {
    if (loadingPopular && filteredPopular.length === 0) {
      return (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#00c2cb" />
        </View>
      );
    }
    if (!filteredPopular || filteredPopular.length === 0) return null;
    return (
      <View style={{ marginTop: inline ? 24 : 24 }}>
        <Text style={styles.popularTitle}>Profils populaires</Text>
        <View style={[
          styles.popularGrid,
          // Centrer lorsque qu'il n'y a qu'un seul profil populaire
          filteredPopular.length === 1 && { justifyContent: 'center' }
        ]}>
          {filteredPopular.map((u, idx) => (
            <View key={getUserKey(u, idx)} style={[styles.popularGridItem, { width: POPULAR_ITEM_WIDTH_PERCENT }]}>
              {renderPopularUserCard(u)}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, index) => getUserKey(item, index)}
        renderItem={renderItem}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.listContainer, { flexGrow: 1 }]}
        ListHeaderComponent={(
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.title, { color: colors.accent }]}>Autour de moi</Text>
              <TouchableOpacity
                onPress={() => { onOpenSearchView && onOpenSearchView(); }}
                accessibilityLabel={'Ouvrir la recherche'}
                style={{ padding: 8 }}
              >
                <Text style={{ fontSize: 22, color: colors.textPrimary }}>🔍</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={[styles.noUsersContainer, { flex: 1, alignSelf: 'stretch', width: '100%' }]}>
            {loading ? (
              <ActivityIndicator size="large" color="#00c2cb" />
            ) : (
              <>
                <>
                  <Text style={currentUser?.isVisible ? [styles.noUsersText, { color: colors.textMuted }] : [styles.invisibleNotice, { color: '#d35400' }]}>
                    {currentUser?.isVisible ? 'Aucun profil autour pour l\u2019instant 👀 — invite tes amis ou explore les profils populaires.' : 'Vous êtes en mode invisible. Activez votre visibilité dans les Paramètres pour voir les autres utilisateurs.'}
                  </Text>
                  <PopularSection inline />
                </>
              </>
            )}
          </View>
        )}
        ListFooterComponent={(() => {
          const aroundCount = nearbyUsers?.length || 0;
          // Afficher en pied uniquement lorsqu'on affiche réellement les "Autour de moi"
          const showingNearby = !users || users.length === 0;
          return (showingNearby && data.length > 0 && aroundCount < 20)
            ? <PopularSection />
            : null;
        })()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              try { invalidateApiCacheByPrefix('/users/'); } catch (_) {}
              fetchNearby({ force: true });
              // Refresh popular as well
              try { invalidateApiCacheByPrefix('/stats/'); invalidateApiCacheByPrefix('/popular'); } catch (_) {}
              fetchPopular(20, { force: true });
            }}
          />
        }
      />

      <TouchableOpacity style={styles.roundButton} onPress={onReturnToAccount}>
        <Image
          source={require('../assets/appIcons/userProfile.png')}
          style={styles.roundButtonImage}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: width * 0.05, // 5% padding based on screen width
        backgroundColor: '#fff',
    },
    title: {
        fontSize: width * 0.08, // Responsive font size based on screen width
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: height * 0.03, // Responsive margin
        color: '#00c2cb',
    },
    listContainer: {
        paddingBottom: 20,
    },
    invisibleNotice: {
        width: '100%',
        color: '#d35400',
        textAlign: 'center',
        marginHorizontal: 20,
        flexWrap: 'wrap',
        fontSize: width * 0.045,
    },
    noUsersText: {
        width: '100%',
        color: 'grey',
        textAlign: 'center',
        marginHorizontal: 20,
        flexWrap: 'wrap',
        fontSize: width * 0.045,
    },
    userItem: {
        padding: 20,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#00c2cb',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        marginRight: 12,
    },
    avatarImage: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    avatarPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#00c2cb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    userContent: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    distancePill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: '#e6fbfc',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#00c2cb',
    },
    distanceText: {
        color: '#00aab2',
        fontWeight: '600',
    },
    username: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    userBio: {
        fontSize: 16,
        color: '#666',
    },
    userDistance: {
        fontSize: 19,
        color: '#666',
    },
    roundButton: {
        backgroundColor: '#00c2cb',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: 30,
        right: 30,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    roundButtonImage: {
        width: 30,
        height: 30,
        tintColor: '#fff',
    },
    noUsersContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#333',
        paddingVertical: 4,
    },
    popularTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#00c2cb',
        marginBottom: 8,
        textAlign: 'left',
    },
    // --- Popular profiles simplified card styles ---
    popularGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    popularGridItem: {
        width: '32%',
        marginBottom: 12,
        alignItems: 'center',
    },
    popularUserItem: {
        alignItems: 'center',
    },
    popularAvatarImage: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#eee',
    },
    popularAvatarPlaceholder: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#00c2cb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    popularUsername: {
        marginTop: 6,
        fontSize: 14,
        fontWeight: '600',
        color: '#3f4a4b',
        textAlign: 'center',
    },
});

export default UserListScreen;

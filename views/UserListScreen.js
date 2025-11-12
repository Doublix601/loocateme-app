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
} from 'react-native';
import * as Location from 'expo-location';
import { updateMyLocation, getUsersAroundMe, getMyUser, setVisibility as apiSetVisibility, getPopularUsers } from '../components/ApiRequest';
import { UserContext } from '../components/contexts/UserContext';
import { startBackgroundLocationForOneHour, stopBackgroundLocation, BGLocKeys } from '../components/BackgroundLocation';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const UserListScreen = ({ users = [], onSelectUser, onReturnToAccount, initialScrollOffset = 0, onUpdateScrollOffset }) => {
  // Swipe left anywhere on the list to open MyAccount
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        const isHorizontal = Math.abs(dx) > Math.abs(dy);
        // left swipe
        return isHorizontal && dx < -10;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx, vx } = gestureState;
        // strong left swipe or sufficient velocity to the left
        if (dx < -60 || vx < -0.3) {
          onReturnToAccount && onReturnToAccount();
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

  // Local social media icons map for quick badges in list
  const socialMediaIcons = {
    facebook: require('../assets/socialMediaIcons/fb_logo.png'),
    x: require('../assets/socialMediaIcons/x_logo.png'),
    linkedin: require('../assets/socialMediaIcons/linkedin_logo.png'),
    instagram: require('../assets/socialMediaIcons/instagram_logo.png'),
    tiktok: require('../assets/socialMediaIcons/tiktok_logo.png'),
    snapchat: require('../assets/socialMediaIcons/snapchat_logo.png'),
  };

  // Map backend user to context shape
  const mapBackendUserToContext = (u = {}) => ({
    username: u.name || '',
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
    const name = (u?.name || '').trim();
    const email = (u?.email || '').trim();
    const username = name || (email ? email.split('@')[0] : 'Utilisateur');
    const bio = u?.bio || '';
    const socials = Array.isArray(u?.socialNetworks)
      ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
      : [];
    let distance = null;
    try {
      const coords = u?.location?.coordinates; // [lon, lat]
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
      bio,
      photo,
      distance,
      socialMedias: socials,
    };
  };

  const fetchNearby = async () => {
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
      const apiUsers = res?.users || [];
      const mapped = apiUsers.map((u) => mapBackendUserToUi(u, { lat, lon }));
      setNearbyUsers(mapped);
    } catch (e) {
      console.error('[UserListScreen] Nearby fetch error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Localisation', e?.message || 'Impossible de récupérer votre position.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPopular = async (limit = 10) => {
    try {
      setLoadingPopular(true);
      const res = await getPopularUsers({ limit });
      const apiUsers = res?.users || [];
      const mapped = apiUsers.map((u) => mapBackendUserToUi(u));
      setPopularUsers(mapped);
    } catch (e) {
      console.error('[UserListScreen] Popular fetch error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
    } finally {
      setLoadingPopular(false);
    }
  };

  useEffect(() => {
    if (!users || users.length === 0) {
      fetchNearby();
    }
  }, []);

  // When nearby results are scarce, fetch popular profiles
  useEffect(() => {
    if (!currentUser?.isVisible) return;
    const count = nearbyUsers?.length || 0;
    if (count <= 2) {
      fetchPopular(10);
    }
  }, [nearbyUsers, currentUser?.isVisible]);

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
          try { await startBackgroundLocationForOneHour(); } catch (_) {}
          // refetch nearby now that we're visible
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
      startBackgroundLocationForOneHour();
    } else {
      stopBackgroundLocation();
    }
  }, [currentUser?.isVisible]);

  // Refetch when user becomes visible
  useEffect(() => {
    if (currentUser?.isVisible) {
      fetchNearby();
    } else {
      setNearbyUsers([]);
    }
  }, [currentUser?.isVisible]);
  const renderUserCard = (item) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => onSelectUser(item)}
      activeOpacity={0.8}
    >
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.avatarImage} />
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
            <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>{item.distance ?? '—'}</Text>
            </View>
          </View>
          <Text style={styles.userBio} numberOfLines={2}>
            {(item.bio && String(item.bio).trim().length > 0) ? item.bio : 'Pas de bio'}
          </Text>
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

  const renderItem = ({ item }) => renderUserCard(item);

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

  const nearbyIds = new Set((nearbyUsers || []).map((u) => u._id || u.id));
  const filteredPopular = (popularUsers || []).filter((u) => !nearbyIds.has(u._id || u.id));

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
      <View style={{ marginTop: inline ? 12 : 24 }}>
        <Text style={styles.popularTitle}>Profils populaires</Text>
        <View>
          {filteredPopular.map((u) => (
            <View key={(u._id || u.id || Math.random()).toString()}>
              {renderUserCard(u)}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => (item._id || item.id || Math.random()).toString()}
        renderItem={renderItem}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.listContainer, { flexGrow: 1 }]}
        ListHeaderComponent={(
          <View>
            <Text style={styles.title}>Autour de moi</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={[styles.noUsersContainer, { flex: 1, alignSelf: 'stretch', width: '100%' }]}>
            {loading ? (
              <ActivityIndicator size="large" color="#00c2cb" />
            ) : (
              <>
                <Text style={currentUser?.isVisible ? styles.noUsersText : styles.invisibleNotice}>
                  {currentUser?.isVisible ? 'Aucun profil autour pour l\u2019instant 👀 — invite tes amis ou explore les profils populaires.' : 'Vous êtes en mode invisible. Activez votre visibilité dans les Paramètres pour voir les autres utilisateurs.'}
                </Text>
                {currentUser?.isVisible && <PopularSection inline />}
              </>
            )}
          </View>
        )}
        ListFooterComponent={(
          currentUser?.isVisible && data.length > 0 && (nearbyUsers?.length || 0) <= 2 ? (
            <PopularSection />
          ) : null
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchNearby();
              // Refresh popular as well
              fetchPopular(10);
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
});

export default UserListScreen;

import React, { useEffect, useState, useContext } from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { getLocations, updateMyLocation } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { formatLocationType } from '../components/LocationUtils';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const LocationListScreen = ({ onSelectLocation, onReturnToAccount, onSearchPeople, initialScrollOffset = 0, onScroll }) => {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user: currentUser } = useContext(UserContext);
  const flatListRef = React.useRef(null);
  const currentScrollOffset = React.useRef(0);

  const LocationItem = React.useMemo(() => {
    return React.memo(({ item }) => (
      <TouchableOpacity
        style={[styles.locationCard, { backgroundColor: colors.surface }]}
        onPress={() => {
          onScroll && onScroll(currentScrollOffset.current);
          onSelectLocation({ ...item });
        }}
      >
        <View style={styles.locationInfo}>
          <Text style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.text }]}>{item.name}</Text>
          <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
            <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(item.type)}</Text>
          </View>
          <View style={styles.activeUsersContainer}>
            <Text style={[styles.usersCountText, { color: colors.textSecondary }]}>
              {item.userCount || 0} utilisateur{(item.userCount || 0) > 1 ? 's' : ''} dans ce lieu
            </Text>
            <View style={styles.avatarStack}>
              {(item.activeUsers || []).map((u, index) => {
                const isUserBoosted = u.boostUntil && new Date(u.boostUntil) > new Date();
                const isGhost = u.location && u.location.updatedAt && new Date(u.location.updatedAt) < new Date(Date.now() - 5 * 60 * 1000) && isUserBoosted;
                
                return (
                  <View key={u._id} style={[styles.avatarWrapper, {
                    marginLeft: index === 0 ? 0 : -12,
                    borderColor: isUserBoosted ? '#FFD700' : colors.surface,
                    backgroundColor: isDark ? '#333' : '#eee',
                    opacity: isGhost ? 0.6 : 1,
                    borderWidth: isUserBoosted ? 1.5 : 1
                  }]}>
                    <ImageWithPlaceholder
                      uri={u.profileImageUrl}
                      style={styles.smallAvatar}
                    />
                    <View style={[styles.statusDotSmall, {
                      backgroundColor: u.status === 'green' ? '#4CAF50' : '#FF9800',
                      borderColor: colors.surface
                    }]} />
                  </View>
                );
              })}
            </View>
          </View>
        </View>
        <View style={styles.popularityContainer}>
          <Text style={styles.popularityStars}>{getStars(item, isDark)}</Text>
        </View>
      </TouchableOpacity>
    ));
  }, [colors, isDark, onSelectLocation, onScroll]);

  const renderLocation = ({ item }) => <LocationItem item={item} />;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Seuleument capturer si le mouvement est principalement horizontal
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          // Swipe vers la droite -> SearchView
          onSearchPeople && onSearchPeople();
        } else if (gestureState.dx < -50) {
          // Swipe vers la gauche -> MyAccountScreen
          onReturnToAccount && onReturnToAccount();
        }
      },
    })
  ).current;

  // Important: do not intercept horizontal gestures here so that
  // the parent navigator can handle global swipes (Search / MyAccount).

  useEffect(() => {
    fetchNearbyLocations();

    // Listen for mutations that should trigger a refresh
    const unsub = subscribe('api:mutation', ({ path }) => {
      // Refresh if the user updated their location or heartbeat
      if (path && (path.includes('/user/location') || path.includes('/user/heartbeat'))) {
        fetchNearbyLocations();
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (initialScrollOffset > 0 && flatListRef.current && locations.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false });
      }, 100);
    }
  }, [locations.length]);


  const getStars = (item, starIsDark) => {
    const starsCount = item?.stars || 0;
    const userCount = item?.userCount || 0;

    // Determine the number of stars based on backend stars field
    if (starsCount === 3) {
      return <Text style={{ fontSize: 18 }}>⭐⭐⭐</Text>;
    }
    if (starsCount === 2) {
      return <Text style={{ fontSize: 18 }}>⭐⭐</Text>;
    }
    // Si starsCount est 1 OU s'il y a des utilisateurs présents, on affiche 1 étoile jaune
    if (starsCount === 1 || userCount > 0) {
      return <Text style={{ fontSize: 18 }}>⭐</Text>;
    }

    // Default to 1 grey star for 0 stars
    return <Text style={{ color: starIsDark ? '#FFFFFF' : '#ccc', opacity: starIsDark ? 0.3 : 1, fontSize: 18 }}>★</Text>;
  };

  const fetchNearbyLocations = async () => {
    try {
      setLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permission to access location was denied');
        return;
      }

      // Optimization for Android: high accuracy can be slow.
      // Using balanced accuracy and a timeout to ensure quick feedback.
      let location;
      try {
        // First try to get last known location for immediate feedback if available
        location = await Location.getLastKnownPositionAsync({});

        // Then start fetching fresh location in the background if last known is old or null
        // On Android, getCurrentPositionAsync is much faster with a timeout and lower accuracy.
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).then(loc => {
          if (loc && (!location || loc.timestamp > location.timestamp)) {
             // If we already finished loading but got a better location,
             // we could trigger a silent refresh here if we wanted.
          }
        }).catch(() => {});
      } catch (err) {
        console.warn('Location fetching logic error', err);
      }

      if (!location) {
        // Fallback to a slow but sure high accuracy if nothing else worked
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 5000,
          });
        } catch (e) {
          console.warn('Final fallback failed', e);
        }
      }

      if (!location) {
        console.warn('Could not determine position');
        return;
      }

      const { latitude, longitude } = location.coords;

      // Parallelize location update and fetching nearby locations to save time
      const [_, res] = await Promise.all([
        updateMyLocation({ lat: latitude, lon: longitude }).catch(err => console.error('Error updating my location:', err)),
        getLocations({ lat: latitude, lon: longitude })
      ]);

      if (res && Array.isArray(res.locations)) {
        // Garde-fou UI: appliquer le même filtrage que le backend
        // et garantir au moins 1★ d'affichage lorsqu'un lieu est occupé
        const normalized = res.locations.map((it) => {
          const userCount = it?.userCount || 0;
          const stars = typeof it?.stars === 'number' ? it.stars : parseInt(it?.stars, 10) || 0;
          // Un lieu avec popularity >= 1000 reste considéré comme persistent (3 étoiles)
          const isPersistent = (it?.popularity || 0) >= 1000 || stars === 3;
          return { ...it, stars, userCount, isPersistent };
        });

        // Plus de filtrage restrictif ici, le backend a déjà fait le travail de sélection
        setLocations(normalized);
      }
    } catch (e) {
      console.error('Error fetching locations:', e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNearbyLocations();
    setRefreshing(false);
  };


  const renderHeader = () => (
    <View style={[
      styles.header,
      {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: isDark ? 0 : 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 10,
        borderBottomWidth: isDark ? 1 : 0,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent'
      }
    ]}>
      <Text style={[styles.headerTitle, { color: '#00c2cb' }]}>Lieux à proximité</Text>
      <View style={styles.headerIcons}>
        <TouchableOpacity onPress={() => onSearchPeople && onSearchPeople()} style={styles.headerIconButton}>
          <Text style={{ fontSize: 24 }}>🔎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReturnToAccount} style={styles.headerProfileButton}>
          <Image source={require('../assets/appIcons/userProfile.png')} style={[styles.profileIcon, { tintColor: '#00c2cb' }]} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      {renderHeader()}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
      ) : locations.length === 0 ? (
        // Etat vide: permettre le pull-to-refresh même sans éléments
        <ScrollView
          contentContainerStyle={[styles.listContent, { flexGrow: 1, justifyContent: 'center', alignItems: 'center' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00c2cb"]} progressViewOffset={10} />}
          alwaysBounceVertical
          bounces
          overScrollMode="always"
        >
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Aucun lieu trouvé à proximité</Text>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={locations}
          keyExtractor={(item) => item._id}
          renderItem={renderLocation}
          onScroll={(event) => {
            currentScrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#00c2cb"]}
              // Décale le spinner sous l'en‑tête sur Android si besoin
              progressViewOffset={10}
            />
          }
          // Optimization for performance
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={Platform.OS === 'android'}
          // Assure le tirage pour rafraîchir même s'il y a peu d'éléments
          contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: 20 }]}
          // Hérite des props ScrollView pour un meilleur comportement cross‑plateforme
          bounces
          overScrollMode="always"
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', flex: 1, letterSpacing: -0.5 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  headerProfileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIcon: { width: 24, height: 24 },
  listContent: { padding: 20 },
  locationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  locationInfo: { flex: 1 },
  locationName: { fontSize: 20, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  typeBadge: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
  activeUsersContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  usersCountText: { fontSize: 13, marginRight: 10, fontWeight: '500' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
  },
  smallAvatar: { width: '100%', height: '100%' },
  statusDotSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  popularityContainer: { alignItems: 'flex-end', marginLeft: 12 },
  popularityStars: { fontSize: 18 },
  emptyText: { textAlign: 'center', fontSize: 16, fontWeight: '500' },
});

export default LocationListScreen;

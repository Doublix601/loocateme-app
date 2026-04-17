import React, { useEffect, useState, useContext } from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
} from 'react-native';
import * as Location from 'expo-location';
import { getLocations, updateMyLocation } from '../components/ApiRequest';
import { formatLocationType } from '../components/LocationUtils';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const LocationListScreen = ({ onSelectLocation, onReturnToAccount, onSearchPeople, initialScrollOffset = 0, onScroll }) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user: currentUser } = useContext(UserContext);
  const flatListRef = React.useRef(null);
  const currentScrollOffset = React.useRef(0);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Seuleument capturer si le mouvement est principalement horizontal
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          // Swipe vers la droite -> UserSearchView
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
  }, []);

  useEffect(() => {
    if (initialScrollOffset > 0 && flatListRef.current && locations.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false });
      }, 100);
    }
  }, [locations.length]);


  const getStars = (item) => {
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
    return <Text style={{ color: '#ccc', fontSize: 18 }}>★</Text>;
  };

  const fetchNearbyLocations = async () => {
    try {
      setLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Update my location in backend (triggers check-in logic)
      await updateMyLocation({ lat: latitude, lon: longitude });

      const res = await getLocations({ lat: latitude, lon: longitude });
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

  const renderLocation = ({ item }) => (
    <TouchableOpacity
      style={[styles.locationCard, { backgroundColor: colors.surface }]}
      onPress={() => {
        onScroll && onScroll(currentScrollOffset.current);
        onSelectLocation({ ...item });
      }}
    >
      <View style={styles.locationInfo}>
        <Text style={[styles.locationName, { color: colors.text }]}>{item.name}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{formatLocationType(item.type)}</Text>
        </View>
        <View style={styles.activeUsersContainer}>
          <Text style={[styles.usersCountText, { color: colors.textSecondary }]}>
            {item.userCount || 0} utilisateur{(item.userCount || 0) > 1 ? 's' : ''} dans ce lieu
          </Text>
          <View style={styles.avatarStack}>
            {(item.activeUsers || []).map((u, index) => (
              <View key={u._id} style={[styles.avatarWrapper, { marginLeft: index === 0 ? 0 : -10 }]}>
                <ImageWithPlaceholder
                  uri={u.profileImageUrl}
                  style={styles.smallAvatar}
                />
                <View style={[styles.statusDotSmall, { backgroundColor: u.status === 'green' ? '#4CAF50' : '#FF9800' }]} />
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.popularityContainer}>
        <Text style={styles.popularityStars}>{getStars(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: '#00c2cb' }]}>Lieux à proximité</Text>
      <View style={styles.headerIcons}>
        <TouchableOpacity onPress={() => onSearchPeople && onSearchPeople()} style={styles.headerIconButton}>
          <Text style={{ fontSize: 24 }}>🔎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReturnToAccount}>
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
    padding: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', flex: 1 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { marginRight: 15 },
  profileIcon: { width: 30, height: 30 },
  listContent: { padding: 15 },
  locationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginBottom: 15,
    borderRadius: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  locationInfo: { flex: 1 },
  locationName: { fontSize: 20, fontWeight: 'bold', marginBottom: 5 },
  typeBadge: {
    backgroundColor: '#00c2cb',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  typeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  activeUsersContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  usersCountText: { fontSize: 14, marginRight: 10 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'white',
    backgroundColor: '#eee',
  },
  smallAvatar: { width: '100%', height: '100%', borderRadius: 12 },
  statusDotSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'white',
  },
  popularityContainer: { alignItems: 'flex-end', marginLeft: 10 },
  popularityStars: { fontSize: 18 },
  emptyText: { textAlign: 'center', fontSize: 16 },
});

export default LocationListScreen;

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/contexts/ThemeContext';
import { getLocationById } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { formatLocationType } from '../components/LocationUtils';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useBoost } from '../hooks/useBoost';
import { Alert } from 'react-native';

const LocationScreen = ({ locationId, tertiles, onReturnToList, onSelectUser, socialMediaIcons }) => {
  const { colors, isDark } = useTheme();
  const { checkAccess, isPremium } = useFeatureGate();
  const { activateBoost, isBoosted, boostUntil, boostBalance, loading: boostLoading } = useBoost();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(null);
  const [users, setUsers] = useState([]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx > 0;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          onReturnToList && onReturnToList();
        }
      },
    })
  ).current;

  useEffect(() => {
    fetchLocationDetails();

    // Refresh automatically on any mutation related to users or location
    const unsub = subscribe('api:mutation', (payload) => {
      const path = payload?.path || '';
      if (path.includes('/user/') || path.includes('/profile') || path.includes('/settings')) {
        fetchLocationDetails(true);
      }
    });

    return () => unsub();
  }, [locationId]);

  const fetchLocationDetails = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const res = await getLocationById(locationId);
      if (res && res.location) {
        const loc = res.location;
        const userCount = res.users?.length || 0;
        const stars = typeof loc.stars === 'number' ? loc.stars : parseInt(loc.stars, 10) || 0;

        setLocation({ ...loc, stars, userCount });
        setUsers(res.users || []);
      }
    } catch (e) {
      console.error('Error fetching location details:', e);
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLocationDetails(true);
    setRefreshing(false);
  };

  const handleGoToLocation = () => {
    if (!location || !location.location?.coordinates) return;
    const [lon, lat] = location.location.coordinates;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    Linking.openURL(url);
  };

  const handleBoost = () => {
    if (isBoosted) return; // Prevent multiple clicks
    if (checkAccess('boost')) {
      activateBoost();
    }
  };

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

  const renderUser = ({ item }) => {
    const statusColor = item.status === 'green' ? '#4CAF50' : item.status === 'orange' ? '#FF9800' : '#F44336';
    const isOrangeOrRed = item.status === 'orange' || item.status === 'red';
    const isUserBoosted = item.boostUntil && new Date(item.boostUntil) > new Date();

    return (
      <TouchableOpacity
        style={[
          styles.userCard,
          { backgroundColor: colors.surface },
          isUserBoosted && { borderColor: '#FFD700', borderWidth: 2, shadowColor: '#FFD700', shadowOpacity: 0.8, shadowRadius: 10, elevation: 5 }
        ]}
        onPress={() => onSelectUser(item)}
      >
        <ImageWithPlaceholder
          uri={item.profileImageUrl || item.photo}
          style={styles.userPhoto}
          placeholderText={item.username?.[0]?.toUpperCase() || '?'}
        />
        <View style={styles.userInfo}>
          <View style={styles.usernameRow}>
            <Text style={[styles.username, { color: isDark ? '#fff' : colors.text }]}>
              {item.customName || item.username}
            </Text>
            {isUserBoosted && <Text style={{ marginLeft: 4 }}>⚡</Text>}
            <View style={[styles.statusDot, { backgroundColor: statusColor, borderColor: colors.surface }]} />
          </View>
          {!isOrangeOrRed && item.bio ? (
            <Text style={[styles.userBio, { color: isDark ? '#ddd' : colors.textSecondary }]} numberOfLines={1}>
              {item.bio}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#00c2cb" />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: isDark ? '#fff' : colors.text, fontSize: 16, fontWeight: '600' }}>Lieu non trouvé</Text>
        <TouchableOpacity onPress={onReturnToList} style={styles.errorBackButton}>
          <Text style={{ color: '#00c2cb', fontWeight: '700', fontSize: 16 }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, {
        backgroundColor: colors.surface,
        elevation: isDark ? 0 : 5,
        shadowOpacity: isDark ? 0.3 : 0.1,
        borderBottomWidth: isDark ? 1 : 0,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent'
      }]}>
        <TouchableOpacity onPress={onReturnToList} style={styles.backButton}>
          <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: '#00c2cb' }]} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#00c2cb' }]} numberOfLines={1}>{location.name}</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item._id}
        renderItem={renderUser}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#00c2cb"]}
            progressViewOffset={10}
          />
        }
        ListHeaderComponent={
          <View style={styles.locationHeaderInfo}>
            <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
              <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(location.type)}</Text>
            </View>

            <View style={styles.popularityRow}>
              <View>
                <Text style={[styles.popularityLabel, { color: isDark ? '#fff' : colors.textSecondary }]}>Popularité</Text>
                <Text style={styles.popularityStars}>
                  {getStars(location, isDark)}
                </Text>
              </View>

              <TouchableOpacity style={styles.goButtonRound} onPress={handleGoToLocation}>
                <Text style={[styles.goEmoji, { color: '#fff' }]}>📍</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.boostCard,
                {
                  backgroundColor: isDark ? 'rgba(255,215,0,0.1)' : 'rgba(255,215,0,0.05)',
                  borderColor: '#FFD700',
                  opacity: isBoosted ? 0.8 : 1
                }
              ]}
              onPress={handleBoost}
              disabled={isBoosted || boostLoading}
            >
              <View style={styles.boostInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.boostTitle, { color: colors.text }]}>
                    {isBoosted ? '⚡ Boost actif !' : '🔥 Boostez votre profil !'}
                  </Text>
                  {boostLoading && (
                    <ActivityIndicator size="small" color="#FFD700" style={{ marginLeft: 10 }} />
                  )}
                </View>
                <Text style={[styles.boostSubtitle, { color: colors.textSecondary }]}>
                  {isBoosted
                    ? `Expire dans ${Math.max(0, Math.ceil((boostUntil - new Date()) / (60 * 1000)))} min.`
                    : boostBalance > 0
                      ? `Vous avez ${boostBalance} boost${boostBalance > 1 ? 's' : ''} disponible${boostBalance > 1 ? 's' : ''}.`
                      : 'Devenez 3x plus visible sur ce lieu pendant 30 min.'}
                </Text>
              </View>
              <View style={[styles.boostBadge, isBoosted && { backgroundColor: '#FFD700' }]}>
                <Text style={[styles.boostBadgeText, isBoosted && { color: '#000' }]}>
                  {isBoosted ? 'ACTIF' : 'BOOST'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : colors.text }]}>Utilisateurs sur place</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Personne n'est ici pour le moment</Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  backIcon: { width: 24, height: 24 },
  headerTitle: { fontSize: 24, fontWeight: '800', flex: 1, letterSpacing: -0.5 },
  locationHeaderInfo: { padding: 25 },
  typeBadge: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 15,
  },
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
  popularityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  popularityLabel: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  popularityStars: { fontSize: 20 },
  goButtonRound: {
    backgroundColor: '#00c2cb',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  goEmoji: { fontSize: 28 },
  boostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 25,
    elevation: 3,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  boostInfo: { flex: 1 },
  boostTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  boostSubtitle: { fontSize: 12, fontWeight: '500' },
  boostBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  boostBadgeText: { fontSize: 10, fontWeight: '900', color: '#000' },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 15, letterSpacing: -0.3 },
  listContent: { paddingBottom: 30 },
  userCard: {
    flexDirection: 'row',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  errorBackButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    borderRadius: 15
  },
  userPhoto: { width: 56, height: 56, borderRadius: 28 },
  userInfo: { flex: 1, marginLeft: 16 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { fontSize: 18, fontWeight: '800', marginRight: 8, letterSpacing: -0.3 },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  userBio: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, fontWeight: '500' },
});

export default LocationScreen;

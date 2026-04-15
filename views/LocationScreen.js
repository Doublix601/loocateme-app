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
  SafeAreaView,
  PanResponder,
} from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { getLocationById } from '../components/ApiRequest';
import { formatLocationType } from '../components/LocationUtils';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

const LocationScreen = ({ locationId, tertiles, onReturnToList, onSelectUser, socialMediaIcons }) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
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
  }, [locationId]);

  const fetchLocationDetails = async () => {
    try {
      setLoading(true);
      const res = await getLocationById(locationId);
      if (res && res.location) {
        setLocation(res.location);
        setUsers(res.users || []);
      }
    } catch (e) {
      console.error('Error fetching location details:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLocation = () => {
    if (!location || !location.location?.coordinates) return;
    const [lon, lat] = location.location.coordinates;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    Linking.openURL(url);
  };

  const getStars = (starsCount) => {
    // Determine the number of stars based on backend stars field
    if (starsCount === 3) {
      return <Text style={{ fontSize: 18 }}>⭐⭐⭐</Text>;
    }
    if (starsCount === 2) {
      return <Text style={{ fontSize: 18 }}>⭐⭐</Text>;
    }
    if (starsCount === 1) {
      return <Text style={{ fontSize: 18 }}>⭐</Text>;
    }

    // Default to 1 grey star for 0 stars (though they shouldn't be visible)
    return <Text style={{ color: '#ccc', fontSize: 18 }}>★</Text>;
  };

  const renderUser = ({ item }) => {
    const statusColor = item.status === 'green' ? '#4CAF50' : item.status === 'orange' ? '#FF9800' : '#F44336';

    return (
      <TouchableOpacity
        style={[styles.userCard, { backgroundColor: colors.surface }]}
        onPress={() => onSelectUser(item)}
      >
        <ImageWithPlaceholder
          uri={item.profileImageUrl || item.photo}
          style={styles.userPhoto}
          placeholderText={item.username?.[0]?.toUpperCase() || '?'}
        />
        <View style={styles.userInfo}>
          <View style={styles.usernameRow}>
            <Text style={[styles.username, { color: colors.text }]}>
              {item.customName || item.username}
            </Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
          <Text style={[styles.userBio, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.bio}
          </Text>
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
        <Text style={{ color: colors.text }}>Lieu non trouvé</Text>
        <TouchableOpacity onPress={onReturnToList}>
          <Text style={{ color: '#00c2cb', marginTop: 10 }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onReturnToList} style={styles.backButton}>
          <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: colors.text }]} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#00c2cb', fontSize: 24 }]} numberOfLines={1}>{location.name}</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item._id}
        renderItem={renderUser}
        ListHeaderComponent={
          <View style={styles.locationInfo}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{formatLocationType(location.type)}</Text>
            </View>

            <View style={styles.popularityRow}>
              <Text style={[styles.popularityScore, { color: colors.textSecondary }]}>
                Popularité : {getStars(location.stars || 0)}
              </Text>

              <TouchableOpacity style={styles.goButtonRound} onPress={handleGoToLocation}>
                <Text style={styles.goEmoji}>📍</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Utilisateurs sur place</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Personne n'est ici pour le moment</Text>
        }
        contentContainerStyle={styles.listContent}
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
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: { marginRight: 15 },
  backIcon: { width: 24, height: 24 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  locationInfo: { padding: 20 },
  typeBadge: {
    backgroundColor: '#00c2cb',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  typeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  popularityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  popularityScore: { fontSize: 20, fontWeight: 'bold' },
  goButtonRound: {
    backgroundColor: '#00c2cb',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  goEmoji: { fontSize: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  listContent: { paddingBottom: 20 },
  userCard: {
    flexDirection: 'row',
    padding: 15,
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userPhoto: { width: 50, height: 50, borderRadius: 25 },
  userInfo: { flex: 1, marginLeft: 15 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  userBio: { fontSize: 16, marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 50 },
});

export default LocationScreen;

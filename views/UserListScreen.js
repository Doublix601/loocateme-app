import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import { updateMyLocation, getUsersAroundMe } from '../components/ApiRequest';

const { width, height } = Dimensions.get('window');

const UserListScreen = ({ users = [], onSelectUser, onReturnToAccount, initialScrollOffset = 0, onUpdateScrollOffset }) => {
  const [loading, setLoading] = useState(false);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNearby = async () => {
    try {
      setLoading(true);
      // Ask permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error("Permission de localisation refusée");
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      await updateMyLocation({ lat, lon }).catch(() => {});
      const res = await getUsersAroundMe({ lat, lon, radius: 300 });
      const apiUsers = res?.users || [];
      setNearbyUsers(apiUsers);
    } catch (e) {
      Alert.alert('Localisation', e?.message || 'Impossible de récupérer votre position.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!users || users.length === 0) {
      fetchNearby();
    }
  }, []);
  const renderItem = ({ item }) => (
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
            {item.bio ?? 'Pas de bio'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Autour de moi</Text>

      {loading && data.length === 0 ? (
        <View style={styles.noUsersContainer}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.noUsersContainer}>
          <Text style={styles.noUsersText}>
            Personne autour de vous. Tirez pour actualiser.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => (item._id || item.id || Math.random()).toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNearby(); }} />
          }
        />
      )}

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
    shadowOffset: { width: 0, height: 2 },
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

  noUsersText: {
    width: '100%',
    color: 'gray',
    textAlign: 'center',
    marginHorizontal: 20,
    flexWrap: 'wrap',
    fontSize: width * 0.045,
  },
});

export default UserListScreen;

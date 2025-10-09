import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const UserProfileScreen = ({ user, onReturnToList, onReturnToAccount, socialMediaIcons }) => {
  const edgeHitWidth = 25;
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      return evt.nativeEvent.pageX <= edgeHitWidth;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return evt.nativeEvent.pageX <= edgeHitWidth && isHorizontal && dx > 10;
    },
    onPanResponderRelease: (evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 60 && vx > 0.2) {
        onReturnToList && onReturnToList();
      }
    },
  });

  if (!user) {
    return (
      <View style={styles.container} {...panResponder.panHandlers}>
        <Text style={styles.error}>Aucun utilisateur sélectionné.</Text>
        <TouchableOpacity style={styles.modalButton} onPress={onReturnToList}>
          <Text style={styles.modalButtonText}>Retour à la liste</Text>
        </TouchableOpacity>
      </View>
    );
  }


  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onReturnToList}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Image
          source={require('../assets/appIcons/backArrow.png')}
          style={styles.backButtonImage}
        />
      </TouchableOpacity>

      <ScrollView style={styles.container}>

        <View style={styles.userInfoContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.imgUsernameSplitBox}>
              <View style={styles.userProfilePictureContainer}>
                {user.photo ? (
                  <Image source={{ uri: user.photo }} style={styles.profileImage} />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Image
                      source={require('../assets/appIcons/userProfile.png')}
                      style={styles.placeholderIcon}
                    />
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <Text style={styles.usernameUnderPhoto}>{user.username}</Text>
              </View>
            </View>

            <View style={styles.bioContainer}>
              <View style={styles.bioTextContainer}>
                <Text
                  style={[
                    styles.value,
                    { fontSize: Math.min(width * 0.04, 18), textAlign: 'center' },
                  ]}
                >
                  {user.bio || 'Pas de bio'}
                </Text>
              </View>
            </View>

            <View style={{ alignItems: 'center', marginTop: height * 0.015 }}>
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>{user.distance ?? '—'}</Text>
              </View>
            </View>

          </View>

          <View style={styles.socialMediaContainer}>
            {(() => {
              const socials = user.socialMedias ?? user.socialMedia ?? [];
              return socials.length > 0 ? (
                socials.map((social, index) => {
                  const platform = social.platform ?? social.socialMedia;
                  const iconSrc = platform ? socialMediaIcons[platform] : undefined;
                  if (!iconSrc) return null;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.socialMediaTile}
                      onPress={() => { }}
                    >
                      <Image
                        source={iconSrc}
                        style={styles.socialMediaIcon}
                      />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.value}>Aucun réseau social</Text>
              );
            })()}
          </View>
        </View>
      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: width * 0.05,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: height * 0.02,
    marginBottom: height * 0.03,
    color: '#00c2cb',
  },
  userInfoContainer: {
    marginBottom: height * 0.05,
    paddingLeft: width * 0.05,
  },
  usernameTitleContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  usernameTextContainer: {
    alignItems: 'flex-start',
    width: '100%',
  },
  bioContainer: {
    width: '100%',
    marginTop: height * 0.02,
    alignItems: 'center',
  },
  bioTitleContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  bioTextContainer: {
    alignItems: 'center',
    width: '100%',
  },
  profileHeader: {
    flexDirection: width > 600 ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: height * 0.03,
  },
  imgUsernameSplitBox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: height * 0.02,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },

  userProfilePictureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: width > 600 ? width * 0.05 : width * 0.03,
    marginBottom: width > 600 ? 0 : height * 0.02,
    marginRight: width > 600 ? 20 : 15,
  },

  usernameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.01,
  },
  usernameUnderPhoto: {
    marginTop: 8,
    fontSize: Math.min(width * 0.065, 26),
    color: '#00c2cb',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  profileImage: {
    width: Math.min(width * 0.3, 120),
    height: Math.min(width * 0.3, 120),
    borderRadius: Math.min(width * 0.15, 60),
  },
  placeholderImage: {
    width: Math.min(width * 0.3, 120),
    height: Math.min(width * 0.3, 120),
    backgroundColor: '#00c2cb',
    borderRadius: Math.min(width * 0.15, 60),
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    width: Math.min(width * 0.15, 56),
    height: Math.min(width * 0.15, 56),
    tintColor: '#fff',
  },
  userInfoText: {
    marginLeft: width > 600 ? width * 0.05 : 0,
    alignItems: width > 600 ? 'flex-start' : 'center',
  },
  label: {
    fontSize: Math.min(width * 0.045, 18),
    color: '#00c2cb',
    marginBottom: 5,
  },
  value: {
    fontSize: Math.min(width * 0.04, 16),
    color: '#3f4a4b',
  },
  editButton: {
    backgroundColor: '#00c2cb',
    paddingVertical: height * 0.01,
    paddingHorizontal: width * 0.05,
    borderRadius: 10,
    marginTop: height * 0.01,
  },
  editButtonText: {
    color: '#fff',
    fontSize: Math.min(width * 0.04, 16),
  },
  socialMediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  socialMediaTile: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height * 0.02,
    marginHorizontal: width * 0.03,
  },
  socialMediaIcon: {
    width: Math.min(width * 0.14, 56),
    height: Math.min(width * 0.14, 56),
    resizeMode: 'contain',
  },
  socialMediaText: {
    fontSize: width * 0.04,
    marginTop: height * 0.01,
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
    paddingTop: height * 0.05,
  },
  modalTitle: {
    fontSize: width * 0.06,
    fontWeight: 'bold',
    marginBottom: height * 0.02,
    color: '#00c2cb',
  },
  modalInput: {
    width: '100%',
    height: height * 0.06,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: width * 0.03,
    marginBottom: height * 0.02,
  },
  modalButton: {
    backgroundColor: '#00c2cb',
    padding: width * 0.03,
    borderRadius: 10,
    marginBottom: height * 0.01,
    width: '80%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: width * 0.05,
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  iconContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  selectedTile: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  returnToListButton: {
    backgroundColor: '#00c2cb',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 30,
    right: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  settingsButton: {
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
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  backButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
  },
  error: {
    fontSize: width * 0.05,
    color: 'red',
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
});

export default UserProfileScreen;

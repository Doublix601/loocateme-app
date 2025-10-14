import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
  SafeAreaView,
  Linking,
  Alert,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const UserProfileScreen = ({ user, onReturnToList, onReturnToAccount, socialMediaIcons }) => {
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 60 || vx > 0.3) {
        onReturnToList && onReturnToList();
      }
    },
  });

  // Dynamic scaling based on number of social networks to avoid scrolling and fill the page reasonably
  const socialsArr = (user?.socialMedias ?? user?.socialMedia ?? []);
  const socialCountForScale = Array.isArray(socialsArr) ? socialsArr.length : 0;
  const computeScale = (count) => {
    if (count <= 0) return 1.1;
    if (count === 1) return 1.05;
    if (count <= 3) return 1.0;
    if (count <= 6) return 0.9;
    if (count <= 9) return 0.85;
    return 0.8;
  };
  const scale = computeScale(socialCountForScale);
  const imgSize = Math.min(width * 0.4, 160) * scale;
  const iconSize = Math.min(width * 0.2, 72) * scale;
  const usernameFont = Math.min(width * 0.075, 30) * scale;
  const baseBioFont = Math.min(width * 0.04, 18) * scale;
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));
  const placeholderIconSize = Math.min(width * 0.18, 72) * scale;

  const INSTAGRAM_USERNAME_REGEX = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;

  const extractInstagramUsername = (input = '') => {
    let v = String(input).trim();
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
        v = path.split('/')[0] || '';
      }
    } catch (_e) {}
    if (v.startsWith('@')) v = v.slice(1);
    return v;
  };

  const openSocial = async (platform, rawHandle) => {
    const handle = String(rawHandle || '').trim();
    if (!platform || !handle) return;
    try {
      if (platform === 'instagram') {
        const username = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(username)) {
          Alert.alert('Lien invalide', "Nom d'utilisateur Instagram invalide");
          return;
        }
        const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
        const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
        const canOpen = await Linking.canOpenURL(appUrl);
        if (canOpen) {
          await Linking.openURL(appUrl);
        } else {
          await Linking.openURL(webUrl);
        }
        return;
      }
      // Fallback for other platforms: try a generic https link if provided as URL
      if (/^https?:\/\//i.test(handle)) {
        await Linking.openURL(handle);
      }
    } catch (_e) {
      try { await Linking.openURL(handle); } catch {}
    }
  };

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
    <SafeAreaView style={styles.container} {...panResponder.panHandlers}>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: width * 0.05, paddingTop: height * 0.01, paddingBottom: Math.max(24, height * 0.06), flexGrow: 1 }}>

        <View style={styles.userInfoContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.imgUsernameSplitBox}>
              <View style={styles.userProfilePictureContainer}>
                {user.photo ? (
                  <Image source={{ uri: user.photo }} style={[styles.profileImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]} />
                ) : (
                  <View style={[styles.placeholderImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}>
                    <Image
                      source={require('../assets/appIcons/userProfile.png')}
                      style={[styles.placeholderIcon, { width: placeholderIconSize, height: placeholderIconSize }]}
                    />
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <Text style={[styles.usernameUnderPhoto, { fontSize: usernameFont }]}>{user.username}</Text>
              </View>
            </View>

            <View style={styles.bioContainer}>
              <View style={styles.bioTextContainer}>
                <Text
                  style={[
                    styles.value,
                    { fontSize: bioFont, textAlign: 'center' },
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
                      onPress={() => {
                        const handle = social.username || social.link || social.identifier || '';
                        openSocial(platform, handle);
                      }}
                    >
                      <Image
                        source={iconSrc}
                        style={[styles.socialMediaIcon, { width: iconSize, height: iconSize }]}
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

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: height * 0.04,
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
    fontSize: Math.min(width * 0.075, 30),
    color: '#00c2cb',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  profileImage: {
    width: Math.min(width * 0.4, 160),
    height: Math.min(width * 0.4, 160),
    borderRadius: Math.min(width * 0.2, 80),
  },
  placeholderImage: {
    width: Math.min(width * 0.4, 160),
    height: Math.min(width * 0.4, 160),
    backgroundColor: '#00c2cb',
    borderRadius: Math.min(width * 0.2, 80),
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    width: Math.min(width * 0.18, 72),
    height: Math.min(width * 0.18, 72),
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
    padding: Math.max(6, width * 0.02),
    borderRadius: 999,
  },
  socialMediaIcon: {
    width: Math.min(width * 0.2, 72),
    height: Math.min(width * 0.2, 72),
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

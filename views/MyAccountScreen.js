import { useState, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { UserContext } from '../components/contexts/UserContext';
import { updateProfile as apiUpdateProfile, uploadProfilePhoto as apiUploadProfilePhoto } from '../components/ApiRequest';

const { width, height } = Dimensions.get('window');

const MyAccountScreen = ({
  onReturnToList,
  socialMediaIcons,
  onReturnToSettings,
}) => {
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
  const { user, updateUser } = useContext(UserContext);
  const [modalVisible, setModalVisible] = useState(false);
  const [editType, setEditType] = useState('');
  const [newValue, setNewValue] = useState('');

  const [showSocialModal, setShowSocialModal] = useState(false);
  const [selectedSocialPlatform, setSelectedSocialPlatform] = useState('');
  const [socialLinks, setSocialLinks] = useState(user.socialMedia || []);
  const [socialModalVisible, setSocialModalVisible] = useState(false);
  const [selectedSocialLink, setSelectedSocialLink] = useState(null);
  const [photoOptionsModalVisible, setPhotoOptionsModalVisible] =
    useState(false);

  const handleEdit = (type) => {
    setEditType(type);
    setNewValue(user[type]);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (editType && newValue.trim() !== '') {
      try {
        if (editType === 'username') {
          const res = await apiUpdateProfile({ name: newValue });
          const updated = res?.user || {};
          updateUser({
            ...user,
            username: updated.name ?? newValue,
            bio: updated.bio ?? user.bio,
            photo: updated.profileImageUrl ?? user.photo,
          });
        } else if (editType === 'bio') {
          const res = await apiUpdateProfile({ bio: newValue });
          const updated = res?.user || {};
          updateUser({
            ...user,
            username: updated.name ?? user.username,
            bio: updated.bio ?? newValue,
            photo: updated.profileImageUrl ?? user.photo,
          });
        }
      } catch (e) {
        Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le profil');
      }
    }
    setModalVisible(false);
  };

  const handleAddSocial = () => {
    const newSocial = { platform: selectedSocialPlatform, username: newValue };
    const updatedSocialLinks = [...socialLinks, newSocial];

    setSocialLinks(updatedSocialLinks);
    updateUser({ ...user, socialMedia: updatedSocialLinks }); // Update user context
    setShowSocialModal(false);
    setSelectedSocialPlatform('');
    setNewValue('');
  };

  const handleSocialLongPress = (social) => {
    setSelectedSocialLink(social);
    setNewValue(social.username);
    setSocialModalVisible(true);
  };

  const handleSocialEdit = () => {
    const updatedLinks = socialLinks.map((link) =>
      link.platform === selectedSocialLink.platform
        ? { ...link, username: newValue }
        : link
    );
    setSocialLinks(updatedLinks);
    updateUser({ ...user, socialMedia: updatedLinks }); // Mise à jour du contexte utilisateur
    setSocialModalVisible(false);
  };

  const handleSocialDelete = () => {
    const updatedLinks = socialLinks.filter(
      (link) => link.platform !== selectedSocialLink.platform
    );
    setSocialLinks(updatedLinks);
    updateUser({ ...user, socialMedia: updatedLinks }); // Mise à jour du contexte utilisateur
    setSocialModalVisible(false);
  };

  const handleProfileImageLongPress = () => {
    setPhotoOptionsModalVisible(true);
  };

  const handleCamera = async () => {
    try {
      // Check platform support
      if (Platform.OS === 'web') {
        Alert.alert('Non supporté', "La caméra n'est pas disponible sur le web.");
        return;
      }

      // Request camera permission first
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Autorisation requise',
          "L'application a besoin de l'accès à la caméra pour prendre une photo.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      const canceled = result?.canceled ?? result?.cancelled;
      const uri = result?.assets?.[0]?.uri ?? result?.uri;
      if (!canceled && uri) {
        try {
          const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
          const file = { uri, name, type: 'image/jpeg' };
          const res = await apiUploadProfilePhoto(file);
          const updated = res?.user || {};
          updateUser({
            ...user,
            photo: updated.profileImageUrl || uri,
            username: updated.name ?? user.username,
            bio: updated.bio ?? user.bio,
          });
        } catch (e2) {
          Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
        }
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir la caméra.");
    } finally {
      setPhotoOptionsModalVisible(false);
    }
  };

  const handleGallery = async () => {
    try {
      if (Platform.OS === 'web') {
        // On web, launchImageLibraryAsync may work without permission, but guard anyway
        const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
        const canceled = result?.canceled ?? result?.cancelled;
        const uri = result?.assets?.[0]?.uri ?? result?.uri;
        if (!canceled && uri) updateUser({ ...user, photo: uri });
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Autorisation requise',
          "L'application a besoin de l'accès à vos photos pour sélectionner une image.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
      });
      const canceled = result?.canceled ?? result?.cancelled;
      const uri = result?.assets?.[0]?.uri ?? result?.uri;
      if (!canceled && uri) {
        try {
          const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
          const file = { uri, name, type: 'image/jpeg' };
          const res = await apiUploadProfilePhoto(file);
          const updated = res?.user || {};
          updateUser({
            ...user,
            photo: updated.profileImageUrl || uri,
            username: updated.name ?? user.username,
            bio: updated.bio ?? user.bio,
          });
        } catch (e2) {
          Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
        }
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    } finally {
      setPhotoOptionsModalVisible(false);
    }
  };

  const handleDeletePhoto = () => {
    updateUser({ ...user, photo: null });
    setPhotoOptionsModalVisible(false);
  };

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
        <Text style={styles.title}>Mon Compte</Text>
        <View style={styles.userInfoContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.imgUsernameSplitBox}>
              <View style={styles.userProfilePictureContainer}>
                <TouchableOpacity onLongPress={handleProfileImageLongPress}>
                  {user.photo ? (
                    <Image
                      source={{ uri: user.photo }}
                      style={styles.profileImage}
                    />
                  ) : (
                    <View style={styles.placeholderImage}>
                      <Image
                        source={require('../assets/appIcons/userProfile.png')}
                        style={styles.placeholderIcon}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <TouchableOpacity
                  onLongPress={() => handleEdit('username')}
                  delayLongPress={300}
                  activeOpacity={1}
                >
                  <Text style={styles.usernameUnderPhoto}>{user.username}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bioContainer}>
              <TouchableOpacity
                style={styles.bioTextContainer}
                onLongPress={() => handleEdit('bio')}
                delayLongPress={300}
                activeOpacity={1}
              >
                <Text
                  style={[
                    styles.value,
                    { fontSize: Math.min(width * 0.04, 18), textAlign: 'center' },
                  ]}>
                  {user.bio}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.socialMediaContainer}>
            <TouchableOpacity
              onPress={() => setShowSocialModal(true)}
              style={styles.socialMediaTile}>
              <Image
                source={require('../assets/socialMediaIcons/addSocialNetwork_logo.png')}
                style={styles.socialMediaIcon}
              />
            </TouchableOpacity>
            {socialLinks.map((social, index) => (
              <TouchableOpacity
                key={index}
                style={styles.socialMediaTile}
                onLongPress={() => handleSocialLongPress(social)}>
                <Image
                  source={socialMediaIcons[social.platform]}
                  style={styles.socialMediaIcon}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Modal visible={modalVisible} transparent={true} animationType="fade">
          <View style={styles.modalContainer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Modifier {editType.charAt(0).toUpperCase() + editType.slice(1)}
              </Text>
              <TextInput
                value={newValue}
                onChangeText={setNewValue}
                style={[
                  styles.modalInput,
                  editType === 'bio' ? { height: Math.max(height * 0.18, 120), textAlignVertical: 'top', paddingTop: 10 } : null,
                ]}
                multiline={editType === 'bio'}
                numberOfLines={editType === 'bio' ? 6 : 1}
                blurOnSubmit={editType !== 'bio'}
                returnKeyType={editType === 'bio' ? 'default' : 'done'}
              />
              <TouchableOpacity onPress={handleSave} style={styles.modalButton}>
                <Text style={styles.modalButtonText}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalButton}>
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showSocialModal} transparent={true} animationType="fade">
          <View style={styles.modalContainer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSocialModal(false)} />
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.modalBackButton}
                onPress={() => setShowSocialModal(false)}
                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
              >
                <Image
                  source={require('../assets/appIcons/backArrow.png')}
                  style={styles.modalBackButtonImage}
                />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Ajouter un réseau</Text>
              <ScrollView>
                <View style={styles.iconContainer}>
                  {Object.keys(socialMediaIcons).map((platform) => (
                    <TouchableOpacity
                      key={platform}
                      onPress={() => {
                        setSelectedSocialPlatform(platform);
                        setNewValue('');
                      }}
                      style={[
                        styles.socialMediaTile,
                        selectedSocialPlatform === platform &&
                          styles.selectedTile,
                      ]}>
                      <Image
                        source={socialMediaIcons[platform]}
                        style={styles.socialMediaIcon}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={newValue}
                  onChangeText={setNewValue}
                  placeholder="Nom d'utilisateur"
                  style={styles.modalInput}
                />
              </ScrollView>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleAddSocial}
                  style={[
                    styles.iconRoundButton,
                    styles.iconEdit,
                    (!selectedSocialPlatform || !newValue) && { opacity: 0.5 },
                  ]}
                  disabled={!selectedSocialPlatform || !newValue}
                  accessibilityLabel="Enregistrer"
                >
                  <Text style={styles.iconEmoji}>💾</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={socialModalVisible} transparent={true} animationType="fade">
          <View style={styles.modalContainer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSocialModalVisible(false)} />
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.modalBackButton}
                onPress={() => setSocialModalVisible(false)}
                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
              >
                <Image
                  source={require('../assets/appIcons/backArrow.png')}
                  style={styles.modalBackButtonImage}
                />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Modifier</Text>
              <TextInput
                value={newValue}
                onChangeText={setNewValue}
                style={styles.modalInput}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleSocialDelete}
                  style={[styles.iconRoundButton, styles.iconDelete]}
                  accessibilityLabel="Supprimer">
                  <Text style={styles.iconEmoji}>🗑️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSocialEdit}
                  style={[styles.iconRoundButton, styles.iconEdit]}
                  accessibilityLabel="Enregistrer">
                  <Text style={styles.iconEmoji}>💾</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={photoOptionsModalVisible} transparent={true} animationType="fade">
          <View style={styles.modalContainer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoOptionsModalVisible(false)} />
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.modalBackButton}
                onPress={() => setPhotoOptionsModalVisible(false)}
                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
              >
                <Image
                  source={require('../assets/appIcons/backArrow.png')}
                  style={styles.modalBackButtonImage}
                />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Photo de profil</Text>

              <View style={{ alignItems: 'center', marginBottom: height * 0.02 }}>
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

              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleCamera}
                  style={[styles.iconRoundButton, styles.iconEdit]}
                  accessibilityLabel="Prendre une photo">
                  <Text style={styles.iconEmoji}>📷</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleGallery}
                  style={[styles.iconRoundButton, styles.iconEdit]}
                  accessibilityLabel="Choisir depuis la galerie">
                  <Text style={styles.iconEmoji}>🖼️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeletePhoto}
                  style={[styles.iconRoundButton, styles.iconDelete]}
                  accessibilityLabel="Supprimer la photo">
                  <Text style={styles.iconEmoji}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

      <TouchableOpacity
        style={styles.returnToListButton}
        onPress={onReturnToList}>
        <Image
          source={require('../assets/appIcons/userList.png')}
          style={styles.roundButtonImage}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={onReturnToSettings}>
        <Image
          source={require('../assets/appIcons/settings.png')}
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
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 999,
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: width * 0.05,
  },
  modalTitle: {
    fontSize: width * 0.06,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: height * 0.02,
    color: '#00c2cb',
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    height: height * 0.06, // Responsive height
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
    borderColor: '#00c2cb',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: height * 0.01,
    marginBottom: height * 0.005,
  },
  iconRoundButton: {
    width: Math.min(width * 0.16, 64),
    height: Math.min(width * 0.16, 64),
    borderRadius: Math.min(width * 0.08, 32),
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  iconEdit: {
    backgroundColor: '#00c2cb',
  },
  iconDelete: {
    backgroundColor: '#f44336',
  },
  iconCancel: {
    backgroundColor: '#9e9e9e',
  },
  iconEmoji: {
    fontSize: Math.min(width * 0.08, 28),
    color: '#fff',
  },
  modalBackButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1,
    padding: 8,
  },
  modalBackButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
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
});

export default MyAccountScreen;

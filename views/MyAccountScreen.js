import { useState, useContext, useEffect } from 'react';
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
  SafeAreaView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { UserContext } from '../components/contexts/UserContext';
import { updateProfile as apiUpdateProfile, uploadProfilePhoto as apiUploadProfilePhoto, upsertSocial as apiUpsertSocial, removeSocial as apiRemoveSocial, getMyUser } from '../components/ApiRequest';

const { width, height } = Dimensions.get('window');

const MyAccountScreen = ({
  onReturnToList,
  socialMediaIcons,
  onReturnToSettings,
  onOpenDataManagement,
}) => {
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      // Enable from anywhere on screen: start responding when a right swipe is detected
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 60 || vx > 0.3) {
        onReturnToList && onReturnToList();
      }
    },
  });
  const { user, updateUser } = useContext(UserContext);
  const [modalVisible, setModalVisible] = useState(false);
  const [editType, setEditType] = useState('');
  const [newValue, setNewValue] = useState('');

  // Dynamically scale UI based on number of social networks to best fill the page without scrolling
  const socialCountForScale = Array.isArray(user?.socialMedia) ? user.socialMedia.length : 0;
  const computeScale = (count) => {
    if (count <= 0) return 1.1; // slightly larger to fill
    if (count === 1) return 1.05;
    if (count <= 3) return 1.0;
    if (count <= 6) return 0.9;
    if (count <= 9) return 0.85;
    return 0.8; // many socials -> reduce to fit
  };
  const scale = computeScale(socialCountForScale);
  const imgSize = Math.min(width * 0.4, 160) * scale;
  const iconSize = Math.min(width * 0.2, 72) * scale;
  const usernameFont = Math.min(width * 0.075, 30) * scale;
  const baseBioFont = Math.min(width * 0.04, 18) * scale;
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));
  const placeholderIconSize = Math.min(width * 0.18, 72) * scale;

  const [showSocialModal, setShowSocialModal] = useState(false);
  const [selectedSocialPlatform, setSelectedSocialPlatform] = useState('');
  const [socialLinks, setSocialLinks] = useState(user.socialMedia || []);
  const [socialModalVisible, setSocialModalVisible] = useState(false);

  // Keep local socialLinks in sync with context user updates
  useEffect(() => {
    setSocialLinks(user?.socialMedia || []);
  }, [user?.socialMedia]);

  // On mount, if socials are empty (e.g., after auto-login), fetch my user from backend and hydrate context
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const empty = !user?.socialMedia || user.socialMedia.length === 0;
        if (!empty) return;
        const res = await getMyUser();
        const me = res?.user;
        if (!me || !mounted) return;
        const mappedSocial = mapNetworksToSocialMedia(me.socialNetworks || []);
        setSocialLinks(mappedSocial);
        if (updateUser) {
          updateUser({
            ...user,
            username: me.name || user?.username || '',
            bio: typeof me.bio === 'string' ? me.bio : (user?.bio || ''),
            photo: me.profileImageUrl || user?.photo || null,
            socialMedia: mappedSocial,
            isVisible: me.isVisible !== false,
            consent: me.consent || user?.consent || { accepted: false, version: '', consentAt: null },
            privacyPreferences: me.privacyPreferences || user?.privacyPreferences || { analytics: false, marketing: false },
          });
        }
      } catch (e) {
        console.error('[MyAccount] getMyUser error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details });
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedSocialLink, setSelectedSocialLink] = useState(null);
  const [photoOptionsModalVisible, setPhotoOptionsModalVisible] =
    useState(false);

  // Allowed social platforms (must match backend validation)
  const ALLOWED_PLATFORMS = ['instagram', 'facebook', 'x', 'snapchat', 'tiktok', 'linkedin'];

  // Instagram username regex (provided)
  const INSTAGRAM_USERNAME_REGEX = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
  // TikTok username regex (approximate: 2-24 chars, letters, numbers, dot, underscore)
  const TIKTOK_USERNAME_REGEX = /^[A-Za-z0-9._]{2,24}$/;

  // Sanitize a possibly pasted Instagram URL to just the username
  const extractInstagramUsername = (input = '') => {
    let v = String(input).trim();
    // If user pasted a full URL like https://www.instagram.com/username/
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        // path like "/username/" or "/username"
        const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
        // username is first segment
        v = path.split('/')[0] || '';
      }
    } catch (_e) {
      // Not a valid URL, keep raw value
    }
    // Remove leading @ if present
    if (v.startsWith('@')) v = v.slice(1);
    return v;
  };

  const extractTikTokUsername = (input = '') => {
    let v = String(input).trim();
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        // TikTok profile paths are like "/@username" or "/@username/video/..."
        const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
        const firstSeg = (path.split('/')[0] || '').trim();
        v = firstSeg.startsWith('@') ? firstSeg.slice(1) : firstSeg;
      }
    } catch (_e) {}
    if (v.startsWith('@')) v = v.slice(1);
    return v;
  };

  // Map backend socialNetworks -> frontend socialMedia shape (normalize and filter)
  const mapNetworksToSocialMedia = (networks = []) =>
    networks
      .map((n) => {
        const raw = String(n?.type || '').toLowerCase();
        const platform = raw === 'twitter' ? 'x' : raw;
        if (!ALLOWED_PLATFORMS.includes(platform)) return null;
        return { platform, username: n?.handle || '' };
      })
      .filter(Boolean);

  const handleEdit = (type) => {
    setEditType(type);
    setNewValue(user[type]);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (editType && newValue.trim() !== '') {
      try {
        if (editType === 'username') {
          // Normalize and validate username
          let normalized = String(newValue || '').trim();
          if (normalized) {
            const lower = normalized.toLowerCase();
            normalized = lower.charAt(0).toUpperCase() + lower.slice(1);
          }
          const USERNAME_RE = /^[A-Z][a-z]+$/;
          if (!USERNAME_RE.test(normalized)) {
            Alert.alert('Nom invalide', "Le nom d'utilisateur doit commencer par une majuscule et ne contenir que des lettres minuscules ensuite (ex: Arnaud).");
            return;
          }
          const res = await apiUpdateProfile({ name: normalized });
          const updated = res?.user || {};
          updateUser({
            ...user,
            username: updated.name ?? normalized,
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

  const handleAddSocial = async () => {
    try {
      const platform = String(selectedSocialPlatform || '').toLowerCase();
      let handle = String(newValue || '').trim();
      if (!ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert('Erreur', 'Plateforme non supportée');
        return;
      }
      if (!handle) {
        Alert.alert('Erreur', "Veuillez saisir un identifiant");
        return;
      }
      // Specific validation for Instagram / TikTok
      if (platform === 'instagram') {
        handle = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
          Alert.alert('Erreur', "Nom d'utilisateur Instagram invalide. Exemple: https://www.instagram.com/username/");
          return;
        }
      } else if (platform === 'tiktok') {
        handle = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(handle)) {
          Alert.alert('Erreur', "Nom d'utilisateur TikTok invalide. Exemple: https://www.tiktok.com/@username");
          return;
        }
      }
      const res = await apiUpsertSocial({ type: platform, handle });
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setShowSocialModal(false);
      setSelectedSocialPlatform('');
      setNewValue('');
    } catch (e) {
      console.error('[MyAccount] Add social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || "Impossible d'ajouter le réseau social");
    }
  };

  const handleSocialLongPress = (social) => {
    setSelectedSocialLink(social);
    setNewValue(social.username);
    setSocialModalVisible(true);
  };

  const handleSocialEdit = async () => {
    try {
      const platform = selectedSocialLink?.platform;
      let handle = String(newValue || '').trim();
      if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert('Erreur', 'Plateforme non supportée');
        return;
      }
      if (!handle) {
        Alert.alert('Erreur', "Veuillez saisir un identifiant");
        return;
      }
      if (platform === 'instagram') {
        handle = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
          Alert.alert('Erreur', "Nom d'utilisateur Instagram invalide. Exemple: https://www.instagram.com/username/");
          return;
        }
      } else if (platform === 'tiktok') {
        handle = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(handle)) {
          Alert.alert('Erreur', "Nom d'utilisateur TikTok invalide. Exemple: https://www.tiktok.com/@username");
          return;
        }
      }
      const res = await apiUpsertSocial({ type: platform, handle });
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setSocialModalVisible(false);
    } catch (e) {
      console.error('[MyAccount] Edit social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || "Impossible de modifier le réseau social");
    }
  };

  const handleSocialDelete = async () => {
    try {
      const platform = selectedSocialLink?.platform;
      if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert('Erreur', 'Plateforme non supportée');
        return;
      }
      const res = await apiRemoveSocial(platform);
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setSocialModalVisible(false);
    } catch (e) {
      console.error('[MyAccount] Delete social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || "Impossible de supprimer le réseau social");
    }
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
        // Web: pick and upload as well so backend profileImageUrl stays in sync
        const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
        const canceled = result?.canceled ?? result?.cancelled;
        const uri = result?.assets?.[0]?.uri ?? result?.uri;
        if (!canceled && uri) {
          try {
            const res = await apiUploadProfilePhoto(uri);
            const updated = res?.user || {};
            updateUser({
              ...user,
              photo: updated.profileImageUrl || uri,
              username: updated.name ?? user.username,
              bio: updated.bio ?? user.bio,
            });
          } catch (e2) {
            console.error('[MyAccount] Upload photo (web) error', { code: e2?.code, message: e2?.message, status: e2?.status });
            Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
          }
        }
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

  const handleDeletePhoto = async () => {
    try {
      const { deleteProfilePhoto: apiDelete } = await import('../components/ApiRequest');
      const res = await apiDelete();
      const updated = res?.user || {};
      updateUser({
        ...user,
        photo: updated.profileImageUrl || null,
        username: updated.name ?? user.username,
        bio: updated.bio ?? user.bio,
      });
    } catch (e) {
      console.error('[MyAccount] Delete photo error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
      Alert.alert('Erreur', e?.message || "Impossible de supprimer la photo de profil");
    } finally {
      setPhotoOptionsModalVisible(false);
    }
  };

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
        <Text style={styles.title}>Mon Compte</Text>
        <View style={styles.userInfoContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.imgUsernameSplitBox}>
              <View style={styles.userProfilePictureContainer}>
                <TouchableOpacity onLongPress={handleProfileImageLongPress}>
                  {user.photo ? (
                    <Image
                      source={{ uri: user.photo }}
                      style={[styles.profileImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}
                    />
                  ) : (
                    <View style={[styles.placeholderImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}>
                      <Image
                        source={require('../assets/appIcons/userProfile.png')}
                        style={[styles.placeholderIcon, { width: placeholderIconSize, height: placeholderIconSize }]}
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
                  <Text style={[styles.usernameUnderPhoto, { fontSize: usernameFont }]}>{user.username}</Text>
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
                    { fontSize: bioFont, textAlign: 'center' },
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
                style={[styles.socialMediaIcon, { width: iconSize, height: iconSize }]}
              />
            </TouchableOpacity>
            {socialLinks.map((social, index) => {
              const icon = social?.platform ? socialMediaIcons[social.platform] : undefined;
              if (!icon) return null;
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.socialMediaTile}
                  onLongPress={() => handleSocialLongPress(social)}>
                  <Image
                    source={icon}
                    style={[styles.socialMediaIcon, { width: iconSize, height: iconSize }]}
                  />
                </TouchableOpacity>
              );
            })}
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
                placeholder={editType === 'username' ? "Nom d'utilisateur (ex: Arnaud)" : 'Votre texte'}
                placeholderTextColor="#666"
                style={[
                  styles.modalInput,
                  editType === 'bio' ? { height: Math.max(height * 0.18, 120), textAlignVertical: 'top', paddingTop: 10 } : null,
                ]}
                multiline={editType === 'bio'}
                numberOfLines={editType === 'bio' ? 6 : 1}
                blurOnSubmit={editType !== 'bio'}
                returnKeyType={editType === 'bio' ? 'default' : 'done'}
              />
              {editType === 'username' ? (
                <Text style={styles.modalHint}>Format requis: ^[A-Z][a-z]+$ (exemple: Arnaud)</Text>
              ) : null}
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
                  placeholderTextColor="#666"
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

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    borderWidth: 0,
    borderColor: 'transparent',
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
  modalHint: {
    fontSize: 12,
    color: '#666',
    alignSelf: 'flex-start',
    marginBottom: height * 0.01,
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
    width: Math.min(width * 0.14, 56),
    height: Math.min(width * 0.14, 56),
    borderRadius: Math.min(width * 0.07, 28),
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: Math.max(height * 0.02, 16),
    right: Math.max(width * 0.05, 16) + Math.min(width * 0.14, 56) + Math.max(width * 0.03, 12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  settingsButton: {
    backgroundColor: '#00c2cb',
    width: Math.min(width * 0.14, 56),
    height: Math.min(width * 0.14, 56),
    borderRadius: Math.min(width * 0.07, 28),
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: Math.max(height * 0.02, 16),
    right: Math.max(width * 0.05, 16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  dataButton: {
    backgroundColor: '#00c2cb',
    height: Math.min(width * 0.14, 56),
    borderRadius: Math.min(width * 0.07, 28),
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: Math.max(height * 0.02, 16),
    left: Math.max(width * 0.05, 16),
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  dataButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  roundButtonImage: {
    width: Math.min(Math.min(width * 0.14, 56) * 0.55, 28),
    height: Math.min(Math.min(width * 0.14, 56) * 0.55, 28),
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

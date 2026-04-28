import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Image,
  Dimensions,
  PanResponder,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';

const { width, height } = Dimensions.get('window');

import { UserContext } from '../components/contexts/UserContext';
import {
  setVisibility as apiSetVisibility,
  getPrivacyPolicy,
  updateConsent,
  exportMyData,
  deleteMyAccount,
} from '../components/ApiRequest';
import { startBackgroundLocationForOneHour, stopBackgroundLocation } from '../components/BackgroundLocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../components/contexts/ThemeContext';

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

const SettingsScreen = ({ onReturnToAccount, onLogout, onOpenDebug, onOpenModerator }) => {
  const { user, updateUser } = useContext(UserContext);
  const { mode: themeMode, setMode: setThemeMode, colors } = useTheme();
  const isDark = themeMode === 'dark';
  const [saving, setSaving] = useState(false);
  const [displayNameMode, setDisplayNameMode] = useState('full');

  // GDPR state
  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyText, setPolicyText] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(!!user?.consent?.accepted);
  const [consentVersion, setConsentVersion] = useState(user?.consent?.version || 'v1');
  const [analytics, setAnalytics] = useState(!!user?.privacyPreferences?.analytics);
  const [marketing, setMarketing] = useState(!!user?.privacyPreferences?.marketing);
  const [doNotSell, setDoNotSell] = useState(!!user?.privacyPreferences?.doNotSell);

  // Revocation (delete account) modal state
  const [revokeVisible, setRevokeVisible] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeWorking, setRevokeWorking] = useState(false);

  useEffect(() => {
    // Hydrate GDPR toggles from user when context changes
    try {
      setConsentAccepted(!!user?.consent?.accepted);
      setConsentVersion(user?.consent?.version || 'v1');
      setAnalytics(!!user?.privacyPreferences?.analytics);
      setMarketing(!!user?.privacyPreferences?.marketing);
      setDoNotSell(!!user?.privacyPreferences?.doNotSell);
    } catch (_) {}
  }, [user]);

  // Charger préférence d'affichage du nom
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISPLAY_NAME_PREF_KEY);
        if (v === 'custom' || v === 'full') setDisplayNameMode(v);
      } catch (_) {}
    })();
  }, []);

  const toggleDisplayNameMode = async () => {
    try {
      const next = displayNameMode === 'full' ? 'custom' : 'full';
      setDisplayNameMode(next);
      await AsyncStorage.setItem(DISPLAY_NAME_PREF_KEY, next);
    } catch (_) {}
  };

  const saveAndReturn = async () => {
    onReturnToAccount && onReturnToAccount();
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 50 || vx > 0.3) {
        saveAndReturn();
      }
    },
  });

  const openPolicy = async () => {
    try {
      setPolicyLoading(true);
      setPolicyModalVisible(true);
      const res = await getPrivacyPolicy();
      const text = typeof res === 'string' ? res : (res?.policy || res?.text || JSON.stringify(res, null, 2));
      setPolicyText(text);
    } catch (e) {
      setPolicyText('Impossible de charger la politique de confidentialité.');
    } finally {
      setPolicyLoading(false);
    }
  };

  const persistConsentQuietly = async ({ accepted, analytics: analyticsValue, marketing: marketingValue, doNotSell: doNotSellValue }) => {
    try {
      const res = await updateConsent({ accepted, version: consentVersion, analytics: analyticsValue, marketing: marketingValue, doNotSell: doNotSellValue });
      const updatedUser = res?.user ? res.user : {
        ...user,
        consent: { accepted, version: consentVersion, consentAt: accepted ? new Date().toISOString() : user?.consent?.consentAt || null },
        privacyPreferences: { analytics: analyticsValue, marketing: marketingValue, doNotSell: doNotSellValue },
      };
      if (updateUser) {
        updateUser({
          ...user,
          username: user?.username || updatedUser.name || '',
          bio: user?.bio ?? updatedUser.bio ?? '',
          photo: user?.photo ?? updatedUser.profileImageUrl ?? null,
          socialMedia: user?.socialMedia ?? (Array.isArray(updatedUser.socialNetworks) ? updatedUser.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : []),
          consent: updatedUser.consent || { accepted, version: consentVersion },
          privacyPreferences: updatedUser.privacyPreferences || { analytics: analyticsValue, marketing: marketingValue, doNotSell: doNotSellValue },
        });
      }
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'enregistrer vos préférences de confidentialité");
    }
  };

  const handleToggleConsent = async (v) => {
    // If user tries to uncheck consent, trigger the revoke (account deletion) flow instead
    if (v === false) {
      // Immediately revert the UI toggle; actual deletion flow will log the user out if confirmed
      setConsentAccepted(true);
      handleRevokePress();
      return;
    }
    // If checking consent on, just persist quietly
    setConsentAccepted(true);
    await persistConsentQuietly({ accepted: true, analytics, marketing, doNotSell });
  };

  const handleToggleAnalytics = async (v) => {
    setAnalytics(v);
    await persistConsentQuietly({ accepted: consentAccepted, analytics: v, marketing, doNotSell });
  };

  const handleToggleMarketing = async (v) => {
    setMarketing(v);
    await persistConsentQuietly({ accepted: consentAccepted, analytics, marketing: v, doNotSell });
  };

  const handleToggleDoNotSell = async (v) => {
    setDoNotSell(v);
    await persistConsentQuietly({ accepted: consentAccepted, analytics, marketing, doNotSell: v });
  };

  const saveConsent = async (accepted) => {
    try {
      const res = await updateConsent({ accepted, version: consentVersion, analytics, marketing, doNotSell });
      const updatedUser = res?.user ? res.user : {
        ...user,
        consent: { accepted, version: consentVersion, consentAt: accepted ? new Date().toISOString() : user?.consent?.consentAt || null },
        privacyPreferences: { analytics, marketing, doNotSell },
      };
      if (updateUser) {
        updateUser({
          ...user,
          username: user?.username || updatedUser.name || '',
          bio: user?.bio ?? updatedUser.bio ?? '',
          photo: user?.photo ?? updatedUser.profileImageUrl ?? null,
          socialMedia: user?.socialMedia ?? (Array.isArray(updatedUser.socialNetworks) ? updatedUser.socialNetworks.map((s) => ({ platform: s.type, username: s.handle })) : []),
          consent: updatedUser.consent || { accepted, version: consentVersion },
          privacyPreferences: updatedUser.privacyPreferences || { analytics, marketing, doNotSell },
        });
      }
      setConsentAccepted(accepted);
      Alert.alert('Succès', accepted ? 'Consentement enregistré.' : 'Consentement révoqué.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'enregistrer le consentement");
    }
  };

  const handleRevokePress = () => {
    Alert.alert(
      'Révocation du consentement',
      'Révoquer votre consentement entraînera la suppression définitive de votre compte et de toutes vos données. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: () => setRevokeVisible(true) },
      ]
    );
  };

  const performRevokeDelete = async () => {
    if (!revokePassword || revokePassword.length < 6) {
      Alert.alert('Mot de passe requis', 'Merci de saisir votre mot de passe.');
      return;
    }
    try {
      setRevokeWorking(true);
      await deleteMyAccount({ password: revokePassword });
      setRevokeVisible(false);
      setRevokePassword('');
      onLogout && onLogout();
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Suppression impossible. Mot de passe invalide ou problème serveur.');
    } finally {
      setRevokeWorking(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportMyData();
      // For simplicity, just show a success and a snippet length; in a real app, save to file/share
      const size = JSON.stringify(data)?.length || 0;
      Alert.alert('Export prêt', `Vos données ont été exportées (${size} caractères).`);
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'exporter vos données");
    }
  };

  const handleDelete = async () => {
    try {
      Alert.alert(
        'Supprimer le compte',
        'La suppression est définitive. Confirmez-vous la suppression de votre compte ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer', style: 'destructive', onPress: () => {
              // Open the revoke modal to let user enter their password, then perform delete
              setRevokePassword('');
              setRevokeVisible(true);
            }
          }
        ]
      );
    } catch (_) {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(0,194,203,0.2)' : 'rgba(0,194,203,0.1)' }]}
          onPress={saveAndReturn}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={styles.backButtonImage}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Paramètres</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.sectionTitle}>GÉNÉRAL</Text>

          <View style={[styles.optionContainer, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>Mode d'affichage</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{displayNameMode === 'full' ? 'Prénom Nom' : 'Nom personnalisé'}</Text>
            </View>
            <TouchableOpacity onPress={toggleDisplayNameMode} style={[styles.smallPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.smallPillText, { color: colors.textPrimary }]}>{displayNameMode === 'full' ? 'Classique' : 'Custom'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.sectionTitle}>APPARENCE</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
            <TouchableOpacity onPress={() => setThemeMode('light')} style={[styles.themePill, themeMode === 'light' && { backgroundColor: '#00c2cb' }]}>
              <Text style={[styles.themePillText, { color: themeMode === 'light' ? '#fff' : colors.textSecondary }]}>Clair</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setThemeMode('dark')} style={[styles.themePill, themeMode === 'dark' && { backgroundColor: '#00c2cb' }]}>
              <Text style={[styles.themePillText, { color: themeMode === 'dark' ? '#fff' : colors.textSecondary }]}>Sombre</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setThemeMode('system')} style={[styles.themePill, themeMode === 'system' && { backgroundColor: '#00c2cb' }]}>
              <Text style={[styles.themePillText, { color: themeMode === 'system' ? '#fff' : colors.textSecondary }]}>Auto</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.sectionTitle}>CONFIDENTIALITÉ & RGPD</Text>
          <TouchableOpacity style={[styles.linkRow, { borderBottomColor: colors.border }]} onPress={openPolicy}>
            <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Politique de confidentialité</Text>
          </TouchableOpacity>

          <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Consentement</Text>
            <Switch
              value={consentAccepted}
              onValueChange={handleToggleConsent}
              trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
              thumbColor={consentAccepted ? '#fff' : '#f4f3f4'}
            />
          </View>
          <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Analytics</Text>
            <Switch
              value={analytics}
              onValueChange={handleToggleAnalytics}
              trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
              thumbColor={analytics ? '#fff' : '#f4f3f4'}
            />
          </View>
          <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Marketing</Text>
            <Switch
              value={marketing}
              onValueChange={handleToggleMarketing}
              trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
              thumbColor={marketing ? '#fff' : '#f4f3f4'}
            />
          </View>
          <View style={[styles.optionContainer, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>Vente de données (CCPA)</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Ne pas vendre mes informations personnelles</Text>
            </View>
            <Switch
              value={doNotSell}
              onValueChange={handleToggleDoNotSell}
              trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
              thumbColor={doNotSell ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {['admin', 'moderator'].includes(user?.role) && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={styles.sectionTitle}>MODÉRATION</Text>
            <TouchableOpacity style={[styles.linkRow, { borderBottomColor: colors.border }]} onPress={onOpenModerator}>
              <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Signalements</Text>
            </TouchableOpacity>
            {user?.role === 'admin' && (
              <TouchableOpacity style={[styles.linkRow, { borderBottomWidth: 0 }]} onPress={onOpenDebug}>
                <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Debug Console</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ gap: 12, marginTop: 20 }}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.surface }]} onPress={handleExport}>
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Exporter mes données</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: isDark ? 'rgba(255,77,77,0.1)' : '#ffe6e6' }]} onPress={handleDelete}>
            <Text style={[styles.actionButtonText, { color: '#ff4d4d' }]}>Supprimer mon compte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: '#ff4d4d' }]}
            onPress={async () => { try { await (onLogout && onLogout()); } catch(_) {} }}
          >
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginTop: 30, marginBottom: 20 }}>
          LoocateMe v1.0.0 (39)
        </Text>
      </ScrollView>

      <Modal visible={policyModalVisible} animationType="slide" onRequestClose={() => setPolicyModalVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }] }>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setPolicyModalVisible(false)}>
              <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Fermer</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confidentialité</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalContent}>
            {policyLoading ? (
              <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.policyText, { color: colors.textSecondary }]}>{policyText}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Revocation (Delete Account) Modal */}
      <Modal transparent visible={revokeVisible} animationType="fade" onRequestClose={() => setRevokeVisible(false)}>
        <View style={[styles.revokeBackdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
          <View style={[styles.revokeCard, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <Text style={[styles.revokeTitle, { color: colors.textPrimary }]}>Suppression du compte</Text>
            <Text style={[styles.revokeDesc, { color: isDark ? '#fff' : colors.textSecondary }]}>Pour confirmer, entrez votre mot de passe. Cette action est irréversible.</Text>
            <TextInput
              style={[styles.revokeInput, { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' }]}
              placeholder="Mot de passe"
              placeholderTextColor={isDark ? '#999' : '#666'}
              secureTextEntry
              value={revokePassword}
              onChangeText={setRevokePassword}
            />
            <View style={styles.revokeButtons}>
              <TouchableOpacity style={[styles.primaryButton, styles.secondaryButton]} onPress={() => setRevokeVisible(false)} disabled={revokeWorking}>
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, styles.dangerButton]} onPress={performRevokeDelete} disabled={revokeWorking}>
                <Text style={styles.dangerButtonText}>{revokeWorking ? 'Suppression...' : 'Supprimer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 25,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  content: {
    padding: 20,
    paddingBottom: height * 0.1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonImage: {
    width: 24,
    height: 24,
    tintColor: '#00c2cb',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00c2cb',
    marginBottom: 15,
    letterSpacing: 1.5,
  },
  optionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  smallPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  smallPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  themePill: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,194,203,0.05)',
  },
  themePillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  linkRowText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  actionButtonText: {
    fontWeight: '700',
    fontSize: 16,
  },
  logoutButton: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#ff4d4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  logoutText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  modalCloseButton: {
    width: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  policyText: {
    fontSize: 15,
    lineHeight: 24,
  },
  revokeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  revokeCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  revokeTitle: {
    fontSize: width * 0.06,
    fontWeight: '700',
    color: '#ff4d4d',
    textAlign: 'center',
    marginBottom: 8,
  },
  revokeDesc: {
    fontSize: width * 0.04,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.8,
  },
  revokeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: '#f8f9fa',
  },
  revokeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
});

export default SettingsScreen;

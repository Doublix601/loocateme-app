import React, { useRef, useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, TextInput, Switch } from 'react-native';
import Constants from 'expo-constants';
import { getAllUsers, setUserPremium, searchUsers, invalidateApiCacheByPrefix, sendAdminPush, registerPushToken, getAdminFlags, setFeatureFlag, setUserRole } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { sendLocalNotification } from '../components/notifications';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { UserContext } from '../components/contexts/UserContext';

const DebugScreen = ({ onBack }) => {
  const { refresh: refreshFlags } = useFeatureFlags();
  const { user: currentUser } = useContext(UserContext);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [users, setUsers] = useState([]);
  // Feature flags state
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState(null);
  // Formulaire push
  const [pushTitle, setPushTitle] = useState('Test push');
  const [pushBody, setPushBody] = useState('Ceci est un test');
  const [pushDeepLink, setPushDeepLink] = useState('');
  const [pushTokens, setPushTokens] = useState(''); // CSV
  const [pushUserIds, setPushUserIds] = useState(''); // CSV
  const [pushData, setPushData] = useState(''); // JSON facultatif
  const [pushImageUrl, setPushImageUrl] = useState('');
  const [pushSound, setPushSound] = useState('default');
  const [pushBadge, setPushBadge] = useState('');
  const [pushChannelId, setPushChannelId] = useState('default');
  const [pushPriority, setPushPriority] = useState('high'); // 'high' | 'normal'
  const [pushCollapseKey, setPushCollapseKey] = useState('');
  const [pushMutable, setPushMutable] = useState(false);
  const [pushContentAvail, setPushContentAvail] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);
  const [pushResponse, setPushResponse] = useState(null);
  const [currentPushToken, setCurrentPushToken] = useState('Chargement...');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('expo-notifications');
        const Notifications = mod?.default ?? mod;
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        setCurrentPushToken(res?.data || res?.token || String(res));
      } catch (e) {
        setCurrentPushToken('Erreur: ' + e.message);
      }
    })();
  }, []);

  const onForceRegister = async () => {
    try {
      setRegistering(true);
      const mod = await import('expo-notifications');
      const Notifications = mod?.default ?? mod;
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
      const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      const token = res?.data || res?.token || String(res);
      setCurrentPushToken(token);
      await registerPushToken({ token, platform: Platform.OS });
      Alert.alert('Succès', 'Token envoyé au serveur');
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setRegistering(false);
    }
  };
  // Local notifications (expo-notifications)
  const [locTitle, setLocTitle] = useState('Notif locale');
  const [locBody, setLocBody] = useState('Ceci est une notification locale');
  const [locDeepLink, setLocDeepLink] = useState('');
  const [locDelaySec, setLocDelaySec] = useState('0');
  const [sendingLocal, setSendingLocal] = useState(false);
  const notificationsRef = useRef(null);
  const localNotifSetupRef = useRef(false);
  // Recherche utilisateur
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const debRef = useRef(null);

  const runAllApiUsers = async () => {
    try {
      setLoading(true);
      setResult(null);
      const res = await getAllUsers({ page: 1, limit: 100 });
      setResult(res);
      setUsers(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      console.error('[DebugScreen] All API users error', e);
      Alert.alert('Erreur', e?.message || 'Impossible de récupérer les utilisateurs.');
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = async (userId, isPremium) => {
    try {
      setLoading(true);
      await setUserPremium(userId, isPremium);
      // Optimistic update
      setUsers((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, isPremium } : u)));
      setResults((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, isPremium } : u)));
      setSelectedUser((prev) => (prev && String(prev._id || prev.id) === String(userId) ? { ...prev, isPremium } : prev));
      // Invalidate admin cache to avoid stale data and refetch
      try { invalidateApiCacheByPrefix('/api/admin'); } catch (_) {}
      try { await runAllApiUsers(); } catch (_) {}
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de changer le rôle.');
    } finally {
      setLoading(false);
    }
  };

  // Réagir au signal global de reload UI pour rafraîchir les listes (utile si on modifie son propre plan)
  useEffect(() => {
    const off = subscribe('ui:reload', () => {
      try { runAllApiUsers(); } catch (_) {}
    });
    return () => { try { off && off(); } catch (_) {} };
  }, []);

  // Charger systématiquement des données fraîches à l'ouverture de l'écran
  useEffect(() => {
    try { runAllApiUsers(); } catch (_) {}
    try { loadFlags(); } catch (_) {}
  }, []);

  // Load feature flags from admin endpoint
  const loadFlags = async () => {
    try {
      setFlagsLoading(true);
      setFlagsError(null);
      const res = await getAdminFlags();
      setFlags(Array.isArray(res?.flags) ? res.flags : []);
    } catch (e) {
      console.error('[DebugScreen] Load flags error', e);
      setFlagsError(e?.message || 'Impossible de charger les flags');
    } finally {
      setFlagsLoading(false);
    }
  };

  // Toggle a feature flag
  const toggleFlag = async (key, currentValue) => {
    try {
      setFlagsLoading(true);
      await setFeatureFlag(key, !currentValue);
      // Refresh flags list
      await loadFlags();
      // Refresh global context so all screens get updated
      refreshFlags();
      Alert.alert('Succès', `Flag "${key}" mis à jour`);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de modifier le flag');
    } finally {
      setFlagsLoading(false);
    }
  };

  // Change user role (admin/moderator/user)
  const changeUserRole = async (userId, role) => {
    try {
      setLoading(true);
      await setUserRole(userId, role);
      // Optimistic update
      setUsers((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, role } : u)));
      setResults((prev) => prev.map((u) => (String(u._id) === String(userId) ? { ...u, role } : u)));
      setSelectedUser((prev) => (prev && String(prev._id || prev.id) === String(userId) ? { ...prev, role } : prev));
      // Invalidate admin cache and refetch
      try { invalidateApiCacheByPrefix('/api/admin'); } catch (_) {}
      try { await runAllApiUsers(); } catch (_) {}
      Alert.alert('Succès', `Rôle mis à jour: ${role}`);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de changer le rôle.');
    } finally {
      setLoading(false);
    }
  };

  // Recherche avec debounce
  useEffect(() => {
    const q = String(query || '').trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (!q) { setResults([]); setSearching(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await searchUsers({ q, limit: 10 });
        const list = Array.isArray(res?.users) ? res.users : [];
        setResults(list);
      } catch (_e) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  async function ensureLocalNotifSetup() {
    if (localNotifSetupRef.current && notificationsRef.current) return true;
    try {
      const mod = await import('expo-notifications');
      // Support both ESM and CommonJS interop just in case
      const Notifications = mod?.default ?? mod;
      // Always show alert in foreground (for testing)
      try {
        Notifications.setNotificationHandler?.({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      } catch (_) {}
      // Android channel
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance?.HIGH || 4,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
          });
        } catch (_) {}
      }
      notificationsRef.current = Notifications;
      localNotifSetupRef.current = true;
      return true;
    } catch (e) {
      Alert.alert(
        'Module manquant',
        "Le module 'expo-notifications' n'est pas installé. Exécute: npx expo install expo-notifications"
      );
      return false;
    }
  }

  const onSendLocalNotification = async () => {
    try {
      setSendingLocal(true);

      // 1. Vérification initiale
      const ok = await ensureLocalNotifSetup();
      if (!ok) return;

      // 2. Préparation du contenu
      const content = {
        title: locTitle?.trim() || 'LoocateMe',
        body: locBody?.trim() || 'Ceci est un test de notification',
        data: locDeepLink?.trim() ? { deepLink: locDeepLink.trim() } : {},
      };

      const delay = Math.max(0, parseInt(String(locDelaySec || '0'), 10));

      // 3. Logique par plateforme
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          await sendLocalNotification(content, { delaySeconds: delay });

          const msg = delay > 0
              ? `Notification programmée dans ${delay}s`
              : 'Notification affichée immédiatement';
          Alert.alert('Succès', msg);

        } catch (err) {
          console.error("Détails erreur native:", err);
          Alert.alert('Erreur Native', err.message);
        }
      }
      else if (Platform.OS === 'web') {
        // Fallback Web
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (window.Notification.permission !== 'granted') {
            await window.Notification.requestPermission();
          }

          const deliverWeb = () => {
            if (window.Notification.permission === 'granted') {
              new window.Notification(content.title, { body: content.body });
            }
          };

          if (delay > 0) {
            setTimeout(deliverWeb, delay * 1000);
            Alert.alert('Web', `Programmé dans ${delay}s`);
          } else {
            deliverWeb();
          }
        } else {
          Alert.alert('Non supporté', "Notifications non disponibles sur ce navigateur.");
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', e?.message || "Une erreur inconnue est survenue");
    } finally {
      setSendingLocal(false);
    }
  };

  const onSendPush = async () => {
    try {
      setSendingPush(true);
      setPushResponse(null);
      let extra = {};
      if (pushData && pushData.trim()) {
        try { extra = JSON.parse(pushData); } catch (_) { extra = {}; }
      }
      if (pushDeepLink && pushDeepLink.trim()) {
        extra = { ...extra, deepLink: pushDeepLink.trim() };
      }
      const body = {
        title: pushTitle || undefined,
        body: pushBody || undefined,
        userIds: pushUserIds,
        tokens: pushTokens,
        data: extra,
        imageUrl: pushImageUrl || undefined,
        sound: pushSound || undefined,
        badge: pushBadge ? Number(pushBadge) : undefined,
        androidChannelId: pushChannelId || undefined,
        priority: pushPriority === 'normal' ? 'normal' : 'high',
        collapseKey: pushCollapseKey || undefined,
        mutableContent: !!pushMutable,
        contentAvailable: !!pushContentAvail,
      };
      const res = await sendAdminPush(body);
      setPushResponse(res);
      Alert.alert('Push envoyé', 'La requête a été envoyée au backend.');
    } catch (e) {
      Alert.alert('Erreur push', e?.message || 'Envoi impossible');
    } finally {
      setSendingPush(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>{'< Retour'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Debug</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Feature Flags Section */}
        <Text style={styles.sectionTitle}>Feature Flags (Global)</Text>
        <View style={styles.card}>
          {flagsLoading ? (
            <ActivityIndicator size="small" color="#00c2cb" />
          ) : flagsError ? (
            <Text style={{ color: '#f66' }}>{flagsError}</Text>
          ) : flags.length === 0 ? (
            <Text style={{ color: '#9ab' }}>Aucun flag configuré</Text>
          ) : (
            flags.map((f) => (
              <View key={f.key} style={styles.flagRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flagKey}>{f.key}</Text>
                  {f.description ? <Text style={styles.flagDesc}>{f.description}</Text> : null}
                </View>
                <Switch
                  value={!!f.enabled}
                  onValueChange={() => toggleFlag(f.key, f.enabled)}
                  trackColor={{ false: '#3e3e3e', true: '#00c2cb' }}
                  thumbColor={f.enabled ? '#fff' : '#f4f3f4'}
                />
              </View>
            ))
          )}
          <TouchableOpacity style={[styles.cmdBtn, { marginTop: 12 }]} onPress={loadFlags} disabled={flagsLoading}>
            <Text style={styles.cmdTxt}>Rafraîchir les flags</Text>
          </TouchableOpacity>
        </View>

        {/* Test notifications locales */}
        <Text style={styles.sectionTitle}>Test notifications locales</Text>
        <View style={styles.card}>
          <LabeledInput label="Titre" value={locTitle} onChangeText={setLocTitle} placeholder="Titre" />
          <LabeledInput label="Message" value={locBody} onChangeText={setLocBody} placeholder="Texte de la notification" />
          <LabeledInput label="Deep link" value={locDeepLink} onChangeText={setLocDeepLink} placeholder="ex: loocate://home" />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: 140 }}>
              <LabeledInput label="Délai (s)" value={String(locDelaySec)} onChangeText={setLocDelaySec} placeholder="0" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }} />
          </View>
          <TouchableOpacity style={[styles.cmdBtn, sendingLocal ? styles.btnDisabled : null]} onPress={onSendLocalNotification} disabled={sendingLocal}>
            <Text style={styles.cmdTxt}>
              {sendingLocal
                ? 'Envoi…'
                : (parseInt(String(locDelaySec || '0'), 10) > 0
                  ? `Programmer dans ${parseInt(String(locDelaySec || '0'), 10)}s`
                  : 'Afficher maintenant')}
            </Text>
          </TouchableOpacity>
        </View>
        {/* Test notifications */}
        <Text style={styles.sectionTitle}>Expo Push Token</Text>
        <View style={styles.card}>
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Token actuel :</Text>
          <TextInput
            style={[styles.input, { height: 'auto', minHeight: 40, fontSize: 11 }]}
            value={currentPushToken}
            multiline
            editable={false}
          />
          <TouchableOpacity
            style={[styles.cmdBtn, registering ? styles.btnDisabled : null, { marginTop: 10, backgroundColor: '#4a90e2' }]}
            onPress={onForceRegister}
            disabled={registering}
          >
            <ActivityIndicator animating={registering} size="small" color="#fff" style={{ position: 'absolute', left: 15 }} />
            <Text style={styles.cmdTxt}>Forcer l'envoi au serveur</Text>
          </TouchableOpacity>
        </View>

        {/* Test notifications */}
        <Text style={styles.sectionTitle}>Test notifications (push)</Text>
        <View style={styles.card}>
          <LabeledInput label="Titre" value={pushTitle} onChangeText={setPushTitle} placeholder="Titre" />
          <LabeledInput label="Message" value={pushBody} onChangeText={setPushBody} placeholder="Texte du push" />
          <LabeledInput label="Deep link" value={pushDeepLink} onChangeText={setPushDeepLink} placeholder="ex: loocate://home" />
          <LabeledInput label="Tokens (CSV)" value={pushTokens} onChangeText={setPushTokens} placeholder="token1,token2" />
          <LabeledInput label="User IDs (CSV)" value={pushUserIds} onChangeText={setPushUserIds} placeholder="id1,id2" />
          <LabeledInput label="Image URL" value={pushImageUrl} onChangeText={setPushImageUrl} placeholder="https://..." />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <LabeledInput label="Son" value={pushSound} onChangeText={setPushSound} placeholder="default" />
            </View>
            <View style={{ width: 120 }}>
              <LabeledInput label="Badge (iOS)" value={String(pushBadge)} onChangeText={setPushBadge} placeholder="ex: 1" keyboardType="numeric" />
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <LabeledInput label="Channel (Android)" value={pushChannelId} onChangeText={setPushChannelId} placeholder="default" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Priorité" value={pushPriority} onChangeText={setPushPriority} placeholder="high|normal" />
            </View>
          </View>
          <LabeledInput label="Collapse key" value={pushCollapseKey} onChangeText={setPushCollapseKey} placeholder="clé de regroupement" />
          <LabeledTextArea label="Data JSON (optionnel)" value={pushData} onChangeText={setPushData} placeholder='{"kind":"demo"}' />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <TouchableOpacity onPress={() => setPushMutable(v => !v)} style={[styles.smallBtn, styles.toggleBtn, pushMutable ? styles.toggleOn : styles.toggleOff]}>
              <Text style={styles.smallBtnTxt}>mutable-content: {pushMutable ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPushContentAvail(v => !v)} style={[styles.smallBtn, styles.toggleBtn, pushContentAvail ? styles.toggleOn : styles.toggleOff]}>
              <Text style={styles.smallBtnTxt}>content-available: {pushContentAvail ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.cmdBtn, sendingPush ? styles.btnDisabled : null]} onPress={onSendPush} disabled={sendingPush}>
            <Text style={styles.cmdTxt}>{sendingPush ? 'Envoi…' : 'Envoyer la notification'}</Text>
          </TouchableOpacity>
          {pushResponse && (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Réponse envoi</Text>
              <Text selectable style={styles.resultText}>{JSON.stringify(pushResponse, null, 2)}</Text>
            </View>
          )}
        </View>
        {/* Recherche utilisateur */}
        <Text style={styles.sectionTitle}>Recherche utilisateur (debug)</Text>
        <View style={styles.searchBar}>
          <Text style={{ color: '#cde', marginRight: 8 }}>🔎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nom, prénom, username..."
            placeholderTextColor="#7a8a99"
            style={styles.input}
          />
        </View>
        {searching ? (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 8 }} />
        ) : (
          results.length > 0 && (
            <View style={styles.resultsBox}>
              {results.map((u) => (
                <TouchableOpacity key={String(u._id || u.id)} style={styles.resultRow} onPress={() => setSelectedUser(u)}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {(u.username || u.customName || u.firstName || u.email || 'Utilisateur')}
                  </Text>
                  <Text style={[styles.badge, u.isPremium ? styles.badgePrem : styles.badgeFree]}>
                    {u.isPremium ? 'Premium' : 'Free'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {selectedUser && (
          <View style={styles.selectedBox}>
            <Text style={styles.selectedTitle}>Utilisateur sélectionné</Text>
            <Text style={styles.selectedName} numberOfLines={1}>
              {(selectedUser.username || selectedUser.customName || selectedUser.firstName || selectedUser.email || 'Utilisateur')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <Text style={[styles.badge, selectedUser.isPremium ? styles.badgePrem : styles.badgeFree]}>
                {selectedUser.isPremium ? 'Premium' : 'Free'}
              </Text>
              <TouchableOpacity style={[styles.smallBtn, styles.btnPrem, { marginLeft: 8 }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, true)}>
                <Text style={styles.smallBtnTxt}>Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.btnFree, { marginLeft: 8 }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, false)}>
                <Text style={styles.smallBtnTxt}>Free</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <Text style={[styles.badge, selectedUser.role === 'admin' ? styles.badgeAdmin : selectedUser.role === 'moderator' ? styles.badgeMod : styles.badgeUser]}>
                {selectedUser.role || 'user'}
              </Text>
              <TouchableOpacity style={[styles.smallBtn, styles.btnAdmin, { marginLeft: 8 }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'admin')}>
                <Text style={styles.smallBtnTxt}>Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.btnMod, { marginLeft: 8 }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'moderator')}>
                <Text style={styles.smallBtnTxt}>Mod</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.btnUser, { marginLeft: 8 }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'user')}>
                <Text style={styles.smallBtnTxt}>User</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Commandes</Text>
        <TouchableOpacity style={styles.cmdBtn} onPress={runAllApiUsers} disabled={loading}>
          <Text style={styles.cmdTxt}>All API users</Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator size="small" color="#00c2cb" />
          </View>
        )}

        {/* Liste des utilisateurs avec actions Premium/Free */}
        {users.length > 0 && (
          <View style={styles.usersBox}>
            {users.map((u) => (
              <View key={String(u._id || u.id)} style={styles.userRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u.username || u.customName || u.firstName || u.email || 'Utilisateur'}
                </Text>
                <Text style={[styles.badge, u.isPremium ? styles.badgePrem : styles.badgeFree]}>
                  {u.isPremium ? 'Premium' : 'Free'}
                </Text>
                <TouchableOpacity style={[styles.smallBtn, styles.btnPrem]}
                                  onPress={() => togglePremium(u._id || u.id, true)}>
                  <Text style={styles.smallBtnTxt}>Premium</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, styles.btnFree]}
                                  onPress={() => togglePremium(u._id || u.id, false)}>
                  <Text style={styles.smallBtnTxt}>Free</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Résultat</Text>
            {typeof result.total !== 'undefined' && (
              <Text style={styles.resultMeta}>Total: {String(result.total)}</Text>
            )}
            <Text selectable style={styles.resultText}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1014' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2a34' },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  backTxt: { color: '#9ab', fontSize: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  content: { padding: 16 },
  sectionTitle: { color: '#cde', fontSize: 16, marginBottom: 8 },
  card: { backgroundColor: '#0f1418', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1e2d39', marginBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#1e2d39', backgroundColor: '#0f1418', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, color: '#cde', fontSize: 16 },
  resultsBox: { backgroundColor: '#0f1418', borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#1e2d39' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#14212b' },
  resultName: { color: '#cde', flex: 1, marginRight: 8 },
  selectedBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1e2d39', marginTop: 8 },
  selectedTitle: { color: '#9ab', marginBottom: 4, fontWeight: '600' },
  selectedName: { color: '#cde', fontSize: 16 },
  cmdBtn: { backgroundColor: '#14212b', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1e2d39' },
  cmdTxt: { color: '#fff', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  resultBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1e2d39', marginTop: 12 },
  resultTitle: { color: '#9ab', marginBottom: 4, fontWeight: '600' },
  resultMeta: { color: '#9ab', marginBottom: 8 },
  resultText: { color: '#cde', fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  usersBox: { backgroundColor: '#0f1418', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#1e2d39', marginTop: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  userName: { color: '#cde', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8, fontSize: 12 },
  badgePrem: { backgroundColor: '#2d4', color: '#041' },
  badgeFree: { backgroundColor: '#246', color: '#cde' },
  smallBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, marginLeft: 6 },
  btnPrem: { backgroundColor: '#1e7f3b' },
  btnFree: { backgroundColor: '#7f1e1e' },
  smallBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  toggleBtn: { borderWidth: 1, borderColor: '#1e2d39', marginRight: 8 },
  toggleOn: { backgroundColor: '#1d2f24' },
  toggleOff: { backgroundColor: '#2f1d1d' },
  // Feature flags styles
  flagRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e2d39' },
  flagKey: { color: '#cde', fontSize: 16, fontWeight: '600' },
  flagDesc: { color: '#7a8a99', fontSize: 12, marginTop: 2 },
  // Role badges
  badgeAdmin: { backgroundColor: '#e74c3c', color: '#fff' },
  badgeMod: { backgroundColor: '#9b59b6', color: '#fff' },
  badgeUser: { backgroundColor: '#3498db', color: '#fff' },
  btnAdmin: { backgroundColor: '#c0392b' },
  btnMod: { backgroundColor: '#8e44ad' },
  btnUser: { backgroundColor: '#2980b9' },
});

// Entrées réutilisables
const LabeledInput = ({ label, ...props }) => (
  <View style={{ marginBottom: 8 }}>
    <Text style={{ color: '#9ab', marginBottom: 4 }}>{label}</Text>
    <TextInput {...props} style={[{ borderWidth: 1, borderColor: '#1e2d39', backgroundColor: '#0f1418', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#cde', fontSize: 16 }]} placeholderTextColor="#7a8a99" />
  </View>
);

const LabeledTextArea = ({ label, ...props }) => (
  <View style={{ marginBottom: 8 }}>
    <Text style={{ color: '#9ab', marginBottom: 4 }}>{label}</Text>
    <TextInput {...props} multiline numberOfLines={4} style={[{ minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#1e2d39', backgroundColor: '#0f1418', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#cde', fontSize: 16 }]} placeholderTextColor="#7a8a99" />
  </View>
);

export default DebugScreen;

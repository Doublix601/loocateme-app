import React, { useRef, useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, TextInput, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { getAllUsers, setUserPremium, searchUsers, invalidateApiCacheByPrefix, sendAdminPush, registerPushToken, getAdminFlags, setFeatureFlag, setUserRole, unbanUser } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { sendLocalNotification } from '../components/notifications';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { UserContext } from '../components/contexts/UserContext';
import { useLocale } from '../components/contexts/LocalizationContext';

import { useTheme } from '../components/contexts/ThemeContext';

const DebugScreen = ({ onBack }) => {
  const { colors, isDark } = useTheme();
  const { refresh: refreshFlags } = useFeatureFlags();
  const { locale } = useLocale();
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
      refreshFlags({ force: true });
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

  const handleUnban = async (userId) => {
    try {
      setLoading(true);
      await unbanUser(userId);
      setUsers((prev) => prev.map((u) => (String(u._id) === String(userId) ? {
        ...u,
        moderation: { ...(u.moderation || {}), bannedUntil: null, bannedPermanent: false, bannedAt: null, bannedBy: null, banReason: '' },
      } : u)));
      setResults((prev) => prev.map((u) => (String(u._id) === String(userId) ? {
        ...u,
        moderation: { ...(u.moderation || {}), bannedUntil: null, bannedPermanent: false, bannedAt: null, bannedBy: null, banReason: '' },
      } : u)));
      setSelectedUser((prev) => (prev && String(prev._id || prev.id) === String(userId) ? {
        ...prev,
        moderation: { ...(prev.moderation || {}), bannedUntil: null, bannedPermanent: false, bannedAt: null, bannedBy: null, banReason: '' },
      } : prev));
      try { invalidateApiCacheByPrefix('/api/admin'); } catch (_) {}
      try { await runAllApiUsers(); } catch (_) {}
      Alert.alert('Succès', 'Utilisateur débanni.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible de lever le ban.");
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={onBack}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Debug</Text>
        <TouchableOpacity onPress={() => { runAllApiUsers(); loadFlags(); }} style={{ padding: 8 }}>
            <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Sync</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Feature Flags Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Feature Flags (Global)</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {flagsLoading ? (
            <ActivityIndicator size="small" color="#00c2cb" />
          ) : flagsError ? (
            <Text style={{ color: '#f66' }}>{flagsError}</Text>
          ) : flags.length === 0 ? (
            <Text style={{ color: colors.text, opacity: 0.5 }}>Aucun flag configuré</Text>
          ) : (
            flags.map((f) => (
              <View key={f.key} style={[styles.flagRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagKey, { color: colors.text }]}>{f.key}</Text>
                  {f.description ? <Text style={[styles.flagDesc, { color: colors.text, opacity: 0.5 }]}>{f.description}</Text> : null}
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
          <TouchableOpacity style={[styles.cmdBtn, { marginTop: 12, backgroundColor: 'rgba(0,194,203,0.1)', borderColor: 'transparent' }]} onPress={loadFlags} disabled={flagsLoading}>
            <Text style={[styles.cmdTxt, { color: '#00c2cb' }]}>Rafraîchir les flags</Text>
          </TouchableOpacity>
        </View>

        {/* Test notifications locales */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Test notifications locales</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <LabeledInput label="Titre" value={locTitle} onChangeText={setLocTitle} placeholder="Titre" colors={colors} isDark={isDark} />
          <LabeledInput label="Message" value={locBody} onChangeText={setLocBody} placeholder="Texte de la notification" colors={colors} isDark={isDark} />
          <LabeledInput label="Deep link" value={locDeepLink} onChangeText={setLocDeepLink} placeholder="ex: loocate://home" colors={colors} isDark={isDark} />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: 140 }}>
              <LabeledInput label="Délai (s)" value={String(locDelaySec)} onChangeText={setLocDelaySec} placeholder="0" keyboardType="numeric" colors={colors} isDark={isDark} />
            </View>
          </View>
          <TouchableOpacity style={[styles.cmdBtn, sendingLocal ? styles.btnDisabled : null, { backgroundColor: '#00c2cb', borderColor: 'transparent' }]} onPress={onSendLocalNotification} disabled={sendingLocal}>
            <Text style={styles.cmdTxt}>
              {sendingLocal
                ? 'Envoi…'
                : (parseInt(String(locDelaySec || '0'), 10) > 0
                  ? `Programmer dans ${parseInt(String(locDelaySec || '0'), 10)}s`
                  : 'Afficher maintenant')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Expo Push Token</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={{ fontSize: 12, color: colors.text, opacity: 0.5, marginBottom: 4 }}>Token actuel :</Text>
          <TextInput
            style={[styles.input, { height: 'auto', minHeight: 40, fontSize: 11, color: colors.text, backgroundColor: colors.background, padding: 8, borderRadius: 8 }]}
            value={currentPushToken}
            multiline
            editable={false}
          />
          <TouchableOpacity
            style={[styles.cmdBtn, registering ? styles.btnDisabled : null, { marginTop: 10, backgroundColor: '#4a90e2', borderColor: 'transparent' }]}
            onPress={onForceRegister}
            disabled={registering}
          >
            {registering && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />}
            <Text style={styles.cmdTxt}>Forcer l'envoi au serveur</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Test notifications (push)</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <LabeledInput label="Titre" value={pushTitle} onChangeText={setPushTitle} placeholder="Titre" colors={colors} isDark={isDark} />
          <LabeledInput label="Message" value={pushBody} onChangeText={setPushBody} placeholder="Texte du push" colors={colors} isDark={isDark} />
          <LabeledInput label="Deep link" value={pushDeepLink} onChangeText={setPushDeepLink} placeholder="ex: loocate://home" colors={colors} isDark={isDark} />
          <LabeledInput label="Tokens (CSV)" value={pushTokens} onChangeText={setPushTokens} placeholder="token1,token2" colors={colors} isDark={isDark} />
          <LabeledInput label="User IDs (CSV)" value={pushUserIds} onChangeText={setPushUserIds} placeholder="id1,id2" colors={colors} isDark={isDark} />
          <LabeledInput label="Image URL" value={pushImageUrl} onChangeText={setPushImageUrl} placeholder="https://..." colors={colors} isDark={isDark} />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Son" value={pushSound} onChangeText={setPushSound} placeholder="default" colors={colors} isDark={isDark} />
            </View>
            <View style={{ width: 120 }}>
              <LabeledInput label="Badge" value={String(pushBadge)} onChangeText={setPushBadge} placeholder="ex: 1" keyboardType="numeric" colors={colors} isDark={isDark} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Channel" value={pushChannelId} onChangeText={setPushChannelId} placeholder="default" colors={colors} isDark={isDark} />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Priorité" value={pushPriority} onChangeText={setPushPriority} placeholder="high|normal" colors={colors} isDark={isDark} />
            </View>
          </View>

          <LabeledInput label="Collapse key" value={pushCollapseKey} onChangeText={setPushCollapseKey} placeholder="clé de regroupement" colors={colors} isDark={isDark} />
          <LabeledTextArea label="Data JSON (optionnel)" value={pushData} onChangeText={setPushData} placeholder='{"kind":"demo"}' colors={colors} isDark={isDark} />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 }}>
            <TouchableOpacity onPress={() => setPushMutable(v => !v)} style={[styles.smallBtn, { flex: 1, backgroundColor: pushMutable ? '#2ecc71' : 'rgba(0,0,0,0.1)' }]}>
              <Text style={styles.smallBtnTxt}>Mutable: {pushMutable ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPushContentAvail(v => !v)} style={[styles.smallBtn, { flex: 1, backgroundColor: pushContentAvail ? '#2ecc71' : 'rgba(0,0,0,0.1)' }]}>
              <Text style={styles.smallBtnTxt}>Avail: {pushContentAvail ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.cmdBtn, sendingPush ? styles.btnDisabled : null, { backgroundColor: '#00c2cb', borderColor: 'transparent', marginTop: 15 }]} onPress={onSendPush} disabled={sendingPush}>
            <Text style={styles.cmdTxt}>{sendingPush ? 'Envoi…' : 'Envoyer la notification'}</Text>
          </TouchableOpacity>

          {pushResponse && (
            <View style={[styles.resultBox, { backgroundColor: colors.background, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>Réponse envoi</Text>
              <Text selectable style={[styles.resultText, { color: colors.text }]}>{JSON.stringify(pushResponse, null, 2)}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recherche utilisateur (debug)</Text>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={{ marginRight: 10 }}>🔎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nom, prénom, username..."
            placeholderTextColor={isDark ? '#888' : '#999'}
            style={[styles.input, { color: colors.text }]}
          />
        </View>

        {searching ? (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 15 }} />
        ) : (
          results.length > 0 && (
            <View style={[styles.resultsBox, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              {results.map((u, idx) => (
                <TouchableOpacity
                    key={String(u._id || u.id)}
                    style={[styles.resultRow, idx !== results.length - 1 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={() => setSelectedUser(u)}
                >
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {(u.username || u.customName || u.firstName || u.email || 'Utilisateur')}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: u.isPremium ? '#2ecc71' : '#3498db' }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{u.isPremium ? 'Premium' : 'Free'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {selectedUser && (
          <View style={[styles.selectedBox, { backgroundColor: colors.surface, borderColor: '#00c2cb' }]}>
            <Text style={[styles.selectedTitle, { color: colors.text, opacity: 0.5 }]}>Utilisateur sélectionné</Text>
            <Text style={[styles.selectedName, { color: colors.text }]} numberOfLines={1}>
              {(selectedUser.username || selectedUser.customName || selectedUser.firstName || selectedUser.email || 'Utilisateur')}
            </Text>

            {(() => {
              const mod = selectedUser.moderation || {};
              const bannedPermanent = !!mod.bannedPermanent;
              const bannedUntil = mod.bannedUntil ? new Date(mod.bannedUntil) : null;
              const bannedUntilActive = bannedUntil && !isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
              const isBanned = bannedPermanent || bannedUntilActive;
              const banLabel = bannedPermanent
                ? 'Ban définitif'
                : bannedUntilActive
                  ? `Ban jusqu’au ${bannedUntil.toLocaleString(locale)}`
                  : 'Non banni';
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                  <View style={[styles.badge, { backgroundColor: isBanned ? '#ff4d4d' : 'rgba(0,0,0,0.1)' }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{banLabel}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#16a085' }, !isBanned && { opacity: 0.3 }]}
                    onPress={() => handleUnban(selectedUser._id || selectedUser.id)}
                    disabled={!isBanned}
                  >
                    <Text style={styles.smallBtnTxt}>Unban</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
              <View style={[styles.badge, { backgroundColor: selectedUser.isPremium ? '#2ecc71' : '#3498db' }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{selectedUser.isPremium ? 'Premium' : 'Free'}</Text>
              </View>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2ecc71' }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, true)}>
                <Text style={styles.smallBtnTxt}>Set Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#3498db' }]} onPress={() => togglePremium(selectedUser._id || selectedUser.id, false)}>
                <Text style={styles.smallBtnTxt}>Set Free</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
              <View style={[styles.badge, { backgroundColor: '#e67e22' }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{selectedUser.role || 'user'}</Text>
              </View>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#c0392b' }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'admin')}>
                <Text style={styles.smallBtnTxt}>Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#8e44ad' }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'moderator')}>
                <Text style={styles.smallBtnTxt}>Mod</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#7f8c8d' }]} onPress={() => changeUserRole(selectedUser._id || selectedUser.id, 'user')}>
                <Text style={styles.smallBtnTxt}>User</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 25 }]}>Actions Globales</Text>
        <TouchableOpacity style={[styles.cmdBtn, { backgroundColor: '#00c2cb', borderColor: 'transparent' }]} onPress={runAllApiUsers} disabled={loading}>
          <Text style={styles.cmdTxt}>Lister tous les utilisateurs (API)</Text>
        </TouchableOpacity>

        {loading && (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginVertical: 15 }} />
        )}

        {users.length > 0 && (
          <View style={[styles.usersBox, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            {users.slice(0, 20).map((u, idx) => (
              <View key={String(u._id || u.id)} style={[styles.userRow, idx !== Math.min(users.length, 20) - 1 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderBottomWidth: 1 }]}>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                  {u.username || u.customName || u.firstName || u.email || 'Utilisateur'}
                </Text>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: u.isPremium ? '#2ecc71' : '#3498db' }]} onPress={() => togglePremium(u._id || u.id, !u.isPremium)}>
                  <Text style={styles.smallBtnTxt}>{u.isPremium ? 'Premium' : 'Free'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {users.length > 20 && <Text style={{ textAlign: 'center', color: colors.text, opacity: 0.3, padding: 10 }}>Affichage limité aux 20 premiers</Text>}
          </View>
        )}

        {result && (
          <View style={[styles.resultBox, { backgroundColor: colors.background, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Dernier résultat JSON</Text>
            {typeof result.total !== 'undefined' && (
              <Text style={{ color: colors.text, opacity: 0.5, marginBottom: 5 }}>Total items: {result.total}</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text selectable style={[styles.resultText, { color: colors.text }]}>
                    {JSON.stringify(result, null, 2)}
                </Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  backButtonCircular: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { width: 24, height: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 25, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6 },
  card: { borderRadius: 20, padding: 20, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
  flagRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  flagKey: { fontSize: 16, fontWeight: '700' },
  flagDesc: { fontSize: 12, marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 10 },
  input: { flex: 1, fontSize: 16 },
  resultsBox: { borderRadius: 15, marginTop: 10, borderWidth: 1, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1 },
  resultName: { flex: 1, fontWeight: '600' },
  selectedBox: { borderRadius: 20, padding: 20, borderWidth: 2, marginTop: 10 },
  selectedTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 },
  selectedName: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  cmdBtn: { padding: 16, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', marginBottom: 10, flexDirection: 'row', justifyContent: 'center' },
  cmdTxt: { fontWeight: '700', fontSize: 15, color: '#fff' },
  btnDisabled: { opacity: 0.5 },
  resultBox: { borderRadius: 15, padding: 15, borderWidth: 1, marginTop: 15 },
  resultTitle: { fontWeight: '800', marginBottom: 8 },
  resultText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  usersBox: { borderRadius: 15, padding: 10, borderWidth: 1, marginTop: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5 },
  userName: { flex: 1, fontSize: 14, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  smallBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});

// Helper Components
const LabeledInput = ({ label, colors, isDark, ...props }) => (
  <View style={{ marginBottom: 15 }}>
    <Text style={{ color: colors.text, opacity: 0.5, fontSize: 12, fontWeight: '700', marginBottom: 5, textTransform: 'uppercase' }}>{label}</Text>
    <TextInput
        {...props}
        style={[{ borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, color: colors.text, fontSize: 15 }]}
        placeholderTextColor={isDark ? '#555' : '#ccc'}
    />
  </View>
);

const LabeledTextArea = ({ label, colors, isDark, ...props }) => (
  <View style={{ marginBottom: 15 }}>
    <Text style={{ color: colors.text, opacity: 0.5, fontSize: 12, fontWeight: '700', marginBottom: 5, textTransform: 'uppercase' }}>{label}</Text>
    <TextInput
        {...props}
        multiline
        numberOfLines={4}
        style={[{ minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, color: colors.text, fontSize: 15 }]}
        placeholderTextColor={isDark ? '#555' : '#ccc'}
    />
  </View>
);

export default DebugScreen;

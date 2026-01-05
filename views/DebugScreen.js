import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { getAllUsers, setUserPremium, searchUsers, invalidateApiCacheByPrefix, sendAdminPush } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';

const DebugScreen = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [users, setUsers] = useState([]);
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
  }, []);

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
      const ok = await ensureLocalNotifSetup();
      if (!ok) return;
      const Notifications = notificationsRef.current;
      // Permissions
      try {
        const perm = await Notifications.getPermissionsAsync();
        let status = perm?.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req?.status;
          if (status !== 'granted') {
            Alert.alert('Permission requise', 'Autorisez les notifications pour tester.');
            return;
          }
        }
      } catch (_) {}

      const content = {
        title: locTitle || 'Notification',
        body: locBody || 'Test',
        data: {},
      };
      if (locDeepLink && String(locDeepLink).trim()) {
        content.data.deepLink = String(locDeepLink).trim();
      }
      const delay = parseInt(String(locDelaySec || '0'), 10) || 0;
      if (delay > 0) {
        // Try native scheduling first
        if (typeof Notifications?.scheduleNotificationAsync === 'function') {
          await Notifications.scheduleNotificationAsync({
            content,
            trigger: { seconds: Math.max(1, delay) },
          });
          Alert.alert('Programmé', `Notification dans ${Math.max(1, delay)}s`);
        } else if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
          // Fallback for web where expo-notifications scheduling may be unavailable
          const seconds = Math.max(1, delay);
          try {
            if (window.Notification.permission !== 'granted') {
              await window.Notification.requestPermission();
            }
          } catch (_) {}
          setTimeout(() => {
            try {
              if (window.Notification.permission === 'granted') {
                new window.Notification(content.title || 'Notification', { body: content.body || '', data: content.data });
              } else {
                Alert.alert('Permission requise', 'Autorisez les notifications du navigateur pour tester.');
              }
            } catch (_) {}
          }, seconds * 1000);
          Alert.alert('Programmé (web)', `Notification dans ${seconds}s`);
        } else {
          throw new Error('Notifications.scheduleNotificationAsync indisponible sur cette plateforme.');
        }
      } else {
        // Immediate display
        if (typeof Notifications?.presentNotificationAsync === 'function') {
          await Notifications.presentNotificationAsync(content);
          Alert.alert('Affichée', 'Notification locale affichée.');
        } else if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
          try {
            if (window.Notification.permission !== 'granted') {
              await window.Notification.requestPermission();
            }
            if (window.Notification.permission === 'granted') {
              new window.Notification(content.title || 'Notification', { body: content.body || '', data: content.data });
              Alert.alert('Affichée (web)', 'Notification locale affichée (web).');
            } else {
              Alert.alert('Permission requise', 'Autorisez les notifications du navigateur pour tester.');
            }
          } catch (err) {
            Alert.alert('Non supporté', "Les notifications locales ne sont pas supportées sur cette plateforme.");
          }
        } else {
          throw new Error('Notifications.presentNotificationAsync indisponible sur cette plateforme.');
        }
      }
    } catch (e) {
      Alert.alert('Erreur notification', e?.message || String(e));
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
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

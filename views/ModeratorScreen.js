import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  PanResponder,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReports, actOnReport, searchModerationUsers, moderateUser } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
import { useLocale } from '../components/contexts/LocalizationContext';
import { UserContext } from '../components/contexts/UserContext';

const { width, height } = Dimensions.get('window');

const formatName = (u) => {
  if (!u) return 'Inconnu';
  return (
    String(u.customName || '').trim()
    || String(u.firstName || '').trim()
    || String(u.username || '').trim()
    || 'Inconnu'
  );
};

const formatDate = (d, locale) => {
  try {
    return new Date(d).toLocaleString(locale);
  } catch (_) {
    return '';
  }
};

const CATEGORY_LABELS = {
  harassment: 'Harcèlement',
  spam: 'Spam',
  inappropriate: 'Contenu inapproprié',
  impersonation: 'Usurpation d’identité',
  scam: 'Arnaque',
  other: 'Autre',
};

const ModeratorScreen = ({ onBack, onOpenUserProfile }) => {
  const { colors, isDark } = useTheme();
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
  const subTextColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.5)';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : colors.surface;
  const { locale } = useLocale();
  const { user } = useContext(UserContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionVisible, setActionVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [actionType, setActionType] = useState('warn');
  const [actionTarget, setActionTarget] = useState('reported');
  const [durationHours, setDurationHours] = useState('24');
  const [warningType, setWarningType] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [moderationVisible, setModerationVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [banDurationHours, setBanDurationHours] = useState('24');
  const [banNote, setBanNote] = useState('');
  const [moderationWorking, setModerationWorking] = useState(false);
  const searchDebounceRef = useRef(null);
  const cardStyle = [styles.card, { backgroundColor: cardBg, borderColor: borderColor, borderWidth: 1, shadowColor: isDark ? 'transparent' : '#000' }];
  const sectionTitleStyle = [styles.sectionTitle, { color: isDark ? '#fff' : colors.text, opacity: 1 }];
  const textStyle = { color: isDark ? '#fff' : colors.text };
  const subTextStyle = { color: isDark ? '#eee' : subTextColor };

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
        onBack && onBack();
      }
    },
  });

  const mapModerationUser = (u) => ({
    id: u?.id || u?._id,
    username: u?.username || '',
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    customName: u?.customName || '',
    email: u?.email || '',
    profileImageUrl: u?.profileImageUrl || '',
    role: u?.role || 'user',
    isVisible: u?.isVisible !== false,
    moderation: u?.moderation || {},
  });

  const loadReports = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getReports({ status: 'pending', page: 1, limit: 50 });
      setReports(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(e?.message || 'Impossible de charger les signalements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    const q = String(searchQuery || '').trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q) {
      setSearchResults([]);
      setSearchError('');
      setSearching(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError('');
        const res = await searchModerationUsers({ q, limit: 10 });
        const list = Array.isArray(res?.users) ? res.users.map(mapModerationUser) : [];
        setSearchResults(list);
      } catch (e) {
        setSearchError(e?.message || 'Recherche impossible.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const openAction = (report, type) => {
    setSelectedReport(report);
    setActionType(type);
    setActionTarget('reported');
    setDurationHours('24');
    const categoryLabel = report?.category ? (CATEGORY_LABELS[report.category] || report.category) : '';
    setWarningType(categoryLabel || '');
    setNote('');
    setActionVisible(true);
  };

  const submitAction = async () => {
    if (!selectedReport?.id) return;
    if (actionType === 'ban_temp' && (!durationHours || Number(durationHours) <= 0)) {
      Alert.alert('Durée requise', 'Merci d’indiquer un nombre d’heures valide.');
      return;
    }
    try {
      setWorking(true);
      await actOnReport(selectedReport.id, {
        action: actionType,
        target: actionType === 'dismiss' ? undefined : actionTarget,
        durationHours: actionType === 'ban_temp' ? Number(durationHours) : undefined,
        warningType: actionType === 'warn' ? (warningType.trim() || undefined) : undefined,
        note: note.trim() || undefined,
      });
      setActionVisible(false);
      await loadReports();
      Alert.alert('Action appliquée', 'La décision a été enregistrée.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible d’appliquer cette action.');
    } finally {
      setWorking(false);
    }
  };

  const openUserModeration = (u) => {
    const mapped = mapModerationUser(u);
    setSelectedUser(mapped);
    setBanDurationHours('24');
    setBanNote('');
    setModerationVisible(true);
  };

  const applyUserModeration = async (action, options = {}) => {
    if (!selectedUser?.id) return;
    try {
      setModerationWorking(true);
      if (action === 'ban_temp') {
        const hours = Math.max(1, parseInt(options.durationHours, 10) || 0);
        if (!hours) {
          Alert.alert('Durée requise', 'Merci d’indiquer un nombre d’heures valide.');
          return;
        }
      }
      const res = await moderateUser(selectedUser.id, {
        action,
        durationHours: options.durationHours,
        note: options.note,
      });
      const updated = res?.user ? mapModerationUser(res.user) : null;
      if (updated) {
        setSelectedUser(updated);
        setSearchResults((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)));
      }
      Alert.alert('Succès', 'Action enregistrée.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible d’appliquer cette action.');
    } finally {
      setModerationWorking(false);
    }
  };

  const getBanLabel = (mod = {}) => {
    const bannedPermanent = !!mod.bannedPermanent;
    const bannedUntil = mod.bannedUntil ? new Date(mod.bannedUntil) : null;
    const bannedUntilActive = bannedUntil && !isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
    if (bannedPermanent) return 'Ban définitif';
    if (bannedUntilActive) return `Ban jusqu’au ${bannedUntil.toLocaleString(locale)}`;
    return 'Non banni';
  };

  if (!user || !['admin', 'moderator'].includes(user.role)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
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
          <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.text }]}>Accès refusé</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={[styles.subtitle, { color: colors.text, textAlign: 'center' }]}>Cette section est réservée aux modérateurs.</Text>
          <TouchableOpacity style={[styles.primaryButton, { marginTop: 20 }]} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: borderColor, borderBottomWidth: 1 }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: isDark ? 'rgba(0,194,203,0.2)' : 'rgba(0,194,203,0.1)' }]}
          onPress={onBack}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.text }]}>Signalements</Text>
        <TouchableOpacity onPress={loadReports} style={{ padding: 8 }}>
            <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Rafraîchir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.searchSection}>
            <Text style={sectionTitleStyle}>Recherche utilisateur</Text>
            <View style={[styles.searchBar, { borderColor: borderColor, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface, borderWidth: 1 }]}>
            <Text style={[{ marginRight: 10 }, textStyle]}>🔎</Text>
            <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Nom, username..."
                placeholderTextColor={isDark ? '#999' : subTextColor}
                style={[styles.searchInput, textStyle]}
            />
            </View>
            {searching ? (
            <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 8 }} />
            ) : searchError ? (
            <Text style={[styles.error, { color: '#ff4d4d' }]}>{searchError}</Text>
            ) : searchResults.length > 0 ? (
            <View style={[styles.resultsBox, { borderColor: borderColor, backgroundColor: colors.surface, borderWidth: 1 }]}>
                {searchResults.map((u, idx) => {
                const mod = u?.moderation || {};
                const warningsCount = typeof mod.warningsCount === 'number' ? mod.warningsCount : (Array.isArray(mod.warningsHistory) ? mod.warningsHistory.length : 0);
                return (
                    <TouchableOpacity
                    key={String(u.id)}
                    style={[styles.resultRow, idx !== searchResults.length - 1 && { borderBottomColor: borderColor, borderBottomWidth: 1 }]}
                    onLongPress={() => openUserModeration(u)}
                    >
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.resultName, textStyle]} numberOfLines={1}>
                        {formatName(u)}
                        </Text>
                        <Text style={[styles.resultMeta, subTextStyle]} numberOfLines={1}>
                        {u.email || '—'}
                        </Text>
                    </View>
                    <View style={styles.resultBadges}>
                        <View style={[styles.badge, { backgroundColor: '#f39c12' }]}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{warningsCount} av.</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: '#34495e' }]}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{getBanLabel(mod)}</Text>
                        </View>
                    </View>
                    </TouchableOpacity>
                );
                })}
            </View>
            ) : null}
            <Text style={[styles.helperText, subTextStyle]}>Appui long sur un utilisateur pour gérer ses avertissements ou son ban.</Text>
        </View>

        <Text style={[sectionTitleStyle, { marginBottom: 15 }]}>Signalements en attente</Text>
        {loading ? (
            <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
        ) : error ? (
            <Text style={[styles.error, { color: '#ff6b6b', textAlign: 'center' }]}>{error}</Text>
        ) : reports.length === 0 ? (
            <View style={[styles.card, { backgroundColor: cardBg, alignItems: 'center', borderColor: borderColor, borderWidth: 1 }]}>
                <Text style={subTextStyle}>Aucun signalement en attente.</Text>
            </View>
        ) : (
            reports.map((rep) => (
                <View key={rep.id} style={cardStyle}>
                <TouchableOpacity
                    style={styles.cardTitleButton}
                    onPress={() => {
                    if (rep?.reported?.id && onOpenUserProfile) {
                        onOpenUserProfile(rep.reported);
                    }
                    }}
                    disabled={!rep?.reported?.id || !onOpenUserProfile}
                >
                    <Text style={[styles.cardTitle, textStyle]}>
                    {formatName(rep.reported)}
                    </Text>
                </TouchableOpacity>
                <View style={{ marginTop: 5 }}>
                    <Text style={[styles.cardMeta, textStyle]}>Signalé par: <Text style={[{ fontWeight: '600' }, textStyle]}>{formatName(rep.reporter)}</Text></Text>
                    <Text style={[styles.cardMeta, subTextStyle]}>Date: {formatDate(rep.createdAt, locale)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <View style={{ backgroundColor: 'rgba(0,194,203,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 8 }}>
                            <Text style={{ color: '#00c2cb', fontSize: 12, fontWeight: '700' }}>{rep.category}</Text>
                        </View>
                        <Text style={[textStyle, { opacity: 0.7, fontSize: 13 }]}>{rep.reason}</Text>
                    </View>
                    {rep.description ? (
                    <Text style={[styles.cardMeta, textStyle, { marginTop: 8, fontStyle: 'italic' }]}>"{rep.description}"</Text>
                    ) : null}
                    <Text style={[styles.pendingCount, { color: '#f39c12' }]}>{rep.pendingCountForReported ?? 0} signalement(s) total</Text>
                </View>

                <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openAction(rep, 'warn')}>
                    <Text style={styles.actionBtnText}>Avertir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openAction(rep, 'ban_temp')}>
                    <Text style={styles.actionBtnText}>Ban temp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openAction(rep, 'ban_permanent')}>
                    <Text style={styles.actionBtnText}>Ban def</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} onPress={() => openAction(rep, 'dismiss')}>
                    <Text style={[styles.actionBtnText, textStyle, { opacity: 0.6 }]}>Rejeter</Text>
                    </TouchableOpacity>
                </View>
                </View>
            ))
        )}
      </ScrollView>

      {/* Action Modal */}
      <Modal transparent visible={actionVisible} animationType="fade" onRequestClose={() => setActionVisible(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setActionVisible(false); }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ width: '100%' }}
              >
                <ScrollView
                  contentContainerStyle={[styles.modalCard, { backgroundColor: colors.surface }]}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#00c2cb' }]}>Décision</Text>
                  <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Cible de l'action</Text>
                  <View style={styles.targetRow}>
                    <TouchableOpacity
                      style={[styles.targetChip, { backgroundColor: colors.background, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }, actionTarget === 'reported' && { borderColor: '#00c2cb', backgroundColor: 'rgba(0,194,203,0.1)' }]}
                      onPress={() => setActionTarget('reported')}
                      disabled={actionType === 'dismiss'}
                    >
                      <Text style={[styles.targetChipText, textStyle, actionTarget === 'reported' && { color: '#00c2cb', fontWeight: 'bold' }]}>Accusé</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.targetChip, { backgroundColor: colors.background, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }, actionTarget === 'reporter' && { borderColor: '#00c2cb', backgroundColor: 'rgba(0,194,203,0.1)' }]}
                      onPress={() => setActionTarget('reporter')}
                      disabled={actionType === 'dismiss'}
                    >
                      <Text style={[styles.targetChipText, textStyle, actionTarget === 'reporter' && { color: '#00c2cb', fontWeight: 'bold' }]}>Rapporteur</Text>
                    </TouchableOpacity>
                  </View>

                  {actionType === 'ban_temp' && (
                    <>
                      <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Durée (heures)</Text>
                      <TextInput
                        style={[styles.modalInput, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background }]}
                        keyboardType="numeric"
                        value={durationHours}
                        onChangeText={setDurationHours}
                      />
                    </>
                  )}

                  {actionType === 'warn' && (
                    <>
                      <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Type d’avertissement</Text>
                      <TextInput
                        style={[styles.modalInput, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background }]}
                        value={warningType}
                        onChangeText={setWarningType}
                        placeholder="Ex: Harcèlement"
                        placeholderTextColor={isDark ? '#999' : '#ccc'}
                      />
                    </>
                  )}

                  <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Note interne (optionnel)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextarea, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background }]}
                    value={note}
                    onChangeText={setNote}
                    multiline
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={submitAction} disabled={working}>
                      <Text style={styles.primaryButtonText}>{working ? 'Traitement...' : 'Confirmer'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} onPress={() => setActionVisible(false)} disabled={working}>
                      <Text style={[styles.primaryButtonText, textStyle, { opacity: 0.6 }]}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* User Management Modal */}
      <Modal transparent visible={moderationVisible} animationType="fade" onRequestClose={() => setModerationVisible(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setModerationVisible(false); }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ width: '100%' }}
              >
                <ScrollView contentContainerStyle={[styles.modalCard, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled">
                  <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#00c2cb' }]}>Gestion utilisateur</Text>

                  <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background, borderRadius: 15, padding: 15, marginBottom: 15 }}>
                    <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5, marginTop: 0 }]}>Utilisateur</Text>
                    <Text style={[styles.modalValue, textStyle]} numberOfLines={1}>
                        {formatName(selectedUser)}
                    </Text>
                    <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Statut actuel</Text>
                    <Text style={[styles.modalValue, { color: '#00c2cb' }]}>{getBanLabel(selectedUser?.moderation || {})}</Text>
                    <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Avertissements</Text>
                    <Text style={[styles.modalValue, textStyle]}>
                        {selectedUser?.moderation?.warningsCount || 0}
                    </Text>
                  </View>

                  <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Durée du ban (heures)</Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background }]}
                    keyboardType="numeric"
                    value={banDurationHours}
                    onChangeText={setBanDurationHours}
                  />
                  <Text style={[styles.modalLabel, textStyle, { opacity: isDark ? 0.9 : 0.5 }]}>Motif du ban</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextarea, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', color: isDark ? '#fff' : colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background }]}
                    value={banNote}
                    onChangeText={setBanNote}
                    multiline
                  />

                  <View style={styles.modalActionsColumn}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { paddingVertical: 14 }]}
                      onPress={() => applyUserModeration('ban_temp', { durationHours: banDurationHours, note: banNote })}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.actionBtnText}>Ban temporaire</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#ff4444', paddingVertical: 14 }]}
                      onPress={() => applyUserModeration('ban_permanent', { note: banNote })}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.actionBtnText}>Ban définitif</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2ecc71', paddingVertical: 14 }]}
                      onPress={() => applyUserModeration('unban')}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.actionBtnText}>Retirer le ban</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#f39c12', paddingVertical: 14 }]}
                      onPress={() => applyUserModeration('clear_warnings')}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.actionBtnText}>Remettre avertissements à zéro</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', marginTop: 5 }]} onPress={() => setModerationVisible(false)} disabled={moderationWorking}>
                      <Text style={[styles.primaryButtonText, textStyle, { opacity: 0.6 }]}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginVertical: 10,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardTitleButton: {
    alignSelf: 'flex-start',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 14,
    marginTop: 2,
  },
  pendingCount: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 15,
  },
  actionBtn: {
    backgroundColor: '#00c2cb',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: '#00c2cb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  searchSection: {
    marginBottom: 25,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  resultsBox: {
    borderWidth: 1,
    borderRadius: 15,
    marginTop: 10,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '700',
  },
  resultMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  resultBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 25,
    padding: 25,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 15,
    marginBottom: 5,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 25,
  },
  modalActionsColumn: {
    gap: 10,
    marginTop: 15,
  },
  targetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  targetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  targetChipText: {
    fontSize: 14,
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});

export default ModeratorScreen;

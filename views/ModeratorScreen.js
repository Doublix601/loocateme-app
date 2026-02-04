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
  const { colors } = useTheme();
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
      <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={styles.backButtonImage}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Accès refusé</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Cette section est réservée aux modérateurs.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
          <Text style={styles.primaryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Image
          source={require('../assets/appIcons/backArrow.png')}
          style={styles.backButtonImage}
        />
      </TouchableOpacity>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.accent }]}>Signalements</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={loadReports}>
          <Text style={styles.primaryButtonText}>Rafraîchir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recherche utilisateur</Text>
        <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <Text style={[styles.searchIcon, { color: colors.textSecondary }]}>🔎</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Nom, prénom, username..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>
        {searching ? (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 8 }} />
        ) : searchError ? (
          <Text style={[styles.error, { color: '#ff4d4d' }]}>{searchError}</Text>
        ) : searchResults.length > 0 ? (
          <View style={[styles.resultsBox, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            {searchResults.map((u) => {
              const mod = u?.moderation || {};
              const warningsCount = typeof mod.warningsCount === 'number' ? mod.warningsCount : (Array.isArray(mod.warningsHistory) ? mod.warningsHistory.length : 0);
              return (
                <TouchableOpacity
                  key={String(u.id)}
                  style={[styles.resultRow, { borderBottomColor: colors.border }]}
                  onLongPress={() => openUserModeration(u)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {formatName(u)}
                    </Text>
                    <Text style={[styles.resultMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {u.email || '—'}
                    </Text>
                  </View>
                  <View style={styles.resultBadges}>
                    <Text style={[styles.badge, styles.badgeWarnings]}>{warningsCount} av.</Text>
                    <Text style={[styles.badge, styles.badgeBan]}>{getBanLabel(mod)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>Appui long sur un utilisateur pour gérer ses avertissements ou son ban.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={[styles.error, { color: '#ff4d4d' }]}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {reports.length === 0 ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Aucun signalement en attente.</Text>
          ) : (
            reports.map((rep) => (
              <View key={rep.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                <TouchableOpacity
                  style={styles.cardTitleButton}
                  onPress={() => {
                    if (rep?.reported?.id && onOpenUserProfile) {
                      onOpenUserProfile(rep.reported);
                    }
                  }}
                  disabled={!rep?.reported?.id || !onOpenUserProfile}
                >
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                    {formatName(rep.reported)}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Signalé par: {formatName(rep.reporter)}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Date: {formatDate(rep.createdAt, locale)}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Catégorie: {rep.category}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Motif: {rep.reason}</Text>
                {rep.description ? (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Détails: {rep.description}</Text>
                ) : null}
                <Text style={[styles.pendingCount, { color: colors.textSecondary }]}>Signalements en cours: {rep.pendingCountForReported ?? 0}</Text>

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
                  <TouchableOpacity style={[styles.actionBtn, styles.dismissBtn]} onPress={() => openAction(rep, 'dismiss')}>
                    <Text style={[styles.actionBtnText, styles.dismissBtnText]}>Rejeter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

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
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Action</Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Cible</Text>
                  <View style={styles.targetRow}>
                    <TouchableOpacity
                      style={[styles.targetChip, actionTarget === 'reported' && styles.targetChipActive]}
                      onPress={() => setActionTarget('reported')}
                      disabled={actionType === 'dismiss'}
                    >
                      <Text style={[styles.targetChipText, actionTarget === 'reported' && styles.targetChipTextActive]}>Accusé</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.targetChip, actionTarget === 'reporter' && styles.targetChipActive]}
                      onPress={() => setActionTarget('reporter')}
                      disabled={actionType === 'dismiss'}
                    >
                      <Text style={[styles.targetChipText, actionTarget === 'reporter' && styles.targetChipTextActive]}>Rapporteur</Text>
                    </TouchableOpacity>
                  </View>

                  {actionType === 'ban_temp' && (
                    <>
                      <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Durée (heures)</Text>
                      <TextInput
                        style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary }]}
                        keyboardType="numeric"
                        value={durationHours}
                        onChangeText={setDurationHours}
                      />
                    </>
                  )}

                  {actionType === 'warn' && (
                    <>
                      <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Type d’avertissement</Text>
                      <TextInput
                        style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary }]}
                        value={warningType}
                        onChangeText={setWarningType}
                        placeholder="Ex: Harcèlement"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </>
                  )}

                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Motif (optionnel)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextarea, { borderColor: colors.border, color: colors.textPrimary }]}
                    value={note}
                    onChangeText={setNote}
                    multiline
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={submitAction} disabled={working}>
                      <Text style={styles.primaryButtonText}>{working ? 'Traitement...' : 'Confirmer'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, styles.cancelButton]} onPress={() => setActionVisible(false)} disabled={working}>
                      <Text style={[styles.primaryButtonText, styles.cancelButtonText]}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent visible={moderationVisible} animationType="fade" onRequestClose={() => setModerationVisible(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setModerationVisible(false); }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ width: '100%' }}
              >
                <ScrollView contentContainerStyle={[styles.modalCard, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled">
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Gestion utilisateur</Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Utilisateur</Text>
                  <Text style={[styles.modalValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {formatName(selectedUser)}
                  </Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Statut</Text>
                  <Text style={[styles.modalValue, { color: colors.textPrimary }]}>{getBanLabel(selectedUser?.moderation || {})}</Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Avertissements</Text>
                  <Text style={[styles.modalValue, { color: colors.textPrimary }]}> 
                    {selectedUser?.moderation?.warningsCount || 0}
                  </Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Ban sans signalement</Text>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Durée (heures)</Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary }]}
                    keyboardType="numeric"
                    value={banDurationHours}
                    onChangeText={setBanDurationHours}
                  />
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Motif (optionnel)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextarea, { borderColor: colors.border, color: colors.textPrimary }]}
                    value={banNote}
                    onChangeText={setBanNote}
                    multiline
                  />

                  <View style={styles.modalActionsColumn}>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => applyUserModeration('clear_warnings')}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.primaryButtonText}>{moderationWorking ? 'Traitement...' : 'Retirer tous les avertissements'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.actionBtn]}
                      onPress={() => applyUserModeration('ban_temp', { durationHours: banDurationHours, note: banNote })}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.primaryButtonText}>Ban temporaire</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.actionBtn]}
                      onPress={() => applyUserModeration('ban_permanent', { note: banNote })}
                      disabled={moderationWorking}
                    >
                      <Text style={styles.primaryButtonText}>Ban définitif</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, styles.actionBtn]} onPress={() => applyUserModeration('unban')} disabled={moderationWorking}>
                      <Text style={styles.primaryButtonText}>Retirer le ban</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, styles.cancelButton]} onPress={() => setModerationVisible(false)} disabled={moderationWorking}>
                      <Text style={[styles.primaryButtonText, styles.cancelButtonText]}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: width * 0.05,
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
  header: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: Math.max(8, height * 0.02),
    gap: 8,
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: width * 0.055,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: width * 0.045,
    marginTop: 10,
  },
  error: {
    fontSize: width * 0.045,
    marginTop: 20,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitleButton: {
    alignSelf: 'flex-start',
  },
  cardTitle: {
    fontSize: width * 0.055,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: width * 0.04,
    marginBottom: 2,
  },
  pendingCount: {
    marginTop: 6,
    fontSize: width * 0.04,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    backgroundColor: '#00c2cb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: width * 0.04,
  },
  dismissBtn: {
    backgroundColor: '#ffe6e6',
  },
  dismissBtnText: {
    color: '#ff4d4d',
  },
  primaryButton: {
    backgroundColor: '#00c2cb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  searchSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: width * 0.042,
  },
  resultsBox: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  resultName: {
    fontSize: width * 0.045,
    fontWeight: '600',
  },
  resultMeta: {
    fontSize: width * 0.035,
  },
  resultBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    fontSize: width * 0.032,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    color: '#fff',
    overflow: 'hidden',
  },
  badgeWarnings: {
    backgroundColor: '#f39c12',
  },
  badgeBan: {
    backgroundColor: '#34495e',
  },
  helperText: {
    marginTop: 6,
    fontSize: width * 0.034,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.06,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: width * 0.055,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalLabel: {
    fontSize: width * 0.04,
    marginTop: 8,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalTextarea: {
    height: height * 0.12,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalActionsColumn: {
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    backgroundColor: '#e0f7f9',
  },
  cancelButtonText: {
    color: '#00c2cb',
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  targetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  targetChipActive: {
    borderColor: '#00c2cb',
    backgroundColor: '#e6fbfc',
  },
  targetChipText: {
    fontSize: width * 0.04,
    color: '#333',
  },
  targetChipTextActive: {
    color: '#00aab2',
    fontWeight: '600',
  },
  modalValue: {
    fontSize: width * 0.045,
    fontWeight: '600',
    marginBottom: 6,
  },
});

export default ModeratorScreen;

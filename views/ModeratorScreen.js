import React, { useEffect, useState, useContext } from 'react';
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
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { getReports, actOnReport } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
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

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleString('fr-FR');
  } catch (_) {
    return '';
  }
};

const ModeratorScreen = ({ onBack, onOpenUserProfile }) => {
  const { colors } = useTheme();
  const { user } = useContext(UserContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionVisible, setActionVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [actionType, setActionType] = useState('warn');
  const [actionTarget, setActionTarget] = useState('reported');
  const [durationHours, setDurationHours] = useState('24');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);

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

  const openAction = (report, type) => {
    setSelectedReport(report);
    setActionType(type);
    setActionTarget('reported');
    setDurationHours('24');
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

  if (!user || !['admin', 'moderator'].includes(user.role)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Accès refusé</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Cette section est réservée aux modérateurs.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
          <Text style={styles.primaryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Signalements</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={loadReports}>
          <Text style={styles.primaryButtonText}>Rafraîchir</Text>
        </TouchableOpacity>
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
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Date: {formatDate(rep.createdAt)}</Text>
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

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Retour</Text>
      </TouchableOpacity>

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

                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Note (optionnelle)</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: width * 0.05,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: width * 0.07,
    fontWeight: '700',
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
  backButton: {
    alignSelf: 'center',
    marginTop: 12,
  },
  backButtonText: {
    color: '#00c2cb',
    fontSize: width * 0.045,
    fontWeight: '600',
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
});

export default ModeratorScreen;

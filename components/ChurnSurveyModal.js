// Sondage court affiché quand l'utilisateur révoque une permission clé
// (localisation ou notifications) : on le capte à ce moment précis car c'est
// le signal le plus fort de désengagement à venir, et l'utilisateur est encore
// joignable pour répondre — contrairement à une enquête post-désinstallation.
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { submitChurnSurvey } from '../services/EngagementTrackingService';
import CloseButton from './CloseButton';

export default function ChurnSurveyModal({ visible, context, onClose }) {
  const { t } = useTranslation();
  const REASONS = [
    { id: 'too_many_notifications', label: t('churnSurveyModal.reasonTooManyNotifications') },
    { id: 'privacy_concern', label: t('churnSurveyModal.reasonPrivacyConcern') },
    { id: 'not_useful', label: t('churnSurveyModal.reasonNotUseful') },
    { id: 'other', label: t('churnSurveyModal.reasonOther') },
  ];
  const [submittedId, setSubmittedId] = useState(null);

  const handleSelect = async (reasonId) => {
    setSubmittedId(reasonId);
    await submitChurnSurvey({ reason: reasonId, context });
    setTimeout(() => {
      setSubmittedId(null);
      onClose?.();
    }, 900);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <CloseButton
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: 'rgba(0,0,0,0.06)' }]}
            iconColor="#333"
          />
          {submittedId ? (
            <Text style={styles.thanks}>{t('churnSurveyModal.thanks')}</Text>
          ) : (
            <>
              <Text style={styles.title}>{t('churnSurveyModal.title')}</Text>
              <Text style={styles.subtitle}>{t('churnSurveyModal.subtitle')}</Text>
              {REASONS.map((r) => (
                <TouchableOpacity key={r.id} style={styles.option} onPress={() => handleSelect(r.id)}>
                  <Text style={styles.optionText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.dismiss} onPress={onClose}>
                <Text style={styles.dismissText}>{t('churnSurveyModal.dismiss')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  closeBtn: { position: 'absolute', top: 10, right: 10 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  optionText: { fontSize: 15 },
  dismiss: { marginTop: 16, alignSelf: 'center' },
  dismissText: { color: '#999', fontSize: 13 },
  thanks: { fontSize: 16, textAlign: 'center', paddingVertical: 20 },
});

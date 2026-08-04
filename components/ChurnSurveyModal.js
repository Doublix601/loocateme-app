// Sondage court affiché quand l'utilisateur révoque une permission clé
// (localisation ou notifications) : on le capte à ce moment précis car c'est
// le signal le plus fort de désengagement à venir, et l'utilisateur est encore
// joignable pour répondre — contrairement à une enquête post-désinstallation.
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { submitChurnSurvey } from '../services/EngagementTrackingService';
import CloseButton from './CloseButton';

const REASONS = [
  { id: 'too_many_notifications', label: 'Trop de notifications' },
  { id: 'privacy_concern', label: 'Je ne suis pas à l\'aise avec le partage' },
  { id: 'not_useful', label: 'Ça ne me sert plus' },
  { id: 'other', label: 'Autre raison' },
];

export default function ChurnSurveyModal({ visible, context, onClose }) {
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
            <Text style={styles.thanks}>Merci pour ton retour 🙏</Text>
          ) : (
            <>
              <Text style={styles.title}>Une minute avant de partir ?</Text>
              <Text style={styles.subtitle}>Aide-nous à comprendre pourquoi.</Text>
              {REASONS.map((r) => (
                <TouchableOpacity key={r.id} style={styles.option} onPress={() => handleSelect(r.id)}>
                  <Text style={styles.optionText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.dismiss} onPress={onClose}>
                <Text style={styles.dismissText}>Passer</Text>
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

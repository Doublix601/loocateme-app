// Bannière affichée quand le check-in a été résolu (ou tenté) 100% en local
// via Bluetooth, sans réseau — répond au besoin "comment être sûr d'être
// dans le bon lieu ?" quand la confirmation ne vient pas (encore) du serveur.
// Permet de confirmer/corriger manuellement parmi les lieux du cache local.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribe } from './EventBus';
import { useTheme } from './contexts/ThemeContext';
import { getCachedNearbyVenues } from '../services/NearbyVenueCache';
import { manuallyConfirmVenueOffline, manuallyClearVenueOffline } from '../services/LocationService';

const NONE_ITEM = { id: '__none__', name: 'Je ne suis dans aucun lieu' };

export default function OfflineVenueBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [state, setState] = useState(null); // { kind: 'resolved'|'unresolved', locationId?, name?, candidates? }
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState([]);

  useEffect(() => {
    const unsubResolved = subscribe('ble:local-venue-resolved', ({ locationId, name }) => {
      setState({ kind: 'resolved', locationId, name });
    });
    const unsubUnresolved = subscribe('ble:local-venue-unresolved', async ({ candidates }) => {
      setState({ kind: 'unresolved', candidates: candidates || [] });
      // Relance systématique : on ne se contente pas d'une bannière discrète,
      // on rouvre directement le sélecteur pour vraiment demander à
      // l'utilisateur où il se trouve, à chaque cycle non répondu. Si les
      // candidats stricts (rayon GPS) sont vides, on retombe sur tout le
      // cache local pour laisser une chance de sélection manuelle.
      const list = candidates?.length ? candidates : await getCachedNearbyVenues();
      setPickerCandidates(list);
      setPickerVisible(true);
    });
    // Dès qu'un check-in serveur normal réussit (réseau revenu), la bannière
    // hors-ligne n'a plus lieu d'être.
    const unsubRefresh = subscribe('userlist:refresh', () => setState(null));
    return () => {
      unsubResolved();
      unsubUnresolved();
      unsubRefresh();
    };
  }, []);

  if (!state) return null;

  const openPicker = async () => {
    const cached = state.kind === 'unresolved' && state.candidates?.length ? state.candidates : await getCachedNearbyVenues();
    setPickerCandidates(cached);
    setPickerVisible(true);
  };

  const pick = async (venue) => {
    setPickerVisible(false);
    if (venue.id === NONE_ITEM.id) {
      await manuallyClearVenueOffline();
      setState(null);
      return;
    }
    await manuallyConfirmVenueOffline(venue.id, venue.name);
  };

  const dismiss = () => setState(null);

  return (
    <>
      <View style={[styles.banner, { top: insets.top + 8, backgroundColor: colors.surface, borderColor: '#00c2cb' }]}>
        <View style={{ flex: 1 }}>
          {state.kind === 'resolved' ? (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {state.name ? `Vous semblez être à "${state.name}"` : 'Lieu détecté hors-réseau'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Détection locale via Bluetooth (pas de réseau) — sera confirmée dès que la connexion reviendra.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Impossible de confirmer votre lieu</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Pas de réseau, et aucune détection Bluetooth fiable pour l'instant. Vous pouvez choisir manuellement.
              </Text>
            </>
          )}
          <View style={styles.actions}>
            <TouchableOpacity onPress={openPicker}>
              <Text style={styles.link}>{state.kind === 'resolved' ? "Ce n'est pas le bon lieu" : 'Choisir un lieu'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismiss}>
              <Text style={[styles.link, { color: colors.textSecondary }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Sélectionnez votre lieu</Text>
            <FlatList
              data={[NONE_ITEM, ...pickerCandidates]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => pick(item)}>
                  <Text
                    style={[
                      styles.rowText,
                      { color: item.id === NONE_ITEM.id ? colors.textSecondary : colors.textPrimary },
                      item.id === NONE_ITEM.id && { fontStyle: 'italic' },
                    ]}
                  >
                    {item.name || 'Lieu sans nom'}
                  </Text>
                </TouchableOpacity>
              )}
            />
            {pickerCandidates.length === 0 && (
              <Text style={{ color: colors.textSecondary, padding: 12, fontSize: 12 }}>
                Aucun autre lieu en cache à proximité. Reconnectez-vous au réseau pour rafraîchir la liste.
              </Text>
            )}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setPickerVisible(false)}>
              <Text style={{ color: '#00c2cb', fontWeight: '700' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    zIndex: 999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  link: { color: '#00c2cb', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { maxHeight: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.3)' },
  rowText: { fontSize: 15 },
  closeModalBtn: { alignItems: 'center', paddingVertical: 12 },
});

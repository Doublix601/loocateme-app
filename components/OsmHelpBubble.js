import React, { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { useTheme } from './contexts/ThemeContext';

const OSM_EDIT_URL = 'https://www.openstreetmap.org/edit';
const OSM_TUTO_URL = 'https://learnosm.org/fr/beginner/start-osm/';

// Icône "?" discrète, pensée pour rejoindre les autres boutons du header de
// LocationListScreen (liste + carte, même écran) : ouvre une modale qui
// explique comment corriger un lieu directement sur OpenStreetMap — nos
// données en proviennent, cf. NotFoundModal côté site loocateme_website
// (point 2 de la modale "Je ne trouve pas mon lieu").
export default function OsmHelpBubble({ style }) {
  const { palette } = useVibeTheme();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Comment corriger les informations d'un lieu"
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
        hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
        style={style}
      >
        <Ionicons name="help-circle-outline" size={22} color={palette.textFaint} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: palette.bgElevated, borderColor: palette.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.title, { color: colors.accent }]}>
              🗺️ Un établissement n'est pas à jour ou n'existe pas dans l'app ?
            </Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Nos données proviennent d'OpenStreetMap. Si un établissement est absent ou mal
              référencé, vous pouvez le créer ou le corriger directement, ça profitera à tous les
              utilisateurs de l'app.
            </Text>

            <TouchableOpacity onPress={() => Linking.openURL(OSM_TUTO_URL)} style={styles.linkRow}>
              <Text style={[styles.link, { color: palette.accentAlt }]}>
                📖 Tuto : ajouter un lieu sur OpenStreetMap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(OSM_EDIT_URL)} style={styles.linkRow}>
              <Text style={[styles.link, { color: palette.accentAlt }]}>
                ✏️ Modifier / ajouter un lieu sur OpenStreetMap
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setVisible(false)}
              style={[styles.closeButton, { borderColor: palette.border }]}
            >
              <Text style={[styles.closeButtonText, { color: palette.text }]}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  linkRow: {
    marginBottom: 10,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  closeButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
});

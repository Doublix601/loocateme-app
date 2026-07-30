import React from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVibeTheme } from '../hooks/useVibeTheme';

// Choix direct entre plusieurs lieux dont les pins sont trop proches (voire
// coïncidents) pour se séparer visuellement sur la carte, même au zoom
// maximum — cf. `clusterOpen` posté par assets/map/src/map-app.js.
export default function ClusterPickerModal({ visible, locations, onSelect, onClose }) {
  const { palette, typography, spacing } = useVibeTheme();
  const items = locations || [];

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={[styles.header, { borderBottomColor: palette.border, paddingHorizontal: spacing.lg }]}>
          <Text style={[typography.body, { flex: 1, color: palette.text, fontWeight: '800' }]}>
            Plusieurs lieux ici
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: palette.surface }]}
          >
            <Ionicons name="close" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => String(item._id || item.osmId)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              style={[styles.row, { borderBottomColor: palette.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: palette.text, fontWeight: '700' }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.type ? (
                  <Text style={[typography.caption, { color: palette.textMuted, marginTop: 2 }]}>{item.type}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getLocations } from './ApiRequest';
import { useVibeTheme } from '../hooks/useVibeTheme';

const MAX_DISTANCE_M = 50;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Modal listant les lieux à ≤ 50 m de l'utilisateur, pour corriger un check-in
// mal matché ou pour forcer un check-in manuel (LocationScreen).
export default function NearbyLocationPicker({ visible, lat, lon, onSelect, onClose }) {
  const { palette, typography, spacing } = useVibeTheme();
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || lat == null || lon == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Le forçage de check-in doit proposer TOUS les lieux à proximité, pas
    // uniquement ceux de la vibe courante (getLocations filtre par défaut sur
    // 'sun'/'jour' côté backend) : on interroge les deux vibes et on fusionne.
    Promise.all([
      getLocations({ lat, lon, limit: 40, vibe: 'sun' }),
      getLocations({ lat, lon, limit: 40, vibe: 'moon' }),
    ])
      .then(([sunRes, moonRes]) => {
        if (cancelled) return;
        const byId = new Map();
        for (const loc of [...(sunRes?.locations || []), ...(moonRes?.locations || [])]) {
          if (loc?._id) byId.set(String(loc._id), loc);
        }
        const list = Array.from(byId.values())
          .map((loc) => {
            const [locLon, locLat] = loc.location?.coordinates || [];
            if (locLat == null || locLon == null) return null;
            const distance = haversineMeters(lat, lon, locLat, locLon);
            return { ...loc, distance };
          })
          .filter((loc) => loc && loc.distance <= MAX_DISTANCE_M)
          .sort((a, b) => a.distance - b.distance);
        setPlaces(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Erreur');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, lat, lon]);

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={[styles.header, { borderBottomColor: palette.border, paddingHorizontal: spacing.lg }]}>
          <Text style={[typography.body, { flex: 1, color: palette.text, fontWeight: '800' }]}>
            Lieux autour de toi
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: palette.surface }]}
          >
            <Ionicons name="close" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={36} color={palette.textFaint} />
            <Text style={[typography.body, { color: palette.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
              Impossible de charger les lieux proches.
            </Text>
          </View>
        ) : places.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="location-outline" size={36} color={palette.textFaint} />
            <Text style={[typography.body, { color: palette.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
              Aucun lieu à moins de {MAX_DISTANCE_M} m de toi.
            </Text>
          </View>
        ) : (
          <FlatList
            data={places}
            keyExtractor={(item) => String(item._id)}
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
                  <Text style={[typography.caption, { color: palette.textMuted, marginTop: 2 }]}>
                    {item.type} · {Math.round(item.distance)} m
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
              </TouchableOpacity>
            )}
          />
        )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

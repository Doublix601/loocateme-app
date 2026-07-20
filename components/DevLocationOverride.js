import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import {
  loadDevLocationOverride,
  getDevLocationOverride,
  setDevLocationOverride,
} from '../utils/devLocationOverride';

// Bouton flottant + modal (__DEV__ uniquement) pour forcer une position GPS
// manuelle quand le fused location provider de l'émulateur ne répond pas.
export default function DevLocationOverride() {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    loadDevLocationOverride().then((coords) => {
      setActive(coords);
      if (coords) {
        setLat(String(coords.latitude));
        setLon(String(coords.longitude));
      }
    });
  }, []);

  if (!__DEV__) return null;

  const save = async () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;
    await setDevLocationOverride({ latitude, longitude });
    setActive({ latitude, longitude });
    setVisible(false);
  };

  const clear = async () => {
    await setDevLocationOverride(null);
    setActive(null);
    setLat('');
    setLon('');
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={{
          position: 'absolute',
          bottom: 100,
          right: 16,
          backgroundColor: active ? '#ff9500' : '#333',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 20,
          opacity: 0.85,
          zIndex: 9999,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
          {active ? '📍 GPS override ON' : '📍 GPS override'}
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Position GPS manuelle (dev)</Text>
            <TextInput
              placeholder="Latitude (ex: 49.4178)"
              value={lat}
              onChangeText={setLat}
              keyboardType="numeric"
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 8 }}
            />
            <TextInput
              placeholder="Longitude (ex: 2.8261)"
              value={lon}
              onChangeText={setLon}
              keyboardType="numeric"
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => setVisible(false)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text>Annuler</Text>
              </TouchableOpacity>
              {active ? (
                <TouchableOpacity onPress={clear} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: '#ff3b30' }}>Désactiver</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={save} style={{ backgroundColor: '#00c2cb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Appliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

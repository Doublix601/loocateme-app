import React, { useEffect, useRef } from 'react';
import { View, Modal, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VideoView } from 'expo-video';
import { useVibeTheme } from '../hooks/useVibeTheme';

/**
 * Lecteur plein écran pour la vidéo d'un événement. Réutilise le même
 * player que l'aperçu muet de EventCard (pas de second player) : ce
 * composant se contente d'afficher la vidéo avec une barre de progression
 * en lecture seule (pas de pause/seek), même pattern que StoryViewerModal.
 */
export default function EventVideoViewerModal({ visible, player, onClose }) {
  const insets = useSafeAreaInsets();
  const { spacing } = useVibeTheme();
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !player) return undefined;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (player.duration > 0) progressAnim.setValue(Math.min(1, currentTime / player.duration));
    });
    return () => sub?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, player]);

  if (!player) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        {/* Un <SafeAreaView> imbriqué dans un <Modal> RN ne récupère pas les
            bons insets sur iOS : on utilise useSafeAreaInsets() directement
            dans ce composant plutôt que de le faire remonter depuis EventCard. */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + spacing.sm,
            left: 0,
            right: 0,
            paddingHorizontal: spacing.md,
          }}
        >
          <View
            style={{
              height: 3,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.35)',
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={{
                height: '100%',
                backgroundColor: '#fff',
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }}
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: insets.top + spacing.lg, right: spacing.lg }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, TouchableOpacity, Image, Animated, StyleSheet, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

const PHOTO_DURATION_MS = 5000;
// Seuil de swipe vertical (px) à partir duquel on ferme la visionneuse.
const DISMISS_THRESHOLD = 120;

// Une story à la fois : la vidéo n'est instanciée (useVideoPlayer) que pour la
// story actuellement affichée, remontée à chaque changement d'index (`key`
// sur le parent) pour éviter de garder N lecteurs vidéo en mémoire.
function StorySlide({ story, onDone, progressAnim }) {
  const isVideo = story?.mediaType === 'video';
  const player = useVideoPlayer(isVideo ? story.url : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!isVideo) return undefined;
    player.play();
    const sub = player.addListener('playToEnd', onDone);
    return () => {
      sub?.remove();
      player.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, player]);

  useEffect(() => {
    if (!isVideo) return undefined;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (player.duration > 0) progressAnim.setValue(Math.min(1, currentTime / player.duration));
    });
    return () => sub?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, player]);

  useEffect(() => {
    if (isVideo) return undefined;
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: PHOTO_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  if (isVideo) {
    return (
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />
    );
  }
  return <Image source={{ uri: story.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />;
}

/**
 * StoryViewerModal — lecteur plein écran des stories d'un lieu.
 *
 *  - Photo : avance auto après PHOTO_DURATION_MS, barre de progression animée.
 *  - Vidéo : avance auto à la fin de lecture, progression pilotée par la
 *    position de lecture réelle.
 *  - Tap gauche/droite : story précédente/suivante.
 *  - Swipe vers le bas : ferme la visionneuse (en plus du bouton croix).
 */
export default function StoryViewerModal({ stories, initialIndex = 0, onClose, insetsTop = 0, spacing }) {
  const [index, setIndex] = useState(initialIndex);
  const progressAnimsRef = useRef(stories.map(() => new Animated.Value(0)));
  const pan = useRef(new Animated.Value(0)).current;

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < stories.length - 1) return i + 1;
      onClose();
      return i;
    });
  }, [stories.length, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  useEffect(() => {
    progressAnimsRef.current.forEach((anim, i) => {
      if (i < index) anim.setValue(1);
      else if (i > index) anim.setValue(0);
    });
  }, [index]);

  const panResponder = useRef(
    PanResponder.create({
      // Capture uniquement sur un glissement clairement vertical : laisse les
      // taps gauche/droite (prev/next) et le bouton croix fonctionner normalement.
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) pan.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD) {
          onClose();
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const story = stories[index];
  if (!story) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={{ flex: 1, backgroundColor: '#000', transform: [{ translateY: pan }] }}
        {...panResponder.panHandlers}
      >
        <StorySlide
          key={story._id || index}
          story={story}
          onDone={goNext}
          progressAnim={progressAnimsRef.current[index]}
        />
        {/* Un <SafeAreaView> imbriqué dans un <Modal> RN ne récupère pas les
            bons insets sur iOS (le Modal rend hors de l'arbre mesuré par
            SafeAreaProvider) : on réutilise insetsTop, calculé par le parent
            via useSafeAreaInsets() en dehors du Modal. */}
        <View
          style={{
            position: 'absolute',
            top: insetsTop + spacing.sm,
            left: 0,
            right: 0,
            flexDirection: 'row',
            paddingHorizontal: spacing.md,
          }}
        >
          {stories.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                marginHorizontal: 2,
                backgroundColor: 'rgba(255,255,255,0.35)',
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  height: '100%',
                  backgroundColor: '#fff',
                  width: progressAnimsRef.current[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </View>
          ))}
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: insetsTop + spacing.lg, right: spacing.lg }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={goPrev} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%' }} />
        <TouchableOpacity onPress={goNext} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '65%' }} />
      </Animated.View>
    </Modal>
  );
}

import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Seuil de déplacement (px) en dessous duquel un appui long relâché sans
// vraiment déplacer l'icône est traité comme un appui long "classique"
// (ouvre la modale d'édition) plutôt que comme un drag terminé sur place.
const DRAG_THRESHOLD = 8;

/**
 * DraggableSocialTile — une icône de réseau social repositionnable par
 * appui long + glisser (à la façon des icônes d'app sur un téléphone).
 * Le positionnement se fait en absolu (x/y calculés par le parent
 * SocialGrid à partir de l'index courant dans l'ordre) pour permettre à la
 * tuile déplacée de suivre le doigt au pixel près pendant que les autres
 * s'animent vers leur nouvelle place.
 */
const DraggableSocialTile = ({
  item,
  x,
  y,
  size,
  isDragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
  onLongPressNoMove,
}) => {
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);
  const scale = useSharedValue(1);
  const draggingRef = useRef(false);

  // Dernière position de repos (case de la grille) connue pour cette tuile,
  // toujours tenue à jour (même pendant un drag) afin que le relâchement du
  // geste puisse la faire "claquer" dans sa case sans dépendre d'un re-rendu
  // ultérieur du composant.
  const targetX = useSharedValue(x);
  const targetY = useSharedValue(y);

  // Suit la position "de repos" calculée par le parent tant que la tuile
  // n'est pas activement déplacée (elle-même pilotée par le geste).
  useEffect(() => {
    targetX.value = x;
    targetY.value = y;
    if (draggingRef.current) return;
    translateX.value = withTiming(x, { duration: 220 });
    translateY.value = withTiming(y, { duration: 220 });
  }, [x, y]);

  const startX = useSharedValue(x);
  const startY = useSharedValue(y);

  const setDragging = (val) => {
    draggingRef.current = val;
  };

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      scale.value = withSpring(1.12);
      runOnJS(setDragging)(true);
      runOnJS(onDragStart)(item);
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
      runOnJS(onDragMove)(item, translateX.value, translateY.value, size);
    })
    .onEnd((e) => {
      // Toujours reclaquer la tuile dans sa case de grille (targetX/Y, tenue
      // à jour en continu via l'effet ci-dessus) : la position suivait le
      // doigt pendant le drag, elle ne doit jamais rester "libre".
      translateX.value = withSpring(targetX.value);
      translateY.value = withSpring(targetY.value);
      scale.value = withSpring(1);
      const moved = Math.abs(e.translationX) + Math.abs(e.translationY) > DRAG_THRESHOLD;
      runOnJS(setDragging)(false);
      if (moved) {
        runOnJS(onDragEnd)(item);
      } else {
        runOnJS(onLongPressNoMove)(item);
        runOnJS(onDragEnd)(item);
      }
    });

  const tapGesture = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(onPress)(item);
  });

  const composed = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: translateX.value,
    top: translateY.value,
    width: size,
    height: size,
    zIndex: isDragging ? 20 : 1,
    elevation: isDragging ? 8 : 0,
    transform: [{ scale: scale.value }],
  }));

  const icon = item.icon;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.tile, animatedStyle]}>
        <Image source={icon} style={{ width: size * 0.85, height: size * 0.85, resizeMode: 'contain' }} />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
});

export default DraggableSocialTile;

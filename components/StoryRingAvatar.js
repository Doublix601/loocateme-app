import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Canvas, Circle, SweepGradient, vec, BlurMask } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  useDerivedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import ImageWithPlaceholder from './ImageWithPlaceholder';

/**
 * StoryRingAvatar
 *
 * Anneau façon Instagram autour de la photo de profil d'un lieu, indiquant la
 * présence de stories actives :
 *  - state === 'none'   : aucune story active, pas d'anneau (avatar nu).
 *  - state === 'unseen' : anneau dégradé coloré, animé en mode Moon (même
 *    technique Skia+Reanimated que SocialPulseAvatar), statique en mode Sun.
 *  - state === 'seen'   : anneau gris/atténué statique (convention Instagram :
 *    stories déjà consultées).
 *
 * Tap → onPress (ouvre la visionneuse de stories sur la première story active).
 */
const StoryRingAvatar = ({ uri, size = 80, state = 'none', isMoon = false, gradient, onPress }) => {
  const hasRing = state !== 'none';
  const isUnseen = state === 'unseen';
  // Anneau nettement plus épais tant que la story n'a pas été vue, pour que
  // le signal saute aux yeux au premier coup d'œil (seul point d'entrée désormais).
  const ringWidth = isUnseen ? (isMoon ? 4.5 : 4) : isMoon ? 3 : 2.5;
  const ringOuterSize = size + ringWidth * 2;
  const canvasSize = ringOuterSize + (isMoon ? 8 : 4) + (isUnseen ? 6 : 0); // padding pour le glow Skia
  const containerSize = hasRing ? canvasSize : size;
  const center = canvasSize / 2;
  const radius = (size + ringWidth) / 2;

  const colors = useMemo(
    () => (gradient && gradient.length > 1 ? gradient : ['#FF3DAD', '#8A4BFF', '#3DA9FF']),
    [gradient],
  );

  const phase = useSharedValue(0);
  React.useEffect(() => {
    if (!isMoon || state !== 'unseen') return;
    phase.value = withRepeat(withTiming(phase.value + 1, { duration: 6000, easing: Easing.linear }), -1, false);
  }, [isMoon, state, phase]);

  const transform = useDerivedValue(() => [{ rotate: phase.value * 2 * Math.PI }]);

  // Petite pulsation d'échelle sur le badge de notification (non-vu), pour
  // attirer l'œil sans dépendre de Skia (fonctionne aussi en mode Sun).
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (!isUnseen) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [isUnseen, pulse]);
  const badgeAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const ringOffset = (containerSize - ringOuterSize) / 2;
  const photoOffset = (containerSize - size) / 2;

  const renderRing = () => {
    if (!hasRing) return null;

    if (state === 'unseen' && isMoon) {
      return (
        <Canvas style={{ width: canvasSize, height: canvasSize, position: 'absolute', top: 0, left: 0 }}>
          <Circle cx={center} cy={center} r={radius + 3} color={colors[0]} opacity={0.45}>
            <BlurMask blur={9} style="normal" />
          </Circle>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            style="stroke"
            strokeWidth={ringWidth}
            origin={vec(center, center)}
            transform={transform}
          >
            <SweepGradient c={vec(center, center)} colors={colors} />
          </Circle>
        </Canvas>
      );
    }

    if (state === 'unseen' && !isMoon) {
      // Mode Sun : anneau statique mais avec halo lumineux pour rester
      // repérable au premier coup d'œil (pas d'animation Skia en Sun).
      return (
        <Canvas style={{ width: canvasSize, height: canvasSize, position: 'absolute', top: 0, left: 0 }}>
          <Circle cx={center} cy={center} r={radius + 2} color={colors[0]} opacity={0.3}>
            <BlurMask blur={7} style="normal" />
          </Circle>
          <Circle cx={center} cy={center} r={radius} style="stroke" strokeWidth={ringWidth}>
            <SweepGradient c={vec(center, center)} colors={colors} />
          </Circle>
        </Canvas>
      );
    }

    // Anneau statique restant : "vu" (gris atténué). Le cas "non vu" est
    // toujours géré par les branches Canvas ci-dessus (halo Sun/Moon).
    const borderColor = isMoon ? 'rgba(255,255,255,0.28)' : 'rgba(14,17,22,0.16)';

    return (
      <View
        style={[
          styles.ringStatic,
          {
            top: ringOffset,
            left: ringOffset,
            width: ringOuterSize,
            height: ringOuterSize,
            borderRadius: ringOuterSize / 2,
            borderWidth: ringWidth,
            borderColor,
          },
        ]}
      />
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={{ width: containerSize, height: containerSize }}
    >
      {renderRing()}
      <View
        style={{
          position: 'absolute',
          top: photoOffset,
          left: photoOffset,
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: '#222',
        }}
      >
        <ImageWithPlaceholder uri={uri} style={{ width: '100%', height: '100%' }} />
      </View>
      {isUnseen && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.unseenBadge,
            {
              top: photoOffset - 2,
              right: photoOffset - 2,
              backgroundColor: colors[0],
              borderColor: isMoon ? '#0E1116' : '#fff',
            },
            badgeAnimatedStyle,
          ]}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  ringStatic: {
    position: 'absolute',
  },
  unseenBadge: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
});

export default StoryRingAvatar;

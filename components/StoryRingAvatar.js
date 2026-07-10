import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Canvas, Circle, SweepGradient, vec, BlurMask } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
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
const StoryRingAvatar = ({
  uri,
  size = 80,
  state = 'none',
  isMoon = false,
  gradient,
  onPress,
}) => {
  const hasRing = state !== 'none';
  const ringWidth = isMoon ? 3 : 2.5;
  const ringOuterSize = size + ringWidth * 2;
  const canvasSize = ringOuterSize + (isMoon ? 8 : 4); // padding pour le glow Skia
  const containerSize = hasRing ? canvasSize : size;
  const center = canvasSize / 2;
  const radius = (size + ringWidth) / 2;

  const colors = useMemo(
    () => (gradient && gradient.length > 1 ? gradient : ['#FF3DAD', '#8A4BFF', '#3DA9FF']),
    [gradient]
  );

  const phase = useSharedValue(0);
  React.useEffect(() => {
    if (!isMoon || state !== 'unseen') return;
    phase.value = withRepeat(
      withTiming(phase.value + 1, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
  }, [isMoon, state, phase]);

  const transform = useDerivedValue(() => [{ rotate: phase.value * 2 * Math.PI }]);

  const ringOffset = (containerSize - ringOuterSize) / 2;
  const photoOffset = (containerSize - size) / 2;

  const renderRing = () => {
    if (!hasRing) return null;

    if (state === 'unseen' && isMoon) {
      return (
        <Canvas style={{ width: canvasSize, height: canvasSize, position: 'absolute', top: 0, left: 0 }}>
          <Circle cx={center} cy={center} r={radius + 2} color={colors[0]} opacity={0.35}>
            <BlurMask blur={6} style="normal" />
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

    // Anneau statique : "vu" (gris atténué), ou "non vu" en mode Sun (plein, coloré).
    const borderColor =
      state === 'seen'
        ? (isMoon ? 'rgba(255,255,255,0.28)' : 'rgba(14,17,22,0.16)')
        : colors[0];

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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  ringStatic: {
    position: 'absolute',
  },
});

export default StoryRingAvatar;

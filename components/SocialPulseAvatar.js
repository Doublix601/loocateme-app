import React, { useMemo } from 'react';
import { View, StyleSheet, Image, Text, TouchableOpacity } from 'react-native';
import { Canvas, Circle, SweepGradient, vec, BlurMask } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';

const STATUS_COLORS = {
  green: '#4CAF50',
  orange: '#FF9800',
  red: '#F44336',
};

/**
 * SocialPulseAvatar
 *
 * Avatar circulaire premium avec bordure adaptative :
 *  - Mode SUN : anneau plein couleur statut (vert/orange/rouge), ombre douce.
 *  - Mode MOON : SweepGradient Skia néon (rose/bleu LoocateMe) animé en phase
 *    angulaire. Aucun "rectangle qui tourne" : seule la phase du SweepGradient
 *    est animée, le cercle reste statique.
 *
 *  Statut → glow couleur lorsqu'en mode MOON (tâche : signaler la disponibilité).
 */
const SocialPulseAvatar = ({
  user,
  size = 64,
  onPress,
  isMoon = false,
  index = 0,
}) => {
  const status = user?.status || 'green';
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.green;
  const isBoosted = user?.boostUntil && new Date(user.boostUntil) > new Date();
  const cotePercent = user?.cotePercent ?? 100;

  const ringWidth = isMoon ? 3 : 2.5;
  const canvasSize = size + ringWidth * 2 + (isMoon ? 8 : 4); // padding pour glow
  const center = canvasSize / 2;
  const radius = (size + ringWidth) / 2;

  // Animation Skia : phase angulaire du SweepGradient.
  const phase = useSharedValue(0);
  React.useEffect(() => {
    if (!isMoon) return;
    phase.value = (index % 5) * 0.2;
    phase.value = withRepeat(
      withTiming(phase.value + 1, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
  }, [isMoon, index, phase]);

  // Skia ne peut pas lire directement les SV — on calcule via useDerivedValue.
  const colors = useMemo(
    () => (isBoosted
      ? ['#FFD700', '#FFA500', '#FFD700', '#FFA500', '#FFD700']
      : ['#2DBDFF', '#FF3DAD', '#8A4BFF', '#2DBDFF', '#FF3DAD', '#2DBDFF']
    ),
    [isBoosted]
  );

  const transform = useDerivedValue(() => [
    { rotate: phase.value * 2 * Math.PI },
  ]);

  const renderRing = () => {
    if (isMoon) {
      return (
        <Canvas style={{ width: canvasSize, height: canvasSize, position: 'absolute', top: 0, left: 0 }}>
          {/* Glow externe doux */}
          <Circle cx={center} cy={center} r={radius + 2} color={isBoosted ? '#FFD700' : '#FF3DAD'} opacity={0.35}>
            <BlurMask blur={6} style="normal" />
          </Circle>
          {/* Anneau néon avec SweepGradient animé */}
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
    // SUN : anneau plein statique
    return (
      <View
        style={[
          styles.ringSun,
          {
            width: size + ringWidth * 2,
            height: size + ringWidth * 2,
            borderRadius: (size + ringWidth * 2) / 2,
            borderWidth: ringWidth,
            borderColor: isBoosted ? '#FFD700' : statusColor,
          },
        ]}
      />
    );
  };

  const photoOffset = (canvasSize - size) / 2;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ alignItems: 'center', width: canvasSize }}>
      <View style={{ width: canvasSize, height: canvasSize }}>
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
          {user?.profileImageUrl || user?.photo ? (
            <Image
              source={{ uri: user.profileImageUrl || user.photo }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {(user?.customName || user?.username || '?')[0]?.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {/* Status dot — petit point clarifiant en mode SUN comme en MOON */}
        <View
          style={{
            position: 'absolute',
            bottom: photoOffset - 2,
            right: photoOffset - 2,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: statusColor,
            borderWidth: 2,
            borderColor: isMoon ? '#050505' : '#FFFFFF',
          }}
        />
        {/* Badge Cote — flamme visible uniquement pour les users à 100% */}
        {cotePercent === 100 && (
          <View
            style={{
              position: 'absolute',
              top: photoOffset - 4,
              left: photoOffset - 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#050505',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 11 }}>🔥</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  ringSun: {
    position: 'absolute',
    top: 2,
    left: 2,
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#3A3A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
});

export default SocialPulseAvatar;

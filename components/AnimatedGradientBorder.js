import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  RoundedRect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  useDerivedValue,
} from 'react-native-reanimated';

/**
 * AnimatedGradientBorder
 *
 * Bordure animée néon « path-based » qui se superpose EXACTEMENT à la carte
 * enfant, sans déborder et en respectant ses border-radius.
 *
 * Stratégie :
 *  - Le wrapper n'ajoute aucune marge ni padding qui altérerait le layout
 *    de la carte. La carte enfant continue de gérer son propre espacement.
 *  - On clone l'enfant pour neutraliser, le temps du rendu, sa `marginBottom`
 *    (déplacée sur le wrapper) ainsi que tout `borderWidth/borderColor`
 *    statique qui entrerait en conflit avec la bordure animée.
 *  - Le `Canvas` Skia est `absoluteFill` au-dessus de la carte clonée :
 *    il couvre donc PILE le rectangle visible de la carte, ni plus ni moins.
 *  - On dessine un `RoundedRect` STATIQUE en stroke avec exactement le même
 *    `borderRadius` que la carte → la bordure suit parfaitement les coins
 *    arrondis, sans débordement, sans angles vifs visibles.
 *  - Seule la phase angulaire du `SweepGradient` est animée : les couleurs
 *    (Bleu / Rose LoocateMe) « circulent » le long de la bordure de façon
 *    fluide et continue. La palette est bouclée → aucun hard-edge au
 *    point de recollement 0°/360°.
 *  - Chaque carte reçoit un `index` qui sert de phase de départ déterministe
 *    → désynchronisation visuelle entre les cartes de la liste.
 */
const AnimatedGradientBorder = ({
  children,
  // Palette LoocateMe (Bleu / Rose), bouclée pour éviter toute coupure visuelle.
  colors = ['#2dbdff', '#ff2da8', '#2dbdff', '#ff2da8', '#2dbdff'],
  borderWidth = 2,
  // DOIT correspondre au borderRadius réel de la carte enfant (ex: 20).
  borderRadius = 20,
  index = 0,
  active = true,
  durationMs = 8000,
  // marginBottom à appliquer SUR LE WRAPPER (déplacée depuis l'enfant pour
  // éviter que le Canvas absoluteFill n'inclue l'espacement vertical).
  marginBottom = 16,
  style,
}) => {
  // Phase de départ déterministe (0..1) pour désynchroniser les cartes.
  const seed = useMemo(() => {
    const base = Number.isFinite(index) ? Math.abs(index % 100) / 100 : Math.random();
    return base;
  }, [index]);

  const progress = useSharedValue(seed);

  useEffect(() => {
    if (active) {
      progress.value = seed;
      progress.value = withRepeat(
        withTiming(seed + 1, { duration: durationMs, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(progress);
    }
    return () => {
      cancelAnimation(progress);
    };
  }, [active, durationMs, seed]);

  // Taille mesurée du wrapper (= taille de la carte, puisque le wrapper colle
  // à la carte sans padding ni margin interne).
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  }, [size.width, size.height]);

  // Offset angulaire (en degrés) qui « fait circuler » les couleurs autour
  // du chemin. start/end sont espacés de 360° pour couvrir l'intégralité
  // de la circonférence en boucle continue.
  const startAngle = useDerivedValue(() => (progress.value % 1) * 360);
  const endAngle = useDerivedValue(() => (progress.value % 1) * 360 + 360);

  const cx = size.width / 2;
  const cy = size.height / 2;

  // Le stroke Skia est centré sur le path : on rétracte le rect de
  // borderWidth/2 pour que la bordure reste strictement à l'intérieur du
  // rectangle de la carte (épaisseur constante, pas de débordement).
  const half = borderWidth / 2;
  const rectX = half;
  const rectY = half;
  const rectW = Math.max(0, size.width - borderWidth);
  const rectH = Math.max(0, size.height - borderWidth);
  const rectR = Math.max(0, borderRadius - half);

  // Clone de l'enfant : on neutralise sa marginBottom (déplacée sur le wrapper)
  // et tout borderWidth statique qui se cumulerait avec la bordure animée.
  // On force aussi le borderRadius pour garantir l'alignement parfait.
  const child = React.isValidElement(children)
    ? React.cloneElement(children, {
        style: [
          children.props.style,
          {
            marginBottom: 0,
            marginTop: 0,
            borderWidth: 0,
            borderColor: 'transparent',
            borderRadius,
          },
        ],
      })
    : children;

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.wrapper, { marginBottom, borderRadius }, style]}
    >
      {child}

      {/* Canvas Skia superposé pile sur la carte (absoluteFill).
          Le path est strictement statique : seule la phase du gradient
          est animée → pas de "rectangle qui tourne", pas de vide aux coins,
          pas de débordement. */}
      {size.width > 0 && size.height > 0 && (
        <Canvas
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <RoundedRect
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            r={rectR}
            style="stroke"
            strokeWidth={borderWidth}
            strokeJoin="round"
            strokeCap="round"
          >
            <SweepGradient
              c={vec(cx, cy)}
              colors={colors}
              start={startAngle}
              end={endAngle}
            />
          </RoundedRect>
        </Canvas>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
});

export default AnimatedGradientBorder;

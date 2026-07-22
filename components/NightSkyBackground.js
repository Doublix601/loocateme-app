import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from './vibe/StarField';
import ShootingStar from './vibe/ShootingStar';

/**
 * Fond animé "mode nuit" : ciel sombre dégradé, étoiles scintillantes,
 * et étoiles filantes occasionnelles traversant l'écran en diagonale.
 *
 * Drop-in : accepte `style` (par défaut StyleSheet.absoluteFill) et
 * `pointerEvents` (par défaut "none").
 */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function NightSkyBackground({ style, pointerEvents = 'none', starCount = 60, shootingStars = 2 }) {
  const shooters = useMemo(() => {
    const arr = [];
    for (let i = 0; i < shootingStars; i += 1) arr.push(i);
    return arr;
  }, [shootingStars]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrapper, style]} pointerEvents={pointerEvents}>
      <LinearGradient
        colors={['#0B1026', '#1B2735']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Voile bleuté très subtil en haut pour donner de la profondeur */}
      <LinearGradient
        colors={['rgba(40,70,130,0.25)', 'rgba(0,0,0,0)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      {/* Étoiles scintillantes */}
      <StarField count={starCount} width={SCREEN_W} height={SCREEN_H} />
      {/* Étoiles filantes occasionnelles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {shooters.map((i) => (
          <ShootingStar key={`shoot-${i}`} seed={i} screenWidth={SCREEN_W} screenHeight={SCREEN_H} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
});

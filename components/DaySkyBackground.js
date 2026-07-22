import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SunDisk from './vibe/SunDisk';
import CloudBand from './vibe/CloudBand';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * Fond animé du mode jour, version sobre/atmosphérique :
 * - Ciel : dégradé doux, légèrement désaturé, avec une nuance chaude diffuse.
 * - Soleil : disque lumineux discret + halo qui respire lentement (pas de rayons cartoon).
 * - Nuages : bandes wispy horizontales en parallaxe lente (pas de bulles rondes).
 * - Brume atmosphérique très légère en bas.
 *
 * Drop-in replacement d'un LinearGradient :
 *   <DaySkyBackground style={skyFillStyle} />
 */
export default function DaySkyBackground({ style, pointerEvents = 'none' }) {
  return (
    <View style={[styles.fill, style]} pointerEvents={pointerEvents}>
      {/* Ciel : dégradé doux, du bleu pâle haut vers un bleu plus dense bas */}
      <LinearGradient
        colors={['#C9E3F2', '#A7CFE6', '#8FBDD9']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Voile chaud diffus côté soleil (vers le haut-droit) */}
      <LinearGradient
        colors={['rgba(255, 224, 178, 0.35)', 'rgba(255, 224, 178, 0)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.7 }}
        pointerEvents="none"
      />

      {/* Soleil : halo doux + disque diffus, sans rayons */}
      <SunDisk size={SUN_SIZE} top={SUN_TOP} right={SUN_RIGHT} />

      {/* Nuages wispy en bandes (parallaxe lente) */}
      <CloudBand topRatio={0.1} scale={1.0} duration={120000} delay={0} opacity={0.55} />
      <CloudBand topRatio={0.22} scale={0.75} duration={150000} delay={-40000} opacity={0.4} />
      <CloudBand topRatio={0.36} scale={1.25} duration={180000} delay={-80000} opacity={0.5} />
      <CloudBand topRatio={0.52} scale={0.9} duration={160000} delay={-30000} opacity={0.35} />
      <CloudBand topRatio={0.66} scale={1.1} duration={200000} delay={-120000} opacity={0.3} />

      {/* Brume atmosphérique très subtile en bas */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)']}
        style={styles.haze}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
    </View>
  );
}

const SUN_SIZE = 96;
const SUN_TOP = 60;
const SUN_RIGHT = 36;

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  haze: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H * 0.28,
  },
});

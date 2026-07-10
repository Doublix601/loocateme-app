import React, { useState, useRef, useEffect } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { proxifyImageUrl } from './ServerUtils';

// Lightweight skeleton/placeholder for images, with an animated shimmer sweep
// pendant le chargement (au lieu d'un simple spinner, pour une sensation plus
// fluide sur les connexions lentes).
export default function ImageWithPlaceholder({ uri, style, placeholderColor = '#e1e1e1', resizeMode = 'cover', children }) {
  const [loading, setLoading] = useState(!!uri);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(0);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const finalUri = uri ? proxifyImageUrl(uri) : null;

  useEffect(() => {
    if (!loading) return;
    shimmerAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [loading, shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  const borderRadius = style?.borderRadius || 0;

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {finalUri && !error ? (
        <Image
          source={{ uri: finalUri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode={resizeMode}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor, borderRadius }]} />
      )}
      {loading && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor, borderRadius, overflow: 'hidden' }]}>
          {width > 0 && (
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
});

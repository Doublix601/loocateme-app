import React, { useState } from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { proxifyImageUrl } from './ServerUtils';

// Lightweight skeleton/placeholder for images
export default function ImageWithPlaceholder({ uri, style, placeholderColor = '#e1e1e1', indicatorColor = '#888', resizeMode = 'cover', children }) {
  const [loading, setLoading] = useState(!!uri);
  const [error, setError] = useState(false);

  const finalUri = uri ? proxifyImageUrl(uri) : null;

  return (
    <View style={[styles.container, style]}>
      {finalUri && !error ? (
        <Image
          source={{ uri: finalUri }}
          style={[StyleSheet.absoluteFill, { borderRadius: style?.borderRadius || 0 }]}
          resizeMode={resizeMode}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor, borderRadius: style?.borderRadius || 0 }]} />
      )}
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={indicatorColor} />
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

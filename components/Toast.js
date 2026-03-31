import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, View, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Toast = ({ message, visible, onHide, duration = 4000 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => {
            setShouldRender(false);
            if (onHide) onHide();
          });
        }, duration);
      });
    }
  }, [visible]);

  if (!shouldRender) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.toast}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    maxWidth: width - 40,
  },
  message: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default Toast;

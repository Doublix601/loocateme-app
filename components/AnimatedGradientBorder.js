import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

const AnimatedGradientBorder = ({
  children,
  colors = ['#00c2cb', '#00c2cb', '#ffffff', '#00c2cb', '#00c2cb'],
  borderWidth = 2,
  borderRadius = 16,
}) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 4000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return (
    <View style={[styles.outerContainer, { borderRadius: borderRadius + borderWidth, padding: borderWidth }]}>
      <View style={[styles.gradientContainer, { borderRadius: borderRadius + borderWidth }]}>
        <Animated.View style={[styles.animatedBox, animatedStyle]}>
          <LinearGradient
            colors={colors}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      </View>
      <View style={[styles.innerContent, { borderRadius }]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16, // Match the original margin of LocationItem
  },
  gradientContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  animatedBox: {
    width: '200%',
    height: '200%',
  },
  gradient: {
    flex: 1,
  },
  innerContent: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});

export default AnimatedGradientBorder;

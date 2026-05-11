import React from 'react';
import { TouchableOpacity, StyleSheet, View, ActivityIndicator } from 'react-native';
import { useTheme } from './contexts/ThemeContext';
import ThemedText from './ThemedText';
import { Ionicons } from '@expo/vector-icons';

const SocialAuthButton = ({ type, onPress, loading, disabled }) => {
  const { isDark } = useTheme();
  const isApple = type === 'apple';

  const config = {
    apple: {
      icon: 'logo-apple',
      text: 'Continuer avec Apple',
      backgroundColor: isDark ? '#FFFFFF' : '#000000',
      textColor: isDark ? '#000000' : '#FFFFFF',
    },
    google: {
      icon: 'logo-google',
      text: 'Continuer avec Google',
      backgroundColor: isDark ? '#333333' : '#FFFFFF',
      textColor: isDark ? '#FFFFFF' : '#333333',
      border: isDark ? 'transparent' : '#DDD',
    }
  };

  const current = config[type];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      style={[
        styles.button,
        {
          backgroundColor: current.backgroundColor,
          borderColor: current.border || 'transparent',
          borderWidth: current.border ? 1 : 0,
        }
      ]}
    >
      {loading ? (
        <ActivityIndicator color={current.textColor} />
      ) : (
        <View style={styles.content}>
          <Ionicons name={current.icon} size={20} color={current.textColor} style={styles.icon} />
          <ThemedText style={[styles.text, { color: current.textColor }]}>
            {current.text}
          </ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SocialAuthButton;

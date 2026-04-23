import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { useTheme } from '../components/contexts/ThemeContext';

/**
 * PremiumGate Component
 * Protects premium features by showing a "Premium Required" placeholder or redirecting to paywall.
 */
export const PremiumGate = ({ children, featureName = 'cette fonctionnalité', style }) => {
  const { isPremium, effectiveStatisticsEnabled } = usePremiumAccess();
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, style]}>
      <Text style={[styles.title, { color: isDark ? '#fff' : colors.text }]}>
        💎 Fonctionnalité Premium
      </Text>
      <Text style={[styles.description, { color: isDark ? '#ccc' : colors.textSecondary }]}>
        Devenez membre Premium pour accéder à {featureName}.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('PremiumPaywall')}
      >
        <Text style={styles.buttonText}>En savoir plus</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.2)',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#00c2cb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

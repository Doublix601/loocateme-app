import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';

const { width } = Dimensions.get('window');

const ShareLocationNudge = ({ colors, isDark, activating, onActivate, onDismiss }) => {
  return (
    <View style={[styles.card, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <Text style={[styles.title, { color: colors.accent }]}>📍 Partage ta position</Text>
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        Active le partage de ton lieu actuel pour être plus facilement repéré·e par les autres utilisateurs
        à proximité.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.activateButton, { backgroundColor: colors.accent }]}
          onPress={onActivate}
          disabled={activating}
          activeOpacity={0.85}
        >
          {activating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.activateText}>Activer</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} disabled={activating} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.dismissText, { color: colors.textSecondary }]}>Non merci</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: width * 0.05,
    fontWeight: '700',
    marginBottom: 6,
  },
  text: {
    fontSize: width * 0.042,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 16,
  },
  activateButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  activateText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: width * 0.04,
  },
  dismissText: {
    fontSize: width * 0.038,
    textDecorationLine: 'underline',
  },
});

export default ShareLocationNudge;

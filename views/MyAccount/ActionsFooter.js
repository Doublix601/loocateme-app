import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const ActionsFooter = ({ colors, isDark, onShare, onShowQr, onOpenStats }) => {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: isDark ? 'rgba(0, 194, 203, 0.1)' : 'rgba(0, 194, 203, 0.05)' },
      ]}
    >
      <TouchableOpacity style={styles.item} onPress={onShare} accessibilityLabel="Partager mon profil">
        <View style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Partager</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} onPress={onShowQr} accessibilityLabel="Afficher mon QR code">
        <View style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name="qr-code-outline" size={20} color="#fff" />
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]}>QR code</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} onPress={onOpenStats} accessibilityLabel="Voir mes statistiques">
        <View style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name="stats-chart-outline" size={20} color="#fff" />
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Stats</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    rowGap: 12,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  item: {
    alignItems: 'center',
    width: Math.min(width * 0.19, 72),
  },
  btn: {
    width: Math.min(width * 0.11, 44),
    height: Math.min(width * 0.11, 44),
    borderRadius: Math.min(width * 0.055, 22),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default ActionsFooter;

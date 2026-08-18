import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Regroupe les états vides/erreur/invisible actuellement dispersés dans
// l'ancien LocationListScreen.js monolithique. Chaque export est un
// composant autonome, restylé en cohérence "Vibrant & dégradés" mais
// inchangé fonctionnellement.

const GradientButton = ({ onPress, disabled, colors, children, style }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[{ opacity: disabled ? 0.6 : 1 }, style]}>
    <LinearGradient
      colors={colors.accentGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.gradientButton}
    >
      {children}
    </LinearGradient>
  </TouchableOpacity>
);

export const InvisibleModeState = ({ colors, disabling, onDisable }) => (
  <View style={styles.centerContainer}>
    <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🕶️</Text>
    <Text style={[styles.title, { color: colors.textPrimary }]}>Mode invisible actif</Text>
    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
      Tu ne peux pas voir les lieux autour de toi tant que le mode invisible est activé. Désactive-le pour parcourir
      les lieux.
    </Text>
    <GradientButton onPress={onDisable} disabled={disabling} colors={colors}>
      {disabling ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.gradientButtonText}>Désactiver le mode invisible</Text>
      )}
    </GradientButton>
  </View>
);

export const LocationErrorState = ({ colors, refreshing, onRefresh, onRetry }) => (
  <ScrollView
    contentContainerStyle={[styles.centerContainer, { flexGrow: 1 }]}
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} progressViewOffset={10} />
    }
    alwaysBounceVertical
    bounces
    overScrollMode="always"
  >
    <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>📍</Text>
    <Text style={[styles.title, { color: colors.textPrimary }]}>Localisation indisponible</Text>
    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
      Active les services de localisation dans les réglages de ton appareil pour voir les lieux autour de toi.
    </Text>
    <GradientButton onPress={onRetry} colors={colors}>
      <Text style={styles.gradientButtonText}>Réessayer</Text>
    </GradientButton>
  </ScrollView>
);

export const EmptyListState = ({ colors, isDark, refreshing, onRefresh, onExpandRadius }) => (
  <ScrollView
    contentContainerStyle={[styles.centerContainer, { flexGrow: 1 }]}
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} progressViewOffset={10} />
    }
    alwaysBounceVertical
    bounces
    overScrollMode="always"
  >
    <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🌙</Text>
    <Text style={[styles.title, { color: colors.textPrimary }]}>Zone calme pour l'instant</Text>
    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
      Aucun lieu actif n'a été repéré autour de toi. Élargis le périmètre ou propose un nouveau lieu.
    </Text>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <GradientButton onPress={onExpandRadius} colors={colors}>
        <Text style={styles.gradientButtonText}>Élargir le périmètre</Text>
      </GradientButton>
      <TouchableOpacity
        onPress={() => {
          /* future: suggestion flow */
        }}
        style={[
          styles.outlineButton,
          { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#eaeaea' },
        ]}
      >
        <Text style={{ color: colors.textPrimary }}>Suggérer ce lieu</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>
);

export const ListFooter = ({ colors, loadingMore, loadMoreError, onRetry, reachedEnd }) => {
  if (loadingMore) {
    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>Chargement de lieux supplémentaires…</Text>
      </View>
    );
  }
  if (loadMoreError) {
    return (
      <View style={styles.footerContainer}>
        <Text style={[styles.footerText, { color: colors.textSecondary, marginBottom: 8 }]}>
          Impossible de charger plus de lieux. Vérifie ta connexion.
        </Text>
        <GradientButton onPress={onRetry} colors={colors}>
          <Text style={styles.gradientButtonText}>Réessayer</Text>
        </GradientButton>
      </View>
    );
  }
  if (reachedEnd) {
    return (
      <View style={styles.footerContainer}>
        <Text style={[styles.footerText, { color: colors.textSecondary, fontStyle: 'italic' }]}>
          Vous avez exploré tous les lieux actifs à proximité. Déplacez-vous ou faites une recherche pour en voir
          plus.
        </Text>
      </View>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  gradientButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  outlineButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  footerContainer: { paddingVertical: 16, alignItems: 'center' },
  footerText: { fontSize: 12, textAlign: 'center' },
});

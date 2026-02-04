import React, { useContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  SafeAreaView,
  PanResponder,
} from 'react-native';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { useLocale } from '../components/contexts/LocalizationContext';

const { width, height } = Dimensions.get('window');


const WarningsScreen = ({ onBack }) => {
  const { user } = useContext(UserContext);
  const { colors } = useTheme();
  const { locale } = useLocale();
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 60 || vx > 0.3) {
        onBack && onBack();
      }
    },
  });

  const warnings = useMemo(() => {
    const list = Array.isArray(user?.moderation?.warningsHistory)
      ? user.moderation.warningsHistory
          .map((entry) => ({
            at: entry?.at ? new Date(entry.at) : null,
            type: entry?.type ? String(entry.type) : '',
            reason: entry?.reason ? String(entry.reason) : '',
          }))
          .filter((entry) => entry.at && !isNaN(entry.at.getTime()))
      : [];
    return list.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [user]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Image
          source={require('../assets/appIcons/backArrow.png')}
          style={[styles.backButtonImage, { tintColor: colors.accent }]}
        />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.accent }]}>Avertissements</Text>

        <View style={[styles.infoCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Ce comportement peut entraîner un banissement temporaire ou définitif de l’application.
          </Text>
        </View>

        {warnings.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Aucun avertissement.</Text>
        ) : (
          warnings.map((entry, index) => (
            <View key={`${entry.at.getTime()}_${index}`} style={[styles.warningCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.warningLabel, { color: colors.textSecondary }]}>Type d’avertissement</Text>
              <Text style={[styles.warningValue, { color: colors.textPrimary }]}>
                {entry.type || 'Non précisé'}
              </Text>

              <Text style={[styles.warningLabel, { color: colors.textSecondary }]}>Raison</Text>
              <Text style={[styles.warningValue, { color: colors.textPrimary }]}>
                {entry.reason || 'Non précisée'}
              </Text>

              <Text style={[styles.warningDate, { color: colors.textSecondary }]}>
                {entry.at.toLocaleString(locale)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: width * 0.06,
    paddingTop: height * 0.02,
    paddingBottom: Math.max(24, height * 0.05),
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  backButtonImage: {
    width: 28,
    height: 28,
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
  infoCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: height * 0.02,
  },
  infoText: {
    fontSize: width * 0.042,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: width * 0.045,
    textAlign: 'center',
    marginTop: height * 0.02,
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  warningLabel: {
    fontSize: width * 0.04,
    marginBottom: 4,
  },
  warningValue: {
    fontSize: width * 0.046,
    fontWeight: '600',
    marginBottom: 8,
  },
  warningDate: {
    fontSize: width * 0.038,
    textAlign: 'right',
  },
});

export default WarningsScreen;

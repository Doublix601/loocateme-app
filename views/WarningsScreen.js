import React, { useContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { useLocale } from '../components/contexts/LocalizationContext';

const { width, height } = Dimensions.get('window');


const WarningsScreen = ({ onBack }) => {
  const { user } = useContext(UserContext);
  const { colors, isDark } = useTheme();
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={onBack}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Avertissements</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoCard, { backgroundColor: 'rgba(0,194,203,0.1)', borderColor: isDark ? 'rgba(0,194,203,0.3)' : 'rgba(0,194,203,0.2)' }]}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            Ce comportement peut entraîner un bannissement temporaire ou définitif de l’application.
          </Text>
        </View>

        {warnings.length === 0 ? (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={[styles.emptyText, { color: colors.text, opacity: 0.5 }]}>Aucun avertissement.</Text>
          </View>
        ) : (
          warnings.map((entry, index) => (
            <View key={`${entry.at.getTime()}_${index}`} style={[styles.warningCard, { backgroundColor: colors.surface }]}>
              <View style={{ marginBottom: 15 }}>
                <Text style={[styles.warningLabel, { color: colors.text, opacity: 0.5 }]}>Type d’avertissement</Text>
                <Text style={[styles.warningValue, { color: colors.text }]}>
                    {entry.type || 'Non précisé'}
                </Text>
              </View>

              <View style={{ marginBottom: 15 }}>
                <Text style={[styles.warningLabel, { color: colors.text, opacity: 0.5 }]}>Raison</Text>
                <Text style={[styles.warningValue, { color: colors.text, fontWeight: '500' }]}>
                    {entry.reason || 'Non précisée'}
                </Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', paddingTop: 10 }}>
                <Text style={[styles.warningDate, { color: colors.text, opacity: 0.4 }]}>
                    {entry.at.toLocaleString(locale)}
                </Text>
              </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  backButtonCircular: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { width: 24, height: 24 },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 15,
    marginBottom: 25,
  },
  infoText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  warningCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  warningLabel: {
    fontSize: 12,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  warningValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  warningDate: {
    fontSize: 13,
    textAlign: 'right',
  },
});

export default WarningsScreen;

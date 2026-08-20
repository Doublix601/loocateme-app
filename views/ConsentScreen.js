import React, { useEffect, useState, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { useNavigation } from '@react-navigation/native';
import { getPrivacyPolicy, acceptPolicyVersion, logout } from '../components/ApiRequest';
import { navigateAfterAuth } from '../utils/onboarding';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { publish } from '../components/EventBus';

export default function ConsentScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState('');
  const [changelog, setChangelog] = useState('');
  const [version, setVersion] = useState('');
  const [accepting, setAccepting] = useState(false);
  const { user, updateUser } = useContext(UserContext);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getPrivacyPolicy();
        if (mounted) {
          setPolicy(res?.policy || '');
          setChangelog(res?.changelog || '');
          setVersion(res?.version || '');
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAccept = async () => {
    try {
      setAccepting(true);
      const res = await acceptPolicyVersion();
      if (updateUser) {
        try {
          updateUser(
            res?.user
              ? { ...user, consent: res.user.consent }
              : { ...user, consent: { accepted: true, version, consentAt: new Date().toISOString() } },
          );
        } catch (_) {
          /* ignore mapping issues */
        }
      }
      await navigateAfterAuth(navigation);
      setTimeout(() => publish('userlist:refresh'), 1000);
    } catch (e) {
      Alert.alert(t('consent.acceptErrorTitle'), t('consent.acceptErrorMessage'));
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    try {
      Alert.alert(t('consent.declineInfoTitle'), t('consent.declineInfoMessage'));
      await logout();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      /* noop */
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('consent.title')}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!changelog && (
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: '#00c2cb' }]}
            >
              <Text style={[styles.changelogTitle, { color: colors.textPrimary }]}>
                {t('consent.changelogTitle')}{version ? ` (v${version})` : ''}
              </Text>
              <Markdown style={markdownStyles(colors)}>{changelog}</Markdown>
            </View>
          )}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Markdown style={markdownStyles(colors)}>{policy}</Markdown>
          </View>
        </ScrollView>
      )}

      <View style={[styles.actions, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.decline,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
          ]}
          onPress={handleDecline}
          disabled={accepting}
        >
          <Text style={[styles.buttonText, { color: colors.textPrimary, opacity: 0.6 }]}>{t('consent.decline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.accept]} onPress={handleAccept} disabled={accepting}>
          <Text style={styles.buttonText}>{accepting ? t('consent.accepting') : t('consent.accept')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const markdownStyles = (colors) => ({
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  heading1: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  heading2: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  heading3: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  strong: { fontWeight: '700', color: colors.textPrimary },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  link: { color: '#00c2cb' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20 },
  card: { borderRadius: 20, padding: 20, marginBottom: 20 },
  changelogTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  policyText: { fontSize: 14, lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  button: { flex: 1, paddingVertical: 16, borderRadius: 15, alignItems: 'center', marginHorizontal: 8 },
  decline: {},
  accept: { backgroundColor: '#00c2cb' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

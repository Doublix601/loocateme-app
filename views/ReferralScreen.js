import React, { useContext, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  Platform,
  Share,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { getMyReferralInfo, getReferralHistory, redeemReferralCode, getMyUser } from '../components/ApiRequest';
import { proxifyImageUrl } from '../components/ServerUtils';

const { width } = Dimensions.get('window');
const QR_SIZE = Math.floor(Math.min(width * 0.55, 260));

const ReferralScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user, updateUser } = useContext(UserContext);
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [qrImageUri, setQrImageUri] = useState('');
  // Code prérempli quand l'écran est ouvert via un lien d'invitation (deep link ou
  // notification) : nécessite toujours une confirmation manuelle, jamais un auto-redeem.
  const [prefillCode, setPrefillCode] = useState(route.params?.prefillCode || '');
  const [prefillSubmitting, setPrefillSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [infoRes, historyRes] = await Promise.all([getMyReferralInfo(), getReferralHistory()]);
      setInfo(infoRes);
      setHistory(historyRes?.referrals || []);
      if (infoRes?.shareUrl) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(infoRes.shareUrl)}`;
        setQrImageUri(proxifyImageUrl(qrUrl));
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible de charger vos informations de parrainage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleShare = async () => {
    if (!info?.shareUrl) return;
    const message = `Rejoins-moi sur LoocateMe 👋\n\n${info.shareUrl}`;
    try {
      await Share.share({ message, url: info.shareUrl, title: 'Invite un ami sur LoocateMe' });
    } catch (e) {
      Alert.alert('Partage', e?.message || 'Impossible de partager.');
    }
  };

  const handleConfirmPrefillCode = async () => {
    const code = prefillCode.trim();
    if (!code) return;
    setPrefillSubmitting(true);
    try {
      await redeemReferralCode(code);
      const freshUser = await getMyUser();
      if (freshUser) updateUser(freshUser);
      setPrefillCode('');
      Alert.alert('Parrainage', 'Code de parrainage enregistré !');
    } catch (e) {
      const message =
        e?.code === 'SELF_REFERRAL'
          ? 'Vous ne pouvez pas utiliser votre propre code.'
          : e?.code === 'ALREADY_REFERRED'
          ? 'Vous avez déjà utilisé un code de parrainage.'
          : e?.code === 'INVALID_CODE'
          ? 'Ce code de parrainage est invalide.'
          : e?.message || 'Impossible de valider ce code.';
      Alert.alert('Parrainage', message);
    } finally {
      setPrefillSubmitting(false);
    }
  };

  const progress = info ? Math.min(1, info.currentMonthValidatedCount / info.targetCount) : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={() => navigation.goBack()}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Parrainage</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#00c2cb" size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: 'rgba(0,194,203,0.1)',
                borderColor: isDark ? 'rgba(0,194,203,0.3)' : 'rgba(0,194,203,0.2)',
              },
            ]}
          >
            <Text style={[styles.infoText, { color: colors.textPrimary }]}>
              Invite 5 amis ce mois-ci (chacun doit sortir et faire son 1er check-in vérifié) et gagne 1 mois Premium offert 🎉
            </Text>
          </View>

          {!!prefillCode && !user?.referredBy && (
            <View style={[styles.rewardBanner, { backgroundColor: 'rgba(0,194,203,0.15)' }]}>
              <Text style={[styles.rewardText, { color: colors.textPrimary, marginBottom: 12 }]}>
                Confirmer le code de parrainage « {prefillCode} » ?
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                <TextInput
                  style={[styles.revokeInputInline, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={prefillCode}
                  onChangeText={setPrefillCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  onPress={handleConfirmPrefillCode}
                  disabled={prefillSubmitting}
                  style={[styles.shareBtn, { marginTop: 0, marginLeft: 10, opacity: prefillSubmitting ? 0.6 : 1 }]}
                >
                  {prefillSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.shareBtnText}>Valider</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {info?.rewardActive && (
            <View style={[styles.rewardBanner, { backgroundColor: 'rgba(0,194,203,0.15)' }]}>
              <Text style={[styles.rewardText, { color: colors.textPrimary }]}>
                💎 Ton mois Premium offert est actif
                {info.rewardExpiresAt ? ` jusqu'au ${new Date(info.rewardExpiresAt).toLocaleDateString()}` : ''}.
              </Text>
            </View>
          )}

          <View style={[styles.codeCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.codeLabel, { color: colors.textPrimary, opacity: 0.5 }]}>Ton code de parrainage</Text>
            <Text style={[styles.code, { color: colors.textPrimary }]}>{info?.referralCode || '—'}</Text>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} accessibilityLabel="Partager mon code">
              <Text style={styles.shareBtnText}>📤 Partager mon code</Text>
            </TouchableOpacity>

            {qrImageUri ? (
              <Image source={{ uri: qrImageUri }} style={styles.qrImage} resizeMode="contain" />
            ) : null}
          </View>

          <View style={[styles.progressCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.progressLabel, { color: colors.textPrimary }]}>
              {info?.currentMonthValidatedCount ?? 0} / {info?.targetCount ?? 5} parrainages ce mois-ci
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary, opacity: 0.5 }]}>Amis invités</Text>
          {history.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textPrimary, opacity: 0.5 }]}>
              Aucun ami invité pour le moment.
            </Text>
          ) : (
            history.map((entry, index) => (
              <View key={index} style={[styles.historyRow, { backgroundColor: colors.surface }]}>
                <Text style={[styles.historyName, { color: colors.textPrimary }]}>
                  {entry.referredUser?.username || 'Utilisateur'}
                </Text>
                <Text
                  style={[
                    styles.historyStatus,
                    { color: entry.status === 'validated' ? '#00c2cb' : colors.textPrimary, opacity: entry.status === 'validated' ? 1 : 0.5 },
                  ]}
                >
                  {entry.status === 'validated' ? 'Validé' : entry.status === 'void' ? 'Annulé' : 'En attente'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerTitle: { fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  backButtonCircular: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  backIcon: { width: 24, height: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  infoCard: { borderRadius: 20, borderWidth: 1, padding: 15, marginBottom: 20 },
  infoText: { fontSize: 15, textAlign: 'center', lineHeight: 20 },
  rewardBanner: { borderRadius: 16, padding: 15, marginBottom: 20 },
  rewardText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  revokeInputInline: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    letterSpacing: 1,
    minWidth: 120,
  },
  codeCard: { borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center' },
  codeLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  shareBtn: { marginTop: 16, backgroundColor: '#00c2cb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  qrImage: { width: QR_SIZE, height: QR_SIZE, marginTop: 20 },
  progressCard: { borderRadius: 20, padding: 20, marginBottom: 20 },
  progressLabel: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00c2cb', borderRadius: 5 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 10 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },
  historyName: { fontSize: 15, fontWeight: '600' },
  historyStatus: { fontSize: 13, fontWeight: '600' },
});

export default ReferralScreen;

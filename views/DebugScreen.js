import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  adminSearchUsers,
  invalidateApiCacheByPrefix,
  getAdminFlags,
  setFeatureFlag,
  setUserRole,
  unbanUser,
  setUserPremium,
  adminSetPremium,
  adminSetConsumables,
  adminSetAccountFlags,
  adminGetUserBusiness,
  adminSetBusinessTier,
  adminSetBusinessBoosts,
  triggerLocationSync,
} from '../components/ApiRequest';
import { resetOnboarding, resetProfileOnboarding, resetLocationPrimer } from '../utils/onboarding';
import { subscribe, publish } from '../components/EventBus';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { useLocale } from '../components/contexts/LocalizationContext';

import { useTheme } from '../components/contexts/ThemeContext';
import { DEBUG_CONFIG, setDebugFlag } from '../services/DebugConfig';
import PremiumService from '../services/PremiumService';
import PremiumNudgeService from '../services/PremiumNudgeService';
import { usePremiumAccess } from '../hooks/usePremiumAccess';

const NUDGE_SIGNALS = ['radius_limited', 'profile_views', 'consumables_depleted', 'periodic_home'];

// Paliers d'abonnement pro (cf. Location.businessTier côté backend) et libellés
// des boosts pro rechargeables (cf. src/constants/boosts.js : caps ultra 1 / pro 3 / event 1).
const BUSINESS_TIERS = ['none', 'pro1', 'pro2', 'pro3'];
const PRO_BOOST_TYPES = [
  { key: 'ultra', label: 'Ultra', field: 'ultraBoostBalance', cap: 1 },
  { key: 'pro', label: 'Pro', field: 'proBoostBalance', cap: 3 },
  { key: 'event', label: 'Event', field: 'eventBoostBalance', cap: 1 },
];
const PREMIUM_SOURCES = ['paid', 'trial', 'referral_reward', 'promo', 'null'];

export { DEBUG_CONFIG } from '../services/DebugConfig';

const DebugScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { refresh: refreshFlags } = useFeatureFlags();
  const { locale } = useLocale();
  const { isPremium: nudgeIsPremium, premiumSystemEnabled: nudgePremiumSystemEnabled } = usePremiumAccess();
  const [loading, setLoading] = useState(false);
  // Feature flags state
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState(null);
  // IAP debug state
  const [iapDisabled, setIapDisabled] = useState(DEBUG_CONFIG.IAP_DISABLED);
  const [forcePremium, setForcePremium] = useState(DEBUG_CONFIG.FORCE_PREMIUM);
  const [boostsRemaining, setBoostsRemaining] = useState(0);
  const [superlikesRemaining, setSuperlikesRemaining] = useState(0);
  const [premiumStatus, setPremiumStatus] = useState('');
  // Premium nudges debug state
  const [nudgeState, setNudgeState] = useState(null);

  // Recherche utilisateur
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const debRef = useRef(null);
  // Édition premium du compte sélectionné
  const [expiresPickerOpen, setExpiresPickerOpen] = useState(false);
  // Consommables app (ajout de quantité)
  const [boostDelta, setBoostDelta] = useState('1');
  const [superlikeDelta, setSuperlikeDelta] = useState('1');
  // Compte pro du compte sélectionné
  const [business, setBusiness] = useState(null); // { location } | { location: null } | null
  const [businessLoading, setBusinessLoading] = useState(false);

  const loadPremiumStatus = () => {
    try {
      setBoostsRemaining(PremiumService.getBoostsRemaining());
      setSuperlikesRemaining(PremiumService.getSuperlikesRemaining());
      const status = PremiumService.getSubscriptionStatus();
      setPremiumStatus(status === 'premium' ? 'Premium actif' : status === 'trial' ? 'Essai gratuit' : 'Gratuit');
    } catch (_) {}
  };

  const handleResetConsumables = async () => {
    try {
      await PremiumService.resetConsumables();
      loadPremiumStatus();
      Alert.alert('Réinitialisé', 'Boosts et superlikes remis à zéro.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de réinitialiser.');
    }
  };

  const loadNudgeState = async () => {
    try {
      await PremiumNudgeService.init();
      setNudgeState(PremiumNudgeService.getState());
    } catch (_) {}
  };

  // Bypass cooldown/plafond pour valider visuellement chaque nudge, mais respecte
  // toujours le flag premiumEnabled et le statut premium (sinon ce bouton masquerait
  // un vrai bug de gating au lieu de servir de raccourci QA).
  const handleForceNudge = async (signalId) => {
    try {
      const nudge = await PremiumNudgeService.forceSignal(signalId, {
        isPremium: nudgeIsPremium,
        premiumSystemEnabled: nudgePremiumSystemEnabled,
      });
      if (!nudge) {
        Alert.alert('Non éligible', "Bloqué par le statut premium de l'utilisateur ou le flag premiumEnabled (OFF).");
        return;
      }
      publish('premium:nudge', nudge);
      await loadNudgeState();
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de forcer le nudge.');
    }
  };

  const handleResetNudges = async () => {
    try {
      await PremiumNudgeService.resetAll();
      await PremiumNudgeService.resetSession();
      await loadNudgeState();
      Alert.alert('Réinitialisé', 'Cooldowns et plafond de session des nudges remis à zéro.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de réinitialiser les nudges.');
    }
  };

  // Charger systématiquement des données fraîches à l'ouverture de l'écran
  useEffect(() => {
    loadFlags();
    loadPremiumStatus();
    loadNudgeState();
  }, []);

  useEffect(() => {
    const off = subscribe('ui:reload', () => {
      loadPremiumStatus();
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  // Load feature flags from admin endpoint
  const loadFlags = async () => {
    try {
      setFlagsLoading(true);
      setFlagsError(null);
      const res = await getAdminFlags();
      setFlags(Array.isArray(res?.flags) ? res.flags : []);
    } catch (e) {
      console.error('[DebugScreen] Load flags error', e);
      setFlagsError(e?.message || 'Impossible de charger les flags');
    } finally {
      setFlagsLoading(false);
    }
  };

  // Toggle a feature flag
  const doToggleFlag = async (key, currentValue) => {
    try {
      setFlagsLoading(true);
      await setFeatureFlag(key, !currentValue);
      await loadFlags();
      refreshFlags({ force: true });
      Alert.alert('Succès', `Flag "${key}" mis à jour`);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de modifier le flag');
    } finally {
      setFlagsLoading(false);
    }
  };

  // Ces flags affectent TOUS les utilisateurs en production : confirmation
  // explicite avant d'appeler (LEG-08).
  const toggleFlag = (key, currentValue) => {
    Alert.alert(
      'Flag global',
      `Basculer « ${key} » sur ${!currentValue ? 'ON' : 'OFF'} affecte tous les utilisateurs en production. Continuer ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', style: 'destructive', onPress: () => doToggleFlag(key, currentValue) },
      ],
    );
  };

  // --- Compte sélectionné : helpers de mise à jour locale --------------------

  const patchSelectedUser = (patch) => {
    setSelectedUser((prev) => (prev ? { ...prev, ...patch } : prev));
    setResults((prev) =>
      prev.map((u) =>
        String(u._id || u.id) === String(selectedUser?._id || selectedUser?.id) ? { ...u, ...patch } : u,
      ),
    );
  };

  const withUserAction = async (fn, successMsg) => {
    const id = selectedUser?._id || selectedUser?.id;
    if (!id) return;
    try {
      setLoading(true);
      await fn(id);
      try {
        invalidateApiCacheByPrefix('/api/admin');
      } catch (_) {}
      if (successMsg) Alert.alert('Succès', successMsg);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Action impossible.');
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = (isPremium) =>
    withUserAction(async (id) => {
      await setUserPremium(id, isPremium);
      patchSelectedUser({ isPremium });
    }, `Premium ${isPremium ? 'activé' : 'retiré'}`);

  const changeUserRole = (role) =>
    withUserAction(async (id) => {
      await setUserRole(id, role);
      patchSelectedUser({ role });
    }, `Rôle : ${role}`);

  const handleUnban = () =>
    withUserAction(async (id) => {
      await unbanUser(id);
      patchSelectedUser({
        moderation: {
          ...(selectedUser.moderation || {}),
          bannedUntil: null,
          bannedPermanent: false,
          bannedAt: null,
          bannedBy: null,
          banReason: '',
        },
      });
    }, 'Utilisateur débanni.');

  const setPremiumSource = (source) =>
    withUserAction(async (id) => {
      const value = source === 'null' ? null : source;
      const res = await adminSetPremium(id, { premiumSource: value });
      patchSelectedUser({ premiumSource: res?.user?.premiumSource ?? value });
    }, 'Source premium mise à jour');

  const setPremiumExpiry = (date) =>
    withUserAction(async (id) => {
      const iso = date ? new Date(date).toISOString() : null;
      const res = await adminSetPremium(id, { premiumExpiresAt: iso });
      patchSelectedUser({ premiumExpiresAt: res?.user?.premiumExpiresAt ?? iso });
    }, date ? 'Expiration premium mise à jour' : 'Expiration premium effacée');

  const quickPremium = (days) => {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return withUserAction(async (id) => {
      const res = await adminSetPremium(id, {
        isPremium: true,
        premiumSource: 'promo',
        premiumExpiresAt: d.toISOString(),
      });
      patchSelectedUser({
        isPremium: true,
        premiumSource: res?.user?.premiumSource ?? 'promo',
        premiumExpiresAt: res?.user?.premiumExpiresAt ?? d.toISOString(),
      });
    }, `Premium accordé ${days} jours`);
  };

  const expireNow = () =>
    withUserAction(async (id) => {
      const past = new Date(Date.now() - 60 * 1000).toISOString();
      const res = await adminSetPremium(id, { isPremium: false, premiumExpiresAt: past });
      patchSelectedUser({ isPremium: false, premiumExpiresAt: res?.user?.premiumExpiresAt ?? past });
    }, 'Premium expiré');

  const startTrialForUser = () =>
    withUserAction(async (id) => {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const res = await adminSetPremium(id, {
        premiumTrialStart: now.toISOString(),
        premiumTrialEnd: end.toISOString(),
      });
      patchSelectedUser({
        premiumTrialStart: res?.user?.premiumTrialStart ?? now.toISOString(),
        premiumTrialEnd: res?.user?.premiumTrialEnd ?? end.toISOString(),
      });
    }, 'Essai gratuit démarré (7 j)');

  const resetTrialForUser = () =>
    withUserAction(async (id) => {
      const res = await adminSetPremium(id, { premiumTrialStart: null, premiumTrialEnd: null });
      patchSelectedUser({
        premiumTrialStart: res?.user?.premiumTrialStart ?? null,
        premiumTrialEnd: res?.user?.premiumTrialEnd ?? null,
      });
    }, "Éligibilité à l'essai réinitialisée");

  const addConsumables = (mode) =>
    withUserAction(async (id) => {
      const body = {
        mode,
        boost: boostDelta === '' ? undefined : Number(boostDelta),
        superlike: superlikeDelta === '' ? undefined : Number(superlikeDelta),
      };
      const res = await adminSetConsumables(id, body);
      patchSelectedUser({ boostBalance: res?.boostBalance, superlikeBalance: res?.superlikeBalance });
    }, mode === 'set' ? 'Soldes définis' : 'Soldes ajustés');

  const toggleAccountFlag = (field, value) =>
    withUserAction(async (id) => {
      const res = await adminSetAccountFlags(id, { [field]: value });
      patchSelectedUser({ [field]: res?.user?.[field] ?? value });
    }, 'Flag de compte mis à jour');

  // --- Compte pro ----------------------------------------------------------

  const loadBusiness = async (userId) => {
    if (!userId) return;
    try {
      setBusinessLoading(true);
      const res = await adminGetUserBusiness(userId);
      setBusiness(res || { location: null });
    } catch (e) {
      setBusiness({ location: null, error: e?.message || 'Erreur' });
    } finally {
      setBusinessLoading(false);
    }
  };

  useEffect(() => {
    setBusiness(null);
    setExpiresPickerOpen(false);
    const id = selectedUser?._id || selectedUser?.id;
    if (id) loadBusiness(id);
  }, [selectedUser?._id, selectedUser?.id]);

  const stripeActive =
    business?.location?.subscription?.stripeSubscriptionId &&
    ['active', 'trialing', 'past_due'].includes(business?.location?.subscription?.status);

  const doSetBusinessTier = (tier, force = false) => {
    const locId = business?.location?._id;
    if (!locId) return;
    return withUserAction(async () => {
      try {
        const res = await adminSetBusinessTier(locId, { businessTier: tier, grantProOffers: tier !== 'none', force });
        setBusiness((prev) => ({ ...prev, location: { ...prev.location, ...res.location } }));
      } catch (e) {
        if (e?.code === 'STRIPE_SUBSCRIPTION_ACTIVE' || /STRIPE_SUBSCRIPTION_ACTIVE/.test(e?.message || '')) {
          Alert.alert(
            'Abonnement Stripe actif',
            "L'override sera écrasé au prochain webhook Stripe. Forcer quand même ?",
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Forcer', style: 'destructive', onPress: () => doSetBusinessTier(tier, true) },
            ],
          );
          return;
        }
        throw e;
      }
    }, `Palier pro : ${tier}`);
  };

  const setProBoost = (type, mode) => {
    const locId = business?.location?._id;
    if (!locId) return;
    const cap = PRO_BOOST_TYPES.find((b) => b.key === type)?.cap ?? 1;
    return withUserAction(async () => {
      const res = await adminSetBusinessBoosts(locId, { mode, [type]: mode === 'set' ? cap : 1 });
      setBusiness((prev) => ({
        ...prev,
        location: { ...prev.location, proOffers: { ...(prev.location.proOffers || {}), ...res.proOffers } },
      }));
    }, 'Boosts pro mis à jour');
  };

  // --- Maintenance / appareil --------------------------------------------

  const handleResetOnboarding = async () => {
    await resetOnboarding();
    Alert.alert('Onboarding réinitialisé', "Au prochain lancement de l'app, l'onboarding s'affichera.");
  };

  const handleResetProfileOnboarding = async () => {
    await resetProfileOnboarding();
    Alert.alert('Onboarding profil réinitialisé', "Au prochain affichage du profil, les coach marks s'afficheront.");
  };

  const handleResetLocationPrimer = async () => {
    await resetLocationPrimer();
    Alert.alert('Écran localisation réinitialisé', "L'écran d'accroche localisation s'affichera à nouveau.");
  };

  const handleSyncLocations = async () => {
    try {
      setLoading(true);
      const res = await triggerLocationSync();
      Alert.alert('Sync terminée', res?.message || 'Stats lieux recalculées.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de déclencher la sync.');
    } finally {
      setLoading(false);
    }
  };

  // Recherche avec debounce
  useEffect(() => {
    const q = String(query || '').trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    debRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await adminSearchUsers({ q });
        setResults(Array.isArray(res?.users) ? res.users : []);
      } catch (_e) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [query]);

  const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)';
  const subTextColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : colors.surface;

  const cardStyle = [styles.card, { backgroundColor: cardBg }];
  const sectionTitleStyle = [styles.sectionTitle, { color: isDark ? '#fff' : colors.textPrimary, opacity: 1 }];
  const textStyle = { color: isDark ? '#fff' : colors.textPrimary };
  const subTextStyle = { color: isDark ? '#eee' : subTextColor };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleString(locale);
  };
  const userLabel = (u) =>
    u?.username || u?.customName || u?.firstName || u?.email || 'Utilisateur';

  const selName = selectedUser ? userLabel(selectedUser) : '';
  const proOffers = business?.location?.proOffers || {};

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: borderColor, borderBottomWidth: 1 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.backButtonCircular,
            { backgroundColor: isDark ? 'rgba(0,194,203,0.2)' : 'rgba(0,194,203,0.1)' },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>Debug</Text>
        <TouchableOpacity onPress={loadFlags} style={{ padding: 8 }}>
          <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Sync</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* IAP Debug Section */}
        <Text style={sectionTitleStyle}>In-App Purchases</Text>
        <View style={cardStyle}>
          {__DEV__ && (
            <>
              <View style={[styles.flagRow, { borderBottomColor: borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagKey, textStyle]}>IAP_DISABLED</Text>
                  <Text style={[styles.flagDesc, subTextStyle]}>Simule les achats sans vraie transaction</Text>
                </View>
                <Switch
                  value={iapDisabled}
                  onValueChange={(v) => {
                    setDebugFlag('IAP_DISABLED', v);
                    setIapDisabled(v);
                  }}
                  trackColor={{ false: '#3e3e3e', true: '#f39c12' }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.flagRow, { borderBottomColor: borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagKey, textStyle]}>FORCE_PREMIUM</Text>
                  <Text style={[styles.flagDesc, subTextStyle]}>Force le statut Premium localement</Text>
                </View>
                <Switch
                  value={forcePremium}
                  onValueChange={(v) => {
                    setDebugFlag('FORCE_PREMIUM', v);
                    setForcePremium(v);
                  }}
                  trackColor={{ false: '#3e3e3e', true: '#2ecc71' }}
                  thumbColor="#fff"
                />
              </View>
            </>
          )}

          {/* Consumables status */}
          <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderColor }}>
            <Text
              style={[
                { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase' },
                subTextStyle,
              ]}
            >
              État des consommables
            </Text>
            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 26 }}>🔥</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#00c2cb' }}>{boostsRemaining}</Text>
                <Text style={[{ fontSize: 11 }, subTextStyle]}>boosts</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 26 }}>⭐</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#00c2cb' }}>{superlikesRemaining}</Text>
                <Text style={[{ fontSize: 11 }, subTextStyle]}>superlikes</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        premiumStatus === 'Premium actif'
                          ? '#2ecc71'
                          : premiumStatus === 'Essai gratuit'
                            ? '#f39c12'
                            : '#3498db',
                    },
                  ]}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{premiumStatus || '—'}</Text>
                </View>
                <TouchableOpacity onPress={loadPremiumStatus} style={{ marginTop: 8 }}>
                  <Text style={{ color: '#00c2cb', fontSize: 12, fontWeight: '700' }}>Actualiser</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.cmdBtn,
              { backgroundColor: '#e74c3c', borderColor: 'transparent', marginTop: 12, marginBottom: 0 },
            ]}
            onPress={handleResetConsumables}
          >
            <Text style={styles.cmdTxt}>Réinitialiser consommables</Text>
          </TouchableOpacity>
        </View>

        {/* Feature Flags Section */}
        <Text style={sectionTitleStyle}>Feature Flags (Global)</Text>
        <View style={cardStyle}>
          {flagsLoading ? (
            <ActivityIndicator size="small" color="#00c2cb" />
          ) : flagsError ? (
            <Text style={{ color: '#ff6b6b' }}>{flagsError}</Text>
          ) : flags.length === 0 ? (
            <Text style={subTextStyle}>Aucun flag configuré</Text>
          ) : (
            flags.map((f) => (
              <View key={f.key} style={[styles.flagRow, { borderBottomColor: borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagKey, textStyle]}>{f.key}</Text>
                  {f.description ? <Text style={[styles.flagDesc, subTextStyle]}>{f.description}</Text> : null}
                </View>
                <Switch
                  value={!!f.enabled}
                  onValueChange={() => toggleFlag(f.key, f.enabled)}
                  trackColor={{ false: '#3e3e3e', true: '#00c2cb' }}
                  thumbColor={f.enabled ? '#fff' : '#f4f3f4'}
                />
              </View>
            ))
          )}
          <TouchableOpacity
            style={[
              styles.cmdBtn,
              { marginTop: 12, backgroundColor: 'rgba(0,194,203,0.1)', borderColor: 'transparent' },
            ]}
            onPress={loadFlags}
            disabled={flagsLoading}
          >
            <Text style={[styles.cmdTxt, { color: '#00c2cb' }]}>Rafraîchir les flags</Text>
          </TouchableOpacity>
        </View>

        {/* Nudges Premium (QA) */}
        {__DEV__ && (
          <>
            <Text style={sectionTitleStyle}>Nudges Premium (QA)</Text>
            <View style={cardStyle}>
              <Text style={[{ fontSize: 12, marginBottom: 12 }, subTextStyle]}>
                Force l'affichage d'un nudge en contournant cooldown/plafond (respecte toujours le flag premiumEnabled
                et le statut premium de l'utilisateur courant).
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {NUDGE_SIGNALS.map((signalId) => (
                  <TouchableOpacity
                    key={signalId}
                    style={[styles.smallBtn, { backgroundColor: '#00c2cb' }]}
                    onPress={() => handleForceNudge(signalId)}
                  >
                    <Text style={styles.smallBtnTxt}>Forcer: {signalId}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.cmdBtn, { backgroundColor: '#e74c3c', borderColor: 'transparent' }]}
                onPress={handleResetNudges}
              >
                <Text style={styles.cmdTxt}>Réinitialiser les nudges</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.cmdBtn,
                  { marginTop: 10, backgroundColor: 'rgba(0,194,203,0.1)', borderColor: 'transparent' },
                ]}
                onPress={loadNudgeState}
              >
                <Text style={[styles.cmdTxt, { color: '#00c2cb' }]}>Rafraîchir l'état</Text>
              </TouchableOpacity>
              {nudgeState && (
                <View
                  style={[
                    styles.resultBox,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background, borderColor },
                  ]}
                >
                  <Text style={[styles.resultTitle, textStyle]}>État persisté</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{
                      backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.05)',
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <Text selectable style={[styles.resultText, { color: isDark ? '#fff' : colors.textPrimary }]}>
                      {JSON.stringify(nudgeState, null, 2)}
                    </Text>
                  </ScrollView>
                </View>
              )}
            </View>
          </>
        )}

        {/* ============ Recherche utilisateur (debug) ============ */}
        <Text style={sectionTitleStyle}>Recherche utilisateur (debug)</Text>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface,
              borderColor: borderColor,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[{ marginRight: 10 }, textStyle]}>🔎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nom, username, email, ou ID..."
            placeholderTextColor={isDark ? '#999' : subTextColor}
            autoCapitalize="none"
            style={[styles.input, textStyle]}
          />
        </View>
        <Text style={[{ fontSize: 11, marginTop: 6 }, subTextStyle]}>
          Recherche modération : inclut les comptes en mode invisible et bannis (min. 2 caractères).
        </Text>

        {searching ? (
          <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 15 }} />
        ) : (
          results.length > 0 && (
            <View style={[styles.resultsBox, { backgroundColor: colors.surface, borderColor: borderColor }]}>
              {results.map((u, idx) => (
                <TouchableOpacity
                  key={String(u._id || u.id)}
                  style={[styles.resultRow, idx !== results.length - 1 && { borderBottomColor: borderColor }]}
                  onPress={() => setSelectedUser(u)}
                >
                  <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {userLabel(u)}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: u.isPremium ? '#2ecc71' : '#3498db' }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                      {u.isPremium ? 'Premium' : 'Free'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {selectedUser && (
          <View style={[styles.selectedBox, { backgroundColor: colors.surface, borderColor: '#00c2cb' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.selectedTitle, subTextStyle]}>Compte sélectionné</Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Text style={{ color: '#00c2cb', fontWeight: '800', fontSize: 12 }}>Fermer ✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.selectedName, textStyle]} numberOfLines={1}>
              {selName}
            </Text>
            <Text style={[{ fontSize: 11 }, subTextStyle]} selectable>
              {selectedUser.email || '—'} · id {String(selectedUser._id || selectedUser.id)}
            </Text>

            {loading && <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 10 }} />}

            {/* ---- Compte ---- */}
            <Text style={[styles.subCardTitle, subTextStyle]}>Compte</Text>
            {(() => {
              const mod = selectedUser.moderation || {};
              const bannedPermanent = !!mod.bannedPermanent;
              const bannedUntil = mod.bannedUntil ? new Date(mod.bannedUntil) : null;
              const bannedUntilActive =
                bannedUntil && !isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
              const isBanned = bannedPermanent || bannedUntilActive;
              const banLabel = bannedPermanent
                ? 'Ban définitif'
                : bannedUntilActive
                  ? `Ban jusqu'au ${bannedUntil.toLocaleString(locale)}`
                  : 'Non banni';
              return (
                <View style={styles.rowWrap}>
                  <View style={[styles.badge, { backgroundColor: isBanned ? '#ff4d4d' : 'rgba(0,0,0,0.1)' }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{banLabel}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#16a085' }, !isBanned && { opacity: 0.3 }]}
                    onPress={handleUnban}
                    disabled={!isBanned}
                  >
                    <Text style={styles.smallBtnTxt}>Unban</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            <View style={styles.rowWrap}>
              <View style={[styles.badge, { backgroundColor: '#e67e22' }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{selectedUser.role || 'user'}</Text>
              </View>
              {['admin', 'moderator', 'user'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.smallBtn,
                    { backgroundColor: r === 'admin' ? '#c0392b' : r === 'moderator' ? '#8e44ad' : '#7f8c8d' },
                    (selectedUser.role || 'user') === r && { opacity: 0.35 },
                  ]}
                  onPress={() => changeUserRole(r)}
                  disabled={(selectedUser.role || 'user') === r}
                >
                  <Text style={styles.smallBtnTxt}>{r === 'moderator' ? 'Mod' : r === 'admin' ? 'Admin' : 'User'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowWrap}>
              <Text style={[styles.inlineLabel, textStyle]}>Invisible</Text>
              <Switch
                value={!!selectedUser.invisibleMode}
                onValueChange={(v) => toggleAccountFlag('invisibleMode', v)}
                trackColor={{ false: '#3e3e3e', true: '#9b59b6' }}
                thumbColor="#fff"
              />
              <Text style={[styles.inlineLabel, textStyle, { marginLeft: 16 }]}>Check-in</Text>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: '#34495e' }]}
                onPress={() =>
                  toggleAccountFlag('checkInMode', selectedUser.checkInMode === 'manual' ? 'auto' : 'manual')
                }
              >
                <Text style={styles.smallBtnTxt}>{selectedUser.checkInMode === 'manual' ? 'manual' : 'auto'}</Text>
              </TouchableOpacity>
            </View>

            {/* ---- Premium ---- */}
            <Text style={[styles.subCardTitle, subTextStyle]}>Premium</Text>
            <Text style={[{ fontSize: 12 }, subTextStyle]}>
              {selectedUser.isPremium ? 'Premium actif' : 'Free'} · source {String(selectedUser.premiumSource ?? '—')}
              {'\n'}expire : {fmtDate(selectedUser.premiumExpiresAt)}
              {'\n'}essai : {fmtDate(selectedUser.premiumTrialStart)} → {fmtDate(selectedUser.premiumTrialEnd)}
            </Text>

            <View style={styles.rowWrap}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2ecc71' }]} onPress={() => togglePremium(true)}>
                <Text style={styles.smallBtnTxt}>Set Premium</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#3498db' }]} onPress={() => togglePremium(false)}>
                <Text style={styles.smallBtnTxt}>Set Free</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#16a085' }]} onPress={() => quickPremium(30)}>
                <Text style={styles.smallBtnTxt}>+1 mois</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#16a085' }]} onPress={() => quickPremium(365)}>
                <Text style={styles.smallBtnTxt}>+1 an</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#e74c3c' }]} onPress={expireNow}>
                <Text style={styles.smallBtnTxt}>Expirer</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rowWrap}>
              <Text style={[styles.inlineLabel, textStyle]}>Source</Text>
              {PREMIUM_SOURCES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.smallBtn,
                    { backgroundColor: '#8e44ad' },
                    String(selectedUser.premiumSource ?? 'null') === s && { opacity: 0.35 },
                  ]}
                  onPress={() => setPremiumSource(s)}
                >
                  <Text style={styles.smallBtnTxt}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: '#34495e' }]}
                onPress={() => setExpiresPickerOpen(true)}
              >
                <Text style={styles.smallBtnTxt}>Choisir date d'expiration</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#7f8c8d' }]} onPress={() => setPremiumExpiry(null)}>
                <Text style={styles.smallBtnTxt}>Effacer expiration</Text>
              </TouchableOpacity>
            </View>
            {expiresPickerOpen && (
              <DateTimePicker
                value={
                  selectedUser.premiumExpiresAt && !isNaN(new Date(selectedUser.premiumExpiresAt).getTime())
                    ? new Date(selectedUser.premiumExpiresAt)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setExpiresPickerOpen(Platform.OS === 'ios');
                  if (event.type !== 'dismissed' && date) setPremiumExpiry(date);
                }}
              />
            )}

            <View style={styles.rowWrap}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#f39c12' }]} onPress={startTrialForUser}>
                <Text style={styles.smallBtnTxt}>Démarrer essai (7 j)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#7f8c8d' }]} onPress={resetTrialForUser}>
                <Text style={styles.smallBtnTxt}>Réinitialiser essai</Text>
              </TouchableOpacity>
            </View>

            {/* ---- Consommables (app) ---- */}
            <Text style={[styles.subCardTitle, subTextStyle]}>Consommables (app)</Text>
            <Text style={[{ fontSize: 12 }, subTextStyle]}>
              boosts : {selectedUser.boostBalance ?? 0} · superlikes : {selectedUser.superlikeBalance ?? 0}
            </Text>
            <View style={[styles.rowWrap, { alignItems: 'center' }]}>
              <Text style={[styles.inlineLabel, textStyle]}>Boosts</Text>
              <TextInput
                value={boostDelta}
                onChangeText={setBoostDelta}
                keyboardType="numbers-and-punctuation"
                style={[styles.miniInput, textStyle, { borderColor }]}
              />
              <Text style={[styles.inlineLabel, textStyle]}>Superlikes</Text>
              <TextInput
                value={superlikeDelta}
                onChangeText={setSuperlikeDelta}
                keyboardType="numbers-and-punctuation"
                style={[styles.miniInput, textStyle, { borderColor }]}
              />
            </View>
            <View style={styles.rowWrap}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2ecc71' }]} onPress={() => addConsumables('add')}>
                <Text style={styles.smallBtnTxt}>Ajouter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#34495e' }]} onPress={() => addConsumables('set')}>
                <Text style={styles.smallBtnTxt}>Définir</Text>
              </TouchableOpacity>
            </View>

            {/* ---- Compte Pro ---- */}
            <Text style={[styles.subCardTitle, subTextStyle]}>Compte Pro</Text>
            {businessLoading ? (
              <ActivityIndicator size="small" color="#00c2cb" style={{ marginTop: 6 }} />
            ) : !business ? null : !business.location ? (
              <Text style={[{ fontSize: 12 }, subTextStyle]}>
                {business.error ? `Erreur : ${business.error}` : 'Ce compte ne gère aucun lieu.'}
              </Text>
            ) : (
              <>
                <Text style={[{ fontSize: 12 }, subTextStyle]}>
                  {business.location.name || 'Lieu'} · palier {business.location.businessTier || 'none'}
                  {'\n'}Stripe : {business.location.subscription?.status || '—'}
                  {business.location.subscription?.stripeSubscriptionId
                    ? ` (${business.location.subscription.stripeSubscriptionId})`
                    : ''}
                  {'\n'}fin de période : {fmtDate(business.location.subscription?.currentPeriodEnd)}
                  {'\n'}boosts pro — ultra {proOffers.ultraBoostBalance ?? 0} / pro {proOffers.proBoostBalance ?? 0} / event{' '}
                  {proOffers.eventBoostBalance ?? 0}
                </Text>

                {stripeActive && (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnTxt}>
                      ⚠️ Abonnement Stripe actif : l'override sera écrasé au prochain webhook. Utilise le dashboard Stripe
                      pour un vrai changement.
                    </Text>
                  </View>
                )}

                <View style={styles.rowWrap}>
                  <Text style={[styles.inlineLabel, textStyle]}>Palier</Text>
                  {BUSINESS_TIERS.map((tier) => (
                    <TouchableOpacity
                      key={tier}
                      style={[
                        styles.smallBtn,
                        { backgroundColor: tier === 'none' ? '#7f8c8d' : '#2980b9' },
                        business.location.businessTier === tier && { opacity: 0.35 },
                      ]}
                      onPress={() => doSetBusinessTier(tier)}
                      disabled={business.location.businessTier === tier}
                    >
                      <Text style={styles.smallBtnTxt}>{tier}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {PRO_BOOST_TYPES.map((b) => (
                  <View key={b.key} style={styles.rowWrap}>
                    <Text style={[styles.inlineLabel, textStyle]}>
                      {b.label} ({proOffers[b.field] ?? 0}/{b.cap})
                    </Text>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#2ecc71' }]}
                      onPress={() => setProBoost(b.key, 'add')}
                    >
                      <Text style={styles.smallBtnTxt}>+1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#34495e' }]}
                      onPress={() => setProBoost(b.key, 'set')}
                    >
                      <Text style={styles.smallBtnTxt}>max</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ============ Cet appareil ============ */}
        <Text style={sectionTitleStyle}>Cet appareil</Text>
        <View style={cardStyle}>
          <Text style={[{ fontSize: 12, marginBottom: 12 }, subTextStyle]}>
            Ces réinitialisations sont locales à cette installation (AsyncStorage), pas liées à un compte.
          </Text>
          <TouchableOpacity
            style={[styles.cmdBtn, { backgroundColor: '#2c3e50', borderColor: 'transparent' }]}
            onPress={handleResetOnboarding}
          >
            <Text style={styles.cmdTxt}>Réinitialiser l'onboarding (slides)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cmdBtn, { backgroundColor: '#2c3e50', borderColor: 'transparent' }]}
            onPress={handleResetProfileOnboarding}
          >
            <Text style={styles.cmdTxt}>Réinitialiser l'onboarding profil (coach marks)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cmdBtn, { backgroundColor: '#2c3e50', borderColor: 'transparent', marginBottom: 0 }]}
            onPress={handleResetLocationPrimer}
          >
            <Text style={styles.cmdTxt}>Réinitialiser l'écran d'accroche localisation</Text>
          </TouchableOpacity>
        </View>

        {/* ============ Maintenance ============ */}
        <Text style={sectionTitleStyle}>Maintenance</Text>
        <TouchableOpacity
          style={[styles.cmdBtn, { backgroundColor: '#8e44ad', borderColor: 'transparent' }]}
          onPress={handleSyncLocations}
          disabled={loading}
        >
          <Text style={styles.cmdTxt}>Recalculer les étoiles des lieux (30j)</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator size="small" color="#00c2cb" style={{ marginVertical: 15 }} />}
      </ScrollView>
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
  backButtonCircular: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { width: 24, height: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 25,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.6,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  flagRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  flagKey: { fontSize: 16, fontWeight: '700' },
  flagDesc: { fontSize: 12, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 16 },
  resultsBox: { borderRadius: 15, marginTop: 10, borderWidth: 1, overflow: 'hidden' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  resultName: { flex: 1, fontWeight: '600' },
  selectedBox: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 },
  selectedName: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  subCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  rowWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 },
  inlineLabel: { fontSize: 12, fontWeight: '700' },
  miniInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 54,
    textAlign: 'center',
    fontSize: 14,
  },
  warnBox: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  warnTxt: { color: '#e74c3c', fontSize: 12, fontWeight: '700' },
  cmdBtn: {
    padding: 16,
    borderRadius: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  cmdTxt: { fontWeight: '700', fontSize: 15, color: '#fff' },
  resultBox: { borderRadius: 15, padding: 15, borderWidth: 1, marginTop: 15 },
  resultTitle: { fontWeight: '800', marginBottom: 8 },
  resultText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});

export default DebugScreen;

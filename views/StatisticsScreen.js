import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, ScrollView, Image, PanResponder, AppState } from 'react-native';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import { getStatsOverview, getDetailedProfileViews, getMyUser } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
import { subscribe } from '../components/EventBus';
import { UserContext } from '../components/contexts/UserContext';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen({ onBack, onOpenUserProfile }) {
  const { colors } = useTheme();
  const { user } = useContext(UserContext);
  const { flags } = useFeatureFlags();
  // If premium is disabled globally, treat everyone as premium for stats access
  const premiumEnabled = flags.premiumEnabled ?? false;
  const statisticsEnabled = flags.statisticsEnabled ?? false;
  const effectiveStatisticsEnabled = statisticsEnabled || premiumEnabled;
  // Admin and moderator roles have premium access
  const hasPremiumAccess = user?.isPremium || user?.role === 'admin' || user?.role === 'moderator';
  // User has access if: stats are enabled AND (premium disabled OR user has premium access)
  const hasAccess = effectiveStatisticsEnabled && (!premiumEnabled || hasPremiumAccess);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [detailed, setDetailed] = useState([]);
  const [detailedError, setDetailedError] = useState('');
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

  // Icônes des réseaux sociaux disponibles dans le projet
  const socialMediaIcons = {
    facebook: require('../assets/socialMediaIcons/fb_logo.png'),
    x: require('../assets/socialMediaIcons/x_logo.png'),
    linkedin: require('../assets/socialMediaIcons/linkedin_logo.png'),
    instagram: require('../assets/socialMediaIcons/instagram_logo.png'),
    tiktok: require('../assets/socialMediaIcons/tiktok_logo.png'),
    snapchat: require('../assets/socialMediaIcons/snapchat_logo.png'),
    youtube: require('../assets/socialMediaIcons/yt_logo.png'),
  };

  // Liste des réseaux à afficher (toujours visibles, même si 0)
  const supportedNetworks = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'snapchat', label: 'Snapchat' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'x', label: 'X' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'youtube', label: 'YouTube' },
  ];

  // Geste de retour (slide de gauche vers la droite)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => {
        const isH = Math.abs(g.dx) > Math.abs(g.dy);
        return isH && g.dx > 10; // gauche -> droite
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dx > 60 || g.vx > 0.3) {
          onBack && onBack();
        }
      },
    })
  ).current;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await getStatsOverview('30d');
      setData(res || null);
    } catch (e) {
      setError("Impossible de récupérer les statistiques");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasAccess) return; // ne pas charger si pas d'accès
    load();
  }, [hasAccess]);

  // One-shot recheck on mount in case context is stale right after upgrade
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (hasAccess) return;
        const res = await getMyUser();
        const me = res?.user;
        if (cancelled) return;
        // Recheck access with fresh user data (admin/moderator also have premium access)
        const freshHasPremiumAccess = me?.isPremium || me?.role === 'admin' || me?.role === 'moderator';
        const freshHasAccess = (statisticsEnabled || premiumEnabled) && (!premiumEnabled || freshHasPremiumAccess);
        if (freshHasAccess) {
          // trigger load paths by updating a local state dependency
          load();
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
    // run only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchir automatiquement quand un clic social est tracké ailleurs dans l'app
  useEffect(() => {
    if (!hasAccess) return;
    const unsub = subscribe('social_click_tracked', () => { load(); });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [hasAccess]);

  // Polling léger pour récupérer les mises à jour effectuées depuis d'autres appareils
  useEffect(() => {
    if (!hasAccess) return;
    let timer = null;
    const start = () => {
      if (!timer) {
        // rafraîchit toutes les 30 secondes pendant que l'écran est monté et l'app active
        timer = setInterval(() => { load(); }, 30000);
      }
    };
    const stop = () => { if (timer) { try { clearInterval(timer); } catch (_) {} timer = null; } };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start(); else stop();
    });
    start();
    return () => {
      stop();
      try { sub && sub.remove && sub.remove(); } catch (_) {}
    };
  }, [hasAccess]);

  async function loadDetailed() {
    setDetailedLoading(true);
    setDetailedError('');
    try {
      const res = await getDetailedProfileViews(50);
      setDetailed(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      const code = e?.code || e?.response?.code || '';
      if (code === 'PREMIUM_REQUIRED' || e?.status === 403) {
        setDetailedError('Premium requis pour voir la liste des visiteurs.');
      } else {
        setDetailedError("Impossible de récupérer la liste des visiteurs");
      }
      setDetailed([]);
    } finally {
      setDetailedLoading(false);
    }
  }

  // Vue paywall pour les comptes sans accès (stats désactivées ou premium requis)
  if (!hasAccess) {
    // If statistics are disabled globally, show a different message
    const isStatsDisabled = !effectiveStatisticsEnabled;
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: colors.accent }]} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.accent }]}>Statistiques</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.centerBox}>
          <Image
            source={require('../assets/appIcons/userProfile.png')}
            style={{ width: 64, height: 64, tintColor: colors.accent, marginBottom: 16, opacity: 0.5 }}
          />
          {isStatsDisabled ? (
            <>
              <Text style={[styles.paywallTitle, { color: colors.textPrimary }]}>Bientôt disponible 🚀</Text>
              <Text style={[styles.paywallText, { color: colors.textSecondary }]}>
                Les statistiques arrivent très bientôt ! Tu pourras voir qui visite ton profil et tes réseaux sociaux.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.paywallTitle, { color: colors.textPrimary }]}>Qui te stalke ? 👀</Text>
              <Text style={[styles.paywallText, { color: colors.textSecondary }]}>
                Passe en Premium pour découvrir qui visite ton profil et tes réseaux sociaux !
              </Text>
              <TouchableOpacity
                onPress={() => publish('ui:open_premium')}
                style={[styles.paywallBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={styles.paywallBtnText}>Découvrir mes visiteurs</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={onBack} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.textMuted }}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  useEffect(() => { loadDetailed(); }, []);

  useEffect(() => {
    // Reset visible count on refresh of the list
    setVisibleCount(10);
  }, [detailed.length]);

  function timeAgo(ts) {
    try {
      const now = Date.now();
      const t = new Date(ts).getTime();
      const diffMs = Math.max(0, now - t);
      const min = Math.floor(diffMs / (60 * 1000));
      if (min < 60) return `${min} min`;
      const hours = Math.floor(min / 60);
      if (hours < 24) return `${hours} h`;
      const days = Math.floor(hours / 24);
      return `${days} j`;
    } catch (_) {
      return '';
    }
  }

  const clicks = data?.clicksByNetwork || {};
  const getCountFor = (platform) => {
    // Normalisation éventuelle de clés reçues de l'API
    if (platform === 'x') {
      return Number(clicks.x ?? clicks.twitter ?? 0) || 0;
    }
    return Number(clicks[platform] ?? 0) || 0;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: colors.accent }]} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.accent }]}>Mes statistiques</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.errorText, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={[styles.card, { backgroundColor: colors.surface }] }>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Vues de profil</Text>
            <Text style={[styles.metric, { color: colors.accent }]}>{data?.views ?? 0}</Text>
            <Text style={{ color: colors.textMuted }}>sur les 30 derniers jours</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }] }>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Clics par réseau</Text>
            {supportedNetworks.map(({ key, label }) => (
              <View key={key} style={styles.row}>
                <View style={styles.rowLeft}>
                  {socialMediaIcons[key] ? (
                    <Image source={socialMediaIcons[key]} style={styles.smIcon} />
                  ) : (
                    <View style={[styles.smIcon, { backgroundColor: '#ccc', borderRadius: 8 }]} />
                  )}
                  <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
                </View>
                <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{getCountFor(key)}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Dernières visites</Text>
            {detailedLoading ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 8 }} />
            ) : detailedError ? (
              <Text style={{ color: colors.textMuted }}>{detailedError}</Text>
            ) : detailed.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>Aucune visite récente</Text>
            ) : (
              <>
                {detailed.slice(0, visibleCount).map((it) => (
                  <TouchableOpacity
                    key={String(it.id)}
                    style={styles.visitorRow}
                    onPress={() => {
                      if (!onOpenUserProfile || !it?.actor) return;
                      // Map minimal user object expected by profile screen
                      const socials = Array.isArray(it.actor?.socialNetworks)
                        ? it.actor.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
                        : [];
                      const coords = Array.isArray(it.actor?.location?.coordinates)
                        ? it.actor.location.coordinates
                        : null;
                      const u = {
                        _id: it.actor.id || it.actor._id,
                        id: it.actor.id || it.actor._id,
                        username: it.actor.username || it.actor.name || 'Utilisateur',
                        firstName: '',
                        lastName: '',
                        customName: it.actor.name || '',
                        photo: it.actor.profileImageUrl || null,
                        bio: it.actor?.bio || '',
                        socialMedias: socials,
                        locationCoordinates: coords,
                      };
                      onOpenUserProfile(u);
                    }}
                    activeOpacity={0.7}
                  >
                    {it.actor?.profileImageUrl ? (
                      <ImageWithPlaceholder uri={it.actor.profileImageUrl} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPh]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{(it.actor?.name?.[0] || 'U').toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>
                        {it.actor?.name || it.actor?.username || 'Utilisateur'}
                      </Text>
                      <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{timeAgo(it.at)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {visibleCount < detailed.length && (
                  <TouchableOpacity onPress={() => setVisibleCount((c) => Math.min(c + 10, detailed.length))} style={styles.moreBtn}>
                    <Text style={[styles.moreTxt, { color: colors.accent }]}>Afficher plus</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: height * 0.02 },
  backBtn: { padding: 8 },
  backIcon: { width: 28, height: 28 },
  title: { fontSize: Math.min(width * 0.07, 28), fontWeight: 'bold' },
  // Tabs supprimés (on affiche uniquement les 30 derniers jours)
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  metric: { fontSize: 36, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smIcon: { width: 22, height: 22, marginRight: 10, borderRadius: 6 },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 16, fontWeight: '700' },
  visitorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
  moreBtn: { paddingVertical: 10, alignItems: 'center' },
  moreTxt: { fontWeight: '700' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  paywallTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  paywallText: { fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  paywallBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  paywallBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

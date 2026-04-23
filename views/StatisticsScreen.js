import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, ScrollView, Image, PanResponder, AppState, Platform } from 'react-native';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import { getStatsOverview, getDetailedProfileViews, getMyUser } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
import { subscribe, publish } from '../components/EventBus';
import { UserContext } from '../components/contexts/UserContext';

const mapBackendUser = (u = {}) => {
  const socialMedias = Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : (Array.isArray(u.socialMedias) ? u.socialMedias : (Array.isArray(u.socialMedia) ? u.socialMedia : []));
  return {
    ...u,
    _id: u._id || u.id,
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || u.photo || null,
    socialMedias,
    socialMedia: socialMedias,
    isPremium: !!u.isPremium,
    role: u.role || 'user',
    status: u.status || 'green',
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
    moderation: u.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', lastWarningType: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
    updatedAt: u.updatedAt,
  };
};

import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { usePremiumAccess } from '../hooks/usePremiumAccess';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen({ onBack, onOpenUserProfile }) {
  const { colors, isDark } = useTheme();
  const { user } = useContext(UserContext);
  const { hasStatsAccess: hasAccess, premiumSystemEnabled: premiumEnabled, statisticsSystemEnabled: statisticsEnabled, effectiveStatisticsEnabled } = usePremiumAccess();
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
    if (!hasAccess) {
      // Redirection immédiate si pas d'accès
      publish('social_click_tracked'); // Trigger un refresh si besoin ailleurs
      onBack && onBack();
      return;
    }
    load();
  }, [hasAccess]);

  // One-shot recheck on mount in case context is stale right after upgrade
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (hasAccess) return;
        const res = await getMyUser({ cache: 'reload' });
        const me = res?.user;
        if (cancelled) return;
        if (me && updateUser) {
          updateUser(mapBackendUser(me));
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
      // Logic for 403 handling is now handled by looking at item.actor.isBlurred
      setDetailedError("Impossible de récupérer la liste des visiteurs");
      setDetailed([]);
    } finally {
      setDetailedLoading(false);
    }
  }

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

  useEffect(() => { if (hasAccess) loadDetailed(); }, [hasAccess]);

  useEffect(() => {
    // Reset visible count on refresh of the list
    setVisibleCount(10);
  }, [detailed.length]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
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
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.text }]}>Statistiques</Text>
        <View style={{ width: 40 }} />
      </View>

      {!hasAccess ? (
        <View style={styles.centerBox}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 30, padding: 30, alignItems: 'center', width: '100%' }}>
            <Image
              source={require('../assets/appIcons/userProfile.png')}
              style={{ width: 64, height: 64, tintColor: '#00c2cb', marginBottom: 20, opacity: 0.8 }}
            />
            {!effectiveStatisticsEnabled ? (
              <>
                <Text style={[styles.paywallTitle, { color: isDark ? '#fff' : colors.text }]}>Bientôt disponible 🚀</Text>
                <Text style={[styles.paywallText, { color: isDark ? '#fff' : colors.text, opacity: isDark ? 0.9 : 0.7 }]}>
                  Les statistiques arrivent très bientôt ! Tu pourras voir qui visite ton profil et tes réseaux sociaux.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.paywallTitle, { color: isDark ? '#fff' : colors.text }]}>Qui te stalke ? 👀</Text>
                <Text style={[styles.paywallText, { color: isDark ? '#fff' : colors.text, opacity: isDark ? 0.9 : 0.7 }]}>
                  Passe en Premium pour découvrir qui visite ton profil et tes réseaux sociaux !
                </Text>
                <TouchableOpacity
                  onPress={() => publish('ui:open_premium')}
                  style={[styles.paywallBtn, { backgroundColor: '#00c2cb' }]}
                >
                  <Text style={styles.paywallBtnText}>Découvrir mes visiteurs</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={onBack} style={{ marginTop: 20 }}>
              <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.5 }}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
          ) : error ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}>
              <Text style={{ color: '#ff4444', textAlign: 'center' }}>{error}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#fff' : colors.text, opacity: 1 }]}>Vues de profil</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={[styles.metric, { color: '#00c2cb' }]}>{data?.views ?? 0}</Text>
                  <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.7, marginLeft: 10 }}>vues</Text>
                </View>
                <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.5, marginTop: 5, fontSize: 12 }}>sur les 30 derniers jours</Text>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#fff' : colors.text, opacity: 1, marginBottom: 15 }]}>Clics par réseau</Text>
                {supportedNetworks.map(({ key, label }, index) => (
                  <View key={key} style={[styles.row, index !== supportedNetworks.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                    <View style={styles.rowLeft}>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                        {socialMediaIcons[key] ? (
                          <Image source={socialMediaIcons[key]} style={styles.smIcon} />
                        ) : (
                          <View style={[styles.smIcon, { backgroundColor: '#ccc' }]} />
                        )}
                      </View>
                      <Text style={[styles.rowLabel, { color: isDark ? '#fff' : colors.text }]}>{label}</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(0,194,203,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
                        <Text style={[styles.rowValue, { color: '#00c2cb' }]}>{getCountFor(key)}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#fff' : colors.text, opacity: 1, marginBottom: 15 }]}>Dernières visites</Text>
                {detailedLoading ? (
                  <ActivityIndicator size="small" color="#00c2cb" style={{ marginVertical: 20 }} />
                ) : detailedError ? (
                  <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.7, textAlign: 'center' }}>{detailedError}</Text>
                ) : detailed.length === 0 ? (
                  <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.7, textAlign: 'center' }}>Aucune visite récente</Text>
                ) : (
                  <>
                    {detailed.slice(0, visibleCount).map((it, idx) => {
                      const isBlurred = it.actor?.isBlurred;
                      return (
                        <TouchableOpacity
                          key={String(it.id)}
                          style={[styles.visitorRow, idx !== Math.min(visibleCount, detailed.length) - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}
                          onPress={() => {
                            if (isBlurred) {
                              publish('ui:open_premium');
                              return;
                            }
                            if (!onOpenUserProfile || !it?.actor) return;
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
                          <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                            {it.actor?.profileImageUrl ? (
                              <ImageWithPlaceholder
                                uri={it.actor.profileImageUrl}
                                style={[styles.avatar, isBlurred && { opacity: 0.3 }]}
                                blurRadius={isBlurred ? 10 : 0}
                              />
                            ) : (
                              <View style={[styles.avatar, styles.avatarPh, isBlurred && { opacity: 0.3 }]}>
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{(it.actor?.name?.[0] || 'U').toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 15 }}>
                            <Text style={{ color: isDark ? '#fff' : colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                              {it.actor?.name || it.actor?.username || 'Utilisateur'}
                            </Text>
                            <Text style={{ color: isDark ? '#fff' : colors.text, opacity: 0.7, marginTop: 2, fontSize: 13 }}>{timeAgo(it.at)}</Text>
                          </View>
                          {isBlurred ? (
                             <Text style={{ fontSize: 18 }}>🔒</Text>
                          ) : (
                            <Image
                                source={require('../assets/appIcons/backArrow.png')}
                                style={{ width: 16, height: 16, tintColor: isDark ? '#fff' : colors.text, opacity: 0.3, transform: [{ rotate: '180deg' }] }}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {visibleCount < detailed.length && (
                      <TouchableOpacity onPress={() => setVisibleCount((c) => Math.min(c + 10, detailed.length))} style={styles.moreBtn}>
                        <Text style={[styles.moreTxt, { color: '#00c2cb' }]}>Afficher plus</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

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
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metric: { fontSize: 36, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  smIcon: { width: 20, height: 20 },
  rowLabel: { fontSize: 16, marginLeft: 12 },
  rowValue: { fontSize: 15, fontWeight: '800' },
  visitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
  moreBtn: { paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  moreTxt: { fontWeight: '700', fontSize: 15 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25 },
  paywallTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 15 },
  paywallText: { fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  paywallBtn: {
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4
  },
  paywallBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});

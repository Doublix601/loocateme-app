import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Image,
  AppState,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { proxifyImageUrl } from '../components/ServerUtils';
import { LinearGradient } from 'expo-linear-gradient';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import { useNavigation } from '@react-navigation/native';
import { getStatsOverview, getDetailedProfileViews, getMyUser } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import { subscribe, publish } from '../components/EventBus';
import { UserContext } from '../components/contexts/UserContext';
import { useNavigateToUser } from '../hooks/useNavigateToUser';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mapBackendUser } from '../utils/mappers';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const navigateToUser = useNavigateToUser();
  const { colors, isDark } = useTheme();
  const { isMoon } = useVibe();
  const { user, updateUser } = useContext(UserContext);
  const {
    hasStatsAccess: hasAccess,
    premiumSystemEnabled: premiumEnabled,
    statisticsSystemEnabled: statisticsEnabled,
    effectiveStatisticsEnabled,
  } = usePremiumAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [detailed, setDetailed] = useState([]);
  const [detailedError, setDetailedError] = useState('');
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [unreadCount, setUnreadCount] = useState(0);

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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await getStatsOverview('30d');
      setData(res || null);
    } catch (e) {
      setError('Impossible de récupérer les statistiques');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasAccess) {
      // Redirection immédiate si pas d'accès
      publish('social_click_tracked'); // Trigger un refresh si besoin ailleurs
      navigation.goBack();
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
    return () => {
      cancelled = true;
    };
    // run only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchir automatiquement quand un clic social est tracké ailleurs dans l'app
  useEffect(() => {
    if (!hasAccess) return;
    const unsub = subscribe('social_click_tracked', () => {
      load();
    });
    return () => {
      try {
        unsub && unsub();
      } catch (_) {}
    };
  }, [hasAccess]);

  // Polling léger pour récupérer les mises à jour effectuées depuis d'autres appareils
  useEffect(() => {
    if (!hasAccess) return;
    let timer = null;
    const start = () => {
      if (!timer) {
        // rafraîchit toutes les 30 secondes pendant que l'écran est monté et l'app active
        timer = setInterval(() => {
          load();
        }, 30000);
      }
    };
    const stop = () => {
      if (timer) {
        try {
          clearInterval(timer);
        } catch (_) {}
        timer = null;
      }
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    start();
    return () => {
      stop();
      try {
        sub && sub.remove && sub.remove();
      } catch (_) {}
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
      setDetailedError('Impossible de récupérer la liste des visiteurs');
      setDetailed([]);
    } finally {
      setDetailedLoading(false);
    }
  }

  function timeAgo(ts) {
    try {
      const diffMs = Math.max(0, Date.now() - new Date(ts).getTime());
      const min = Math.floor(diffMs / 60000);
      if (min < 2) return "À l'instant";
      if (min < 60) return `il y a ${min} min`;
      const hours = Math.floor(min / 60);
      if (hours < 24) return `il y a ${hours}h`;
      if (hours < 48) return 'Hier';
      return `il y a ${Math.floor(hours / 24)} j`;
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

  useEffect(() => {
    if (hasAccess) loadDetailed();
  }, [hasAccess]);

  useEffect(() => {
    setVisibleCount(10);
  }, [detailed.length]);

  // Unread badge: count visits newer than last opened, then mark as seen
  useEffect(() => {
    if (!hasAccess || detailed.length === 0) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@loocateme:stats_last_visited');
        const lastMs = raw ? parseInt(raw, 10) : 0;
        const count = detailed.filter((it) => new Date(it.at).getTime() > lastMs).length;
        setUnreadCount(count);
        await AsyncStorage.setItem('@loocateme:stats_last_visited', String(Date.now()));
      } catch (_) {}
    })();
  }, [hasAccess, detailed.length]);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      {isMoon ? (
        <NightSkyBackground style={StyleSheet.absoluteFill} />
      ) : (
        <DaySkyBackground style={StyleSheet.absoluteFill} />
      )}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={[styles.backButtonCircular, { backgroundColor: 'rgba(0,194,203,0.1)' }]}
          onPress={() => navigation.goBack()}
        >
          <Image
            source={require('../assets/appIcons/backArrow.png')}
            style={[styles.backIcon, { tintColor: '#00c2cb' }]}
          />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.headerTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>Statistiques</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {!hasAccess ? (
        <View style={styles.centerBox}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 30,
              padding: 30,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <Image
              source={require('../assets/appIcons/userProfile.png')}
              style={{ width: 64, height: 64, tintColor: '#00c2cb', marginBottom: 20, opacity: 0.8 }}
            />
            {!effectiveStatisticsEnabled ? (
              <>
                <Text style={[styles.paywallTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>
                  Bientôt disponible 🚀
                </Text>
                <Text
                  style={[
                    styles.paywallText,
                    { color: isDark ? '#fff' : colors.textPrimary, opacity: isDark ? 0.9 : 0.7 },
                  ]}
                >
                  Les statistiques arrivent très bientôt ! Tu pourras voir qui visite ton profil et tes réseaux sociaux.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.paywallTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>
                  Qui te stalke ? 👀
                </Text>
                <Text
                  style={[
                    styles.paywallText,
                    { color: isDark ? '#fff' : colors.textPrimary, opacity: isDark ? 0.9 : 0.7 },
                  ]}
                >
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
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
              <Text style={{ color: isDark ? '#fff' : colors.textPrimary, opacity: 0.5 }}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 20 }} />
          ) : error ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}>
              <Text style={{ color: '#ff4444', textAlign: 'center' }}>{error}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#fff' : colors.textPrimary, opacity: 1 }]}>
                  Vues de profil
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={[styles.metric, { color: '#00c2cb' }]}>{data?.views ?? 0}</Text>
                  <Text style={{ color: isDark ? '#fff' : colors.textPrimary, opacity: 0.7, marginLeft: 10 }}>
                    vues
                  </Text>
                </View>
                <Text style={{ color: isDark ? '#fff' : colors.textPrimary, opacity: 0.5, marginTop: 5, fontSize: 12 }}>
                  sur les 30 derniers jours
                </Text>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? '#fff' : colors.textPrimary, opacity: 1, marginBottom: 15 },
                  ]}
                >
                  Clics par réseau
                </Text>
                {supportedNetworks.map(({ key, label }, index) => (
                  <View
                    key={key}
                    style={[
                      styles.row,
                      index !== supportedNetworks.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      },
                    ]}
                  >
                    <View style={styles.rowLeft}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {socialMediaIcons[key] ? (
                          <Image source={socialMediaIcons[key]} style={styles.smIcon} />
                        ) : (
                          <View style={[styles.smIcon, { backgroundColor: '#ccc' }]} />
                        )}
                      </View>
                      <Text style={[styles.rowLabel, { color: isDark ? '#fff' : colors.textPrimary }]}>{label}</Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: 'rgba(0,194,203,0.1)',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={[styles.rowValue, { color: '#00c2cb' }]}>{getCountFor(key)}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? '#fff' : colors.textPrimary, opacity: 1, marginBottom: 15 },
                  ]}
                >
                  Dernières visites
                </Text>
                {detailedLoading ? (
                  <ActivityIndicator size="small" color="#00c2cb" style={{ marginVertical: 20 }} />
                ) : detailedError ? (
                  <Text style={{ color: isDark ? '#fff' : colors.textPrimary, opacity: 0.7, textAlign: 'center' }}>
                    {detailedError}
                  </Text>
                ) : detailed.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>👻</Text>
                    <Text style={[styles.emptyTitle, { color: isDark ? '#fff' : colors.textPrimary }]}>
                      Personne n'a encore visité ton profil
                    </Text>
                    <Text style={[styles.emptyDesc, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }]}>
                      Continue à explorer des lieux pour être découvert !
                    </Text>
                  </View>
                ) : (
                  <>
                    {(() => {
                      const visible = detailed.slice(0, visibleCount);
                      const blurredCount = visible.filter((it) => it.actor?.isBlurred).length;
                      return (
                        <>
                          {visible.map((it, idx) => {
                            const isBlurred = it.actor?.isBlurred;
                            const displayName = isBlurred
                              ? '···'
                              : it.actor?.name || it.actor?.username || 'Utilisateur';
                            const locationName = it.actor?.currentPoiName || it.actor?.locationName || null;
                            return (
                              <TouchableOpacity
                                key={String(it.id || idx)}
                                style={[
                                  styles.visitorRow,
                                  idx !== Math.min(visibleCount, detailed.length) - 1 && {
                                    borderBottomWidth: 1,
                                    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                  },
                                ]}
                                onPress={() => {
                                  if (isBlurred) {
                                    publish('ui:open_premium');
                                    return;
                                  }
                                  if (!it?.actor) return;
                                  const socials = Array.isArray(it.actor?.socialNetworks)
                                    ? it.actor.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
                                    : [];
                                  const coords = Array.isArray(it.actor?.location?.coordinates)
                                    ? it.actor.location.coordinates
                                    : null;
                                  navigateToUser({
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
                                  });
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={{ borderRadius: 24, overflow: 'hidden' }}>
                                  {it.actor?.profileImageUrl && !isBlurred ? (
                                    <ImageWithPlaceholder uri={it.actor.profileImageUrl} style={styles.avatar} />
                                  ) : (
                                    <View
                                      style={[
                                        styles.avatar,
                                        styles.avatarPh,
                                        isBlurred && {
                                          backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: isBlurred
                                            ? isDark
                                              ? 'rgba(255,255,255,0.3)'
                                              : 'rgba(0,0,0,0.2)'
                                            : '#fff',
                                          fontWeight: 'bold',
                                          fontSize: isBlurred ? 20 : 18,
                                        }}
                                      >
                                        {isBlurred ? '?' : (it.actor?.name?.[0] || 'U').toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 14 }}>
                                  <Text
                                    style={{
                                      color: isDark ? '#fff' : colors.textPrimary,
                                      fontWeight: '700',
                                      fontSize: 15,
                                      letterSpacing: isBlurred ? 2 : 0,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {displayName}
                                  </Text>
                                  {locationName && !isBlurred && (
                                    <Text
                                      style={{ color: '#00c2cb', fontSize: 11, fontWeight: '600', marginTop: 1 }}
                                      numberOfLines={1}
                                    >
                                      📍 {locationName}
                                    </Text>
                                  )}
                                  <Text
                                    style={{
                                      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                                      marginTop: 2,
                                      fontSize: 12,
                                    }}
                                  >
                                    {timeAgo(it.at)}
                                  </Text>
                                </View>
                                {isBlurred ? (
                                  <Text style={{ fontSize: 18, opacity: 0.5 }}>🔒</Text>
                                ) : (
                                  <Image
                                    source={require('../assets/appIcons/backArrow.png')}
                                    style={{
                                      width: 14,
                                      height: 14,
                                      tintColor: isDark ? '#fff' : colors.textPrimary,
                                      opacity: 0.25,
                                      transform: [{ rotate: '180deg' }],
                                    }}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}

                          {/* Paywall CTA when blurred visitors exist */}
                          {blurredCount > 0 && (
                            <View
                              style={[
                                styles.paywallOverlay,
                                { backgroundColor: isDark ? 'rgba(15,15,26,0.95)' : 'rgba(255,255,255,0.95)' },
                              ]}
                            >
                              <Text style={{ fontSize: 28, marginBottom: 6 }}>🔒</Text>
                              <Text
                                style={[
                                  { fontWeight: '800', fontSize: 15, marginBottom: 4, textAlign: 'center' },
                                  { color: isDark ? '#fff' : colors.textPrimary },
                                ]}
                              >
                                {blurredCount} visite{blurredCount > 1 ? 's' : ''} masquée{blurredCount > 1 ? 's' : ''}
                              </Text>
                              <Text
                                style={[
                                  { fontSize: 12, textAlign: 'center', marginBottom: 12 },
                                  { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' },
                                ]}
                              >
                                Passe en Premium pour tout voir
                              </Text>
                              <TouchableOpacity onPress={() => publish('ui:open_premium')} style={styles.paywallCTA}>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                                  Découvrir mes visiteurs
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </>
                      );
                    })()}

                    {visibleCount < detailed.length && (
                      <TouchableOpacity
                        onPress={() => setVisibleCount((c) => Math.min(c + 10, detailed.length))}
                        style={styles.moreBtn}
                      >
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
    shadowRadius: 4,
  },
  paywallBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  unreadBadge: {
    backgroundColor: '#00c2cb',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 10 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  paywallOverlay: {
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.2)',
  },
  paywallCTA: {
    backgroundColor: '#00c2cb',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    elevation: 2,
    shadowColor: '#00c2cb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

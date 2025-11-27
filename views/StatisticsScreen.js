import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, ScrollView, Image, PanResponder } from 'react-native';
import { proxifyImageUrl } from '../components/ServerUtils';
import { getStatsOverview, getDetailedProfileViews } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';
import { subscribe } from '../components/EventBus';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen({ onBack, onOpenUserProfile }) {
  const { colors } = useTheme();
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

  useEffect(() => { load(); }, []);

  // Rafraîchir automatiquement quand un clic social est tracké ailleurs dans l'app
  useEffect(() => {
    const unsub = subscribe('social_click_tracked', () => {
      load();
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  // Polling léger pour récupérer les mises à jour effectuées depuis d'autres appareils
  useEffect(() => {
    let timer = null;
    const start = () => {
      // rafraîchit toutes les 10 secondes pendant que l'écran est monté
      timer = setInterval(() => {
        load();
      }, 10000);
    };
    const stop = () => { if (timer) { try { clearInterval(timer); } catch (_) {} timer = null; } };
    start();
    return () => stop();
  }, []);

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
                      <Image source={{ uri: proxifyImageUrl(it.actor.profileImageUrl) }} style={styles.avatar} />
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
});

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, ScrollView, Image, PanResponder } from 'react-native';
import { getStatsOverview, getDetailedProfileViews } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen({ onBack, onOpenUserProfile }) {
  const { colors } = useTheme();
  const [range, setRange] = useState('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [detailed, setDetailed] = useState([]);
  const [detailedError, setDetailedError] = useState('');
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

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

  async function load(r) {
    setLoading(true);
    setError('');
    try {
      const res = await getStatsOverview(r);
      setData(res || null);
    } catch (e) {
      setError("Impossible de récupérer les statistiques");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(range); }, [range]);

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

  const tabs = [
    { key: 'day', label: 'Jour' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  const clicks = data?.clicksByNetwork || {};
  const clicksEntries = Object.entries(clicks);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Image source={require('../assets/appIcons/backArrow.png')} style={[styles.backIcon, { tintColor: colors.accent }]} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.accent }]}>Mes statistiques</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} onPress={() => setRange(t.key)} style={[styles.tab, range === t.key && { borderBottomColor: colors.accent }]}>
            <Text style={[styles.tabText, { color: range === t.key ? colors.accent : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
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
            <Text style={{ color: colors.textMuted }}>sur la période sélectionnée</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }] }>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Clics par réseau</Text>
            {clicksEntries.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>Aucun clic pour cette période</Text>
            ) : (
              clicksEntries.map(([net, count]) => (
                <View key={net} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{net}</Text>
                  <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{count}</Text>
                </View>
              ))
            )}
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
                      <Image source={{ uri: it.actor.profileImageUrl }} style={styles.avatar} />
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
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ddd', marginTop: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontWeight: '600' },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  metric: { fontSize: 36, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 16, fontWeight: '700' },
  visitorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00c2cb' },
  moreBtn: { paddingVertical: 10, alignItems: 'center' },
  moreTxt: { fontWeight: '700' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { getStatsOverview } from '../components/ApiRequest';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export default function StatisticsScreen({ onBack }) {
  const { colors } = useTheme();
  const [range, setRange] = useState('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

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

  const tabs = [
    { key: 'day', label: 'Jour' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  const clicks = data?.clicksByNetwork || {};
  const clicksEntries = Object.entries(clicks);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>◀</Text>
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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: height * 0.02 },
  backBtn: { padding: 8 },
  backText: { fontSize: 18 },
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
});

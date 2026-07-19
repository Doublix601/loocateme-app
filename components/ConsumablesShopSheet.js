import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, ActivityIndicator, Alert, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './contexts/ThemeContext';
import PremiumService from '../services/PremiumService';
import PremiumNudgeService from '../services/PremiumNudgeService';
import IAPStore from '../services/IAPStore';
import { DEBUG_CONFIG } from '../services/DebugConfig';
import { publish } from './EventBus';
import { usePremiumAccess } from '../hooks/usePremiumAccess';

const HISTORY_KEY = '@loocateme:iap_history_v1';

// Définition des packs consommables (prix affichés en fallback si offerings RevenueCat absents)
const PACKS = [
  {
    id: 'loocateme_boost_pack_1',
    label: '1 Boost',
    emoji: '🔥',
    price: '1,99 €',
    description: 'Remonte en tête pendant 30 min',
    type: 'boost',
    qty: 1,
  },
  {
    id: 'loocateme_boost_pack_5',
    label: '5 Boosts',
    emoji: '🔥',
    price: '7,99 €',
    description: 'Le meilleur rapport qualité/prix',
    type: 'boost',
    qty: 5,
    badge: 'Populaire',
  },
  {
    id: 'loocateme_superlike_pack_3',
    label: '3 Superlikes',
    emoji: '⭐',
    price: '2,99 €',
    description: 'Montre ton intérêt de façon unique',
    type: 'superlike',
    qty: 3,
  },
  {
    id: 'loocateme_superlike_pack_10',
    label: '10 Superlikes',
    emoji: '⭐',
    price: '7,99 €',
    description: 'Pour les vrais connecteurs',
    type: 'superlike',
    qty: 10,
    badge: 'Meilleure offre',
  },
];

async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

async function addToHistory(entry) {
  try {
    const hist = await loadHistory();
    const updated = [entry, ...hist].slice(0, 3);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (_) {}
}

// visible  : bool    — affiché ou non
// onClose  : fn      — fermeture
// userId   : string  — pour analytics IAPStore
const ConsumablesShopSheet = ({ visible, onClose, userId }) => {
  const { colors, isDark } = useTheme();
  const { isPremium, premiumSystemEnabled } = usePremiumAccess();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [boosts, setBoosts] = useState(0);
  const [superlikes, setSuperlikes] = useState(0);
  const [history, setHistory] = useState([]);
  const [offerings, setOfferings] = useState(null);
  const [purchasing, setPurchasing] = useState(null); // pack id en cours
  const [refreshing, setRefreshing] = useState(false);
  const [nudge, setNudge] = useState(null); // note inline "Premium inclut..."

  const refresh = async () => {
    setBoosts(PremiumService.getBoostsRemaining());
    setSuperlikes(PremiumService.getSuperlikesRemaining());
    setHistory(await loadHistory());
  };

  useEffect(() => {
    if (!visible) return;
    refresh();
    IAPStore.getOfferings().then(setOfferings).catch(() => {});
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    return () => {};
  }, [visible]);

  // Note inline "Premium inclut..." : évaluée à l'ouverture du sheet plutôt que via
  // la bannière globale, pour éviter d'empiler deux interruptions concurrentes au
  // moment où l'utilisateur vient déjà de manquer de boosts/superlikes.
  useEffect(() => {
    if (!visible || isPremium) { setNudge(null); return; }
    PremiumNudgeService.evaluate('consumables_depleted', { isPremium, premiumSystemEnabled })
      .then(setNudge)
      .catch(() => setNudge(null));
  }, [visible, isPremium, premiumSystemEnabled]);

  const handleNudgePress = () => {
    if (!nudge) return;
    PremiumNudgeService.recordShown(nudge.id).catch(() => {});
    handleClose();
    // Petit délai pour laisser l'animation de fermeture du sheet se terminer
    // avant de pousser le paywall par-dessus.
    setTimeout(() => publish('ui:open_premium', { source: nudge.source }), 260);
  };

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 400, duration: 250, useNativeDriver: true }).start(() => {
      onClose && onClose();
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await PremiumService.refreshFromBackend();
    await refresh();
    setRefreshing(false);
  };

  const handlePurchase = async (pack) => {
    if (purchasing) return;
    setPurchasing(pack.id);
    try {
      // Trouver le package RevenueCat correspondant
      const rcPkg = offerings?.availablePackages?.find(
        (p) => p.product?.identifier === pack.id
      ) ?? null;

      let result;
      if (rcPkg) {
        result = await IAPStore.purchaseConsumable(rcPkg, userId);
      } else if (DEBUG_CONFIG.IAP_DISABLED) {
        // Mode debug : simuler l'achat directement
        if (pack.type === 'boost') await PremiumService.addBoosts(pack.qty);
        else await PremiumService.addSuperlikes(pack.qty);
        result = { success: true, isMock: true };
      } else {
        Alert.alert('Non disponible', 'Ce pack n\'est pas encore disponible dans le store.');
        return;
      }

      if (result.success) {
        const entry = {
          id: pack.id,
          label: pack.label,
          emoji: pack.emoji,
          price: pack.price,
          at: new Date().toISOString(),
          mock: !!result.isMock,
        };
        await addToHistory(entry);
        await refresh();
        Alert.alert(`${pack.emoji} Achat réussi !`, `${pack.label} ajouté${result.isMock ? ' (simulation)' : ''}.`);
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert('Erreur', e.message || 'Impossible de finaliser l\'achat.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  const bg = isDark ? '#1a1a2e' : colors.background;
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : colors.surface;
  const text = isDark ? '#fff' : colors.textPrimary;
  const sub = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
      <Animated.View style={[styles.sheet, { backgroundColor: bg, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Bannière debug */}
        {DEBUG_CONFIG.IAP_DISABLED && (
          <View style={styles.debugBanner}>
            <Text style={styles.debugBannerText}>⚠️ Paiements désactivés (mode debug)</Text>
          </View>
        )}

        {/* Note inline Premium (remplace la bannière globale pour ne pas empiler
            deux interruptions au moment où le sheet de consommables est déjà ouvert) */}
        {nudge && (
          <TouchableOpacity
            style={[styles.premiumNote, { backgroundColor: isDark ? 'rgba(0,194,203,0.12)' : 'rgba(0,194,203,0.08)' }]}
            onPress={handleNudgePress}
            activeOpacity={0.8}
          >
            <Text style={[styles.premiumNoteText, { color: text }]}>
              <Text style={{ fontWeight: '800' }}>{nudge.title}</Text> — {nudge.message}
            </Text>
          </TouchableOpacity>
        )}

        {/* Compteurs actuels */}
        <View style={[styles.countersRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={styles.counter}>
            <Text style={styles.counterEmoji}>🔥</Text>
            <Text style={[styles.counterNum, { color: text }]}>{boosts}</Text>
            <Text style={[styles.counterLabel, { color: sub }]}>boost{boosts !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[styles.counterDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} />
          <View style={styles.counter}>
            <Text style={styles.counterEmoji}>⭐</Text>
            <Text style={[styles.counterNum, { color: text }]}>{superlikes}</Text>
            <Text style={[styles.counterLabel, { color: sub }]}>superlike{superlikes !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color="#00c2cb" />
              : <Text style={{ fontSize: 18 }}>🔄</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Packs */}
          <Text style={[styles.sectionTitle, { color: sub }]}>RECHARGER</Text>
          {PACKS.map((pack) => {
            const isBuying = purchasing === pack.id;
            return (
              <View key={pack.id} style={[styles.packCard, { backgroundColor: cardBg }]}>
                {pack.badge && (
                  <View style={styles.packBadge}>
                    <Text style={styles.packBadgeText}>{pack.badge}</Text>
                  </View>
                )}
                <View style={styles.packLeft}>
                  <Text style={styles.packEmoji}>{pack.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.packLabel, { color: text }]}>{pack.label}</Text>
                    <Text style={[styles.packDesc, { color: sub }]}>{pack.description}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handlePurchase(pack)}
                  disabled={!!purchasing || DEBUG_CONFIG.IAP_DISABLED && false}
                  style={[styles.packBtn, (isBuying || (purchasing && purchasing !== pack.id)) && { opacity: 0.5 }]}
                >
                  {isBuying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.packBtnText}>
                        {DEBUG_CONFIG.IAP_DISABLED ? 'Simuler' : pack.price}
                      </Text>}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Historique */}
          {history.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: sub, marginTop: 24 }]}>3 DERNIERS ACHATS</Text>
              {history.map((h, idx) => (
                <View key={idx} style={[styles.histRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{h.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontWeight: '700', fontSize: 14 }, { color: text }]}>{h.label}</Text>
                    <Text style={[{ fontSize: 12 }, { color: sub }]}>
                      {new Date(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {h.mock ? ' · simulation' : ''}
                    </Text>
                  </View>
                  <Text style={[{ fontWeight: '700', color: '#00c2cb' }]}>{h.price}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(128,128,128,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  debugBanner: {
    backgroundColor: '#f39c12',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 10,
    marginBottom: 8,
  },
  debugBannerText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  premiumNote: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  premiumNoteText: { fontSize: 13, lineHeight: 18 },
  countersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  counter: { flex: 1, alignItems: 'center' },
  counterEmoji: { fontSize: 22, marginBottom: 4 },
  counterNum: { fontSize: 22, fontWeight: '900' },
  counterLabel: { fontSize: 11, marginTop: 2 },
  counterDivider: { width: 1, height: 50, marginHorizontal: 10 },
  refreshBtn: { padding: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  packCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  packBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#00c2cb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 16,
  },
  packBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  packLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginBottom: 10 },
  packEmoji: { fontSize: 28, marginRight: 14 },
  packLabel: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  packDesc: { fontSize: 12 },
  packBtn: {
    backgroundColor: '#00c2cb',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignSelf: 'flex-end',
    minWidth: 80,
    alignItems: 'center',
  },
  packBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});

export default ConsumablesShopSheet;

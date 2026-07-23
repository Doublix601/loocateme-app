import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import ImageWithPlaceholder from './ImageWithPlaceholder';
import SuperlikeService from '../services/SuperlikeService';
import { useNavigateToUser } from '../hooks/useNavigateToUser';
import { useTheme } from './contexts/ThemeContext';
import { useLocale } from './contexts/LocalizationContext';

const formatDate = (iso, locale) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
};

const SuperlikeHistoryModal = ({ visible, onClose, initialTab = 'received' }) => {
  const { colors, isDark } = useTheme();
  const { locale } = useLocale();
  const navigateToUser = useNavigateToUser();
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [superlikes, setSuperlikes] = useState([]);
  const [acceptingId, setAcceptingId] = useState(null);

  useEffect(() => {
    if (visible) setTab(initialTab || 'received');
  }, [visible, initialTab]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = tab === 'received'
          ? await SuperlikeService.getReceivedHistory()
          : await SuperlikeService.getSentHistory();
        if (!cancelled) setSuperlikes(list);
      } catch (_) {
        if (!cancelled) setSuperlikes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tab]);

  const handleRowPress = (item) => {
    const person = tab === 'received' ? item.sender : item.target;
    if (!person) return;
    onClose?.();
    navigateToUser(person);
  };

  const handleAccept = async (item) => {
    if (acceptingId) return;
    setAcceptingId(item.id);
    try {
      await SuperlikeService.acceptSuperlike(item.id);
      setSuperlikes((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: 'accepted' } : s)));
    } catch (_) {
      // Silently ignore; user can retry
    } finally {
      setAcceptingId(null);
    }
  };

  const emptyText = tab === 'received'
    ? "Personne ne t'a encore superliké."
    : "Tu n'as pas encore envoyé de superlike.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>⭐ Superlikes</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable style={styles.tabButton} onPress={() => setTab('received')}>
                <Text style={[styles.tabLabel, { color: tab === 'received' ? colors.textPrimary : colors.textSecondary }, tab === 'received' && styles.tabLabelActive]}>
                  Reçus
                </Text>
              </Pressable>
              <Pressable style={styles.tabButton} onPress={() => setTab('sent')}>
                <Text style={[styles.tabLabel, { color: tab === 'sent' ? colors.textPrimary : colors.textSecondary }, tab === 'sent' && styles.tabLabelActive]}>
                  Envoyés
                </Text>
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={colors.textPrimary} />
            ) : superlikes.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
            ) : (
              <FlatList
                data={superlikes}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const person = tab === 'received' ? item.sender : item.target;
                  return (
                    <Pressable style={styles.row} onPress={() => handleRowPress(item)}>
                      <ImageWithPlaceholder uri={person?.profileImageUrl} style={styles.avatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                          {person?.name || "Quelqu'un"}
                        </Text>
                        {tab === 'sent' && item.status === 'accepted' ? (
                          <Text style={[styles.connectText, { color: colors.accent || '#FFB800' }]} numberOfLines={2}>
                            {`${person?.name || "Quelqu'un"} a vu ton superlike et souhaite se connecter avec toi !`}
                          </Text>
                        ) : (
                          <Text style={[styles.date, { color: colors.textSecondary }]}>
                            {formatDate(item.createdAt, locale)}
                          </Text>
                        )}
                      </View>
                      {tab === 'received' && item.status !== 'accepted' && (
                        <Pressable
                          style={[styles.acceptButton, { borderColor: colors.textPrimary }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleAccept(item);
                          }}
                          disabled={acceptingId === item.id}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color={colors.textPrimary} />
                          <Text style={[styles.acceptLabel, { color: colors.textPrimary }]}>Valider</Text>
                        </Pressable>
                      )}
                      {tab === 'received' && item.status === 'accepted' && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent || '#FFB800'} />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 20,
  },
  tabButton: {
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
  connectText: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  acceptLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default SuperlikeHistoryModal;

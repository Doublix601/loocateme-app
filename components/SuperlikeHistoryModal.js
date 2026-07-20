import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import ImageWithPlaceholder from './ImageWithPlaceholder';
import SuperlikeService from '../services/SuperlikeService';
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

const SuperlikeHistoryModal = ({ visible, onClose }) => {
    const { colors, isDark } = useTheme();
    const { locale } = useLocale();
    const [loading, setLoading] = useState(false);
    const [superlikes, setSuperlikes] = useState([]);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const list = await SuperlikeService.getReceivedHistory();
                if (!cancelled) setSuperlikes(list);
            } catch (_) {
                if (!cancelled) setSuperlikes([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={StyleSheet.absoluteFill}>
                <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.centerWrap} pointerEvents="box-none">
                    <View style={[styles.card, { backgroundColor: colors.surface }]}>
                        <View style={styles.header}>
                            <Text style={[styles.title, { color: colors.textPrimary }]}>⭐ Superlikes reçus</Text>
                            <Pressable onPress={onClose} hitSlop={12}>
                                <Ionicons name="close" size={22} color={colors.textPrimary} />
                            </Pressable>
                        </View>

                        {loading ? (
                            <ActivityIndicator style={{ marginVertical: 24 }} color={colors.textPrimary} />
                        ) : superlikes.length === 0 ? (
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                Personne ne t'a encore superliké.
                            </Text>
                        ) : (
                            <FlatList
                                data={superlikes}
                                keyExtractor={(item) => String(item.id)}
                                style={{ maxHeight: 360 }}
                                renderItem={({ item }) => (
                                    <View style={styles.row}>
                                        <ImageWithPlaceholder
                                            uri={item.sender?.profileImageUrl}
                                            style={styles.avatar}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {item.sender?.name || 'Quelqu\'un'}
                                            </Text>
                                            <Text style={[styles.date, { color: colors.textSecondary }]}>
                                                {formatDate(item.createdAt, locale)}
                                            </Text>
                                        </View>
                                    </View>
                                )}
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
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
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
});

export default SuperlikeHistoryModal;

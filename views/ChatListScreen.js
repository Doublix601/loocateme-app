import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { proxifyImageUrl } from '../components/ServerUtils';
import { publish } from '../components/EventBus';
import { listConversations as apiListConversations } from '../components/ApiRequest';

const ChatListScreen = ({ navigation }) => {
    const { colors, isDark } = useTheme();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        let mounted = true;
        const fetchConversations = async () => {
            try {
                const res = await apiListConversations();
                const raw = res?.conversations || res?.items || res || [];
                const items = Array.isArray(raw) ? raw : [];
                const mapped = items.map((c) => ({
                    id: c.id || c._id || `${c.otherUser?.id || c.otherUser?._id}`,
                    user: {
                        id: c.otherUser?.id || c.otherUser?._id || c.userId || c.user?.id,
                        username: c.otherUser?.username || c.otherUser?.name || c.otherUser?.customName || 'Utilisateur',
                        photo: c.otherUser?.profileImageUrl || c.otherUser?.photo || null,
                    },
                    lastMessage: c.lastMessage?.type === 'image' ? '[Photo]' : c.lastMessage?.type === 'video' ? '[Vidéo]' : (c.lastMessage?.text || c.lastMessage?.content || c.lastMessageText || ''),
                    timestamp: c.lastMessageAt || c.updatedAt || c.lastMessage?.at || new Date().toISOString(),
                    unreadCount: c.unreadCount || 0,
                }));
                if (mounted) setConversations(mapped);
            } catch (_) {
                if (mounted) setConversations([]);
            } finally {
                if (mounted) { setLoading(false); setRefreshing(false); }
            }
        };
        fetchConversations();
        return () => { mounted = false; };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            const res = await apiListConversations();
            const raw = res?.conversations || res?.items || res || [];
            const items = Array.isArray(raw) ? raw : [];
            const mapped = items.map((c) => ({
                id: c.id || c._id || `${c.otherUser?.id || c.otherUser?._id}`,
                user: {
                    id: c.otherUser?.id || c.otherUser?._id || c.userId || c.user?.id,
                    username: c.otherUser?.username || c.otherUser?.name || c.otherUser?.customName || 'Utilisateur',
                    photo: c.otherUser?.profileImageUrl || c.otherUser?.photo || null,
                },
                lastMessage: c.lastMessage?.type === 'image' ? '[Photo]' : c.lastMessage?.type === 'video' ? '[Vidéo]' : (c.lastMessage?.text || c.lastMessage?.content || c.lastMessageText || ''),
                timestamp: c.lastMessageAt || c.updatedAt || c.lastMessage?.at || new Date().toISOString(),
                unreadCount: c.unreadCount || 0,
            }));
            setConversations(mapped);
        } catch (_) {
            // silent
        } finally {
            setRefreshing(false);
        }
    };

    const renderItem = ({ item }) => {
        const isUnread = item.unreadCount > 0;
        return (
            <TouchableOpacity
                style={[
                    styles.conversationItem,
                    {
                        backgroundColor: isUnread ? colors.surface : colors.surfaceAlt,
                        shadowColor: isDark ? '#000' : colors.accent,
                        elevation: isDark ? 2 : 4,
                    }
                ]}
                onPress={() => navigation.navigate('Conversation', { conversationUser: item.user })}
            >
                <View style={styles.avatarContainer}>
                    {item.user.photo ? (
                        <Image source={{ uri: proxifyImageUrl(item.user.photo) }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent + '20' }]}>
                            <Text style={[styles.avatarInitial, { color: colors.accent }]}>{item.user.username[0].toUpperCase()}</Text>
                        </View>
                    )}
                    {isUnread && (
                        <View style={[styles.unreadBadge, { borderColor: isUnread ? colors.surface : colors.surfaceAlt }]}>
                            <Text style={styles.unreadText}>{item.unreadCount}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.contentContainer}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.username, { color: colors.textPrimary }]} numberOfLines={1}>{item.user.username}</Text>
                        <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                    <Text style={[styles.lastMessage, { color: isUnread ? colors.textPrimary : colors.textSecondary, fontWeight: isUnread ? '600' : '400' }]} numberOfLines={1}>
                        {item.lastMessage}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, {
                backgroundColor: colors.surface,
                borderBottomLeftRadius: 30,
                borderBottomRightRadius: 30,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0.3 : 0.1,
                shadowRadius: 10,
                elevation: 5,
                borderBottomWidth: isDark ? 1 : 0,
                borderBottomColor: 'rgba(255,255,255,0.05)'
            }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.accent + '15' }]}>
                    <Text style={{ fontSize: 20, color: colors.accent }}>✕</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: isDark ? colors.text : colors.accent }]}>Messages</Text>
                <View style={{ width: 40 }} />
            </View>
            <FlatList
                data={conversations}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} tintColor={colors.accent} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIconContainer, { backgroundColor: colors.accent + '10' }]}>
                            <Text style={{ fontSize: 40 }}>💬</Text>
                        </View>
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Aucune conversation pour le moment.</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 20,
        zIndex: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingTop: 20,
        paddingBottom: 40,
    },
    conversationItem: {
        flexDirection: 'row',
        padding: 16,
        marginHorizontal: 20,
        marginVertical: 8,
        borderRadius: 20,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    avatarPlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitial: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    unreadBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF3B30',
        borderRadius: 12,
        minWidth: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
    },
    unreadText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
        paddingHorizontal: 4,
    },
    contentContainer: {
        flex: 1,
        marginLeft: 15,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    username: {
        fontSize: 17,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    timestamp: {
        fontSize: 12,
        fontWeight: '500',
    },
    lastMessage: {
        fontSize: 14,
        lineHeight: 18,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        marginTop: 100,
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    }
});

export default ChatListScreen;

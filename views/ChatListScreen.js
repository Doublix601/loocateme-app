import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '../components/contexts/ThemeContext';
import { proxifyImageUrl } from '../components/ServerUtils';
import { publish } from '../components/EventBus';
import { listConversations as apiListConversations } from '../components/ApiRequest';

const ChatListScreen = ({ navigation }) => {
    const { colors } = useTheme();
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

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.conversationItem, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate('Conversation', { conversationUser: item.user })}
        >
            <View style={styles.avatarContainer}>
                {item.user.photo ? (
                    <Image source={{ uri: proxifyImageUrl(item.user.photo) }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent }]}>
                        <Text style={styles.avatarInitial}>{item.user.username[0]}</Text>
                    </View>
                )}
                {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount}</Text>
                    </View>
                )}
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={[styles.username, { color: colors.textPrimary }]}>{item.user.username}</Text>
                    <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <Text style={[styles.lastMessage, { color: item.unreadCount > 0 ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
                    {item.lastMessage}
                </Text>
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={{ fontSize: 24, color: colors.accent }}>←</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
                <View style={{ width: 40 }} />
            </View>
            <FlatList
                data={conversations}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={{ color: colors.textSecondary }}>Aucune conversation pour le moment.</Text>
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
        paddingHorizontal: 16,
        paddingTop: 40,
        paddingBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    backButton: {
        padding: 8,
    },
    list: {
        paddingBottom: 20,
    },
    conversationItem: {
        flexDirection: 'row',
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    avatarPlaceholder: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitial: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    unreadBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#ff3b30',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    unreadText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 4,
    },
    contentContainer: {
        flex: 1,
        marginLeft: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    username: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    timestamp: {
        fontSize: 12,
    },
    lastMessage: {
        fontSize: 14,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        marginTop: 50,
        alignItems: 'center',
    }
});

export default ChatListScreen;

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../components/contexts/ThemeContext';
import { proxifyImageUrl } from '../components/ServerUtils';
import { publish, subscribe } from '../components/EventBus';
import MessageBubble from '../components/chat/MessageBubble';
import chatService from '../services/ChatService';
import { optimizeImage, generateVideoThumbnail } from '../components/chat/MediaUtils';
import { listConversations, getConversationMessages, sendChatMessage, markConversationRead, uploadChatMedia } from '../components/ApiRequest';

const ConversationScreen = ({ route, navigation }) => {
    const { conversationUser } = route.params;
    const { colors, isDark } = useTheme();
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [conversationId, setConversationId] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const flatListRef = useRef();

    useEffect(() => {
        // Connect (REST fallback = no‑op but keeps event flow consistent)
        chatService.connect();

        let mounted = true;
        const bootstrap = async () => {
            try {
                // 1) Trouver la conversation existante avec cet utilisateur
                const convs = await listConversations();
                const items = Array.isArray(convs?.conversations || convs) ? (convs.conversations || convs) : [];
                const match = items.find(c => (c.otherUser?._id || c.otherUser?.id) === (conversationUser._id || conversationUser.id));
                const convId = match?.id || match?._id || null;
                if (mounted) setConversationId(convId);
                // 2) Charger les messages initiaux si conv existe
                if (convId) {
                    const res = await getConversationMessages(convId, { limit: 20 });
                    const raw = res?.messages || res?.items || res || [];
                    const list = Array.isArray(raw) ? raw : [];
                    if (mounted) {
                        setMessages(list);
                        setHasMore(list.length >= 20);
                    }
                    // Marquer comme lu le dernier message
                    const last = list[list.length - 1];
                    if (last?.id || last?._id) {
                        try { await markConversationRead(convId, { messageId: last.id || last._id }); } catch (_) {}
                    }
                } else {
                    if (mounted) {
                        setMessages([]);
                        setHasMore(false);
                    }
                }
            } catch (e) {
                if (mounted) {
                    setMessages([]);
                    setHasMore(false);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };
        bootstrap();

        const unsubMessage = subscribe('chat:message', (msg) => {
            if (msg.senderId === (conversationUser._id || conversationUser.id)) {
                setMessages(prev => [...prev, msg]);
                if (conversationId) chatService.sendReadReceipt(msg.id, msg.senderId, conversationId);
            }
        });

        const unsubTyping = subscribe('chat:typing', (data) => {
            if (data.senderId === (conversationUser._id || conversationUser.id)) {
                setIsTyping(!!data.isTyping);
            }
        });

        return () => {
            try { unsubMessage && unsubMessage(); } catch (_) {}
            try { unsubTyping && unsubTyping(); } catch (_) {}
            mounted = false;
        };
    }, [conversationUser.id]);

    const handleSendMessage = async () => {
        if (inputText.trim() === '') return;
        try {
            const ok = await chatService.sendMessage(conversationUser.id || conversationUser._id, inputText, 'text');
            if (ok) {
                const myMsg = {
                    id: `tmp_${Date.now()}`,
                    content: inputText,
                    timestamp: new Date().toISOString(),
                    type: 'text',
                    senderId: 'me',
                };
                setMessages(prev => [...prev, myMsg]);
                setInputText('');
            }
        } catch (e) {
            Alert.alert('Erreur', e?.message || "Impossible d’envoyer le message");
        }
    };

    const handlePickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            const asset = result.assets[0];
            try {
                if (asset.type === 'image') {
                    const optimized = await optimizeImage(asset.uri, { maxWidth: 1440, quality: 0.82 });
                    const uploaded = await uploadChatMedia({ media: { uri: optimized.uri, name: `img_${Date.now()}.jpg`, type: 'image/jpeg' } });
                    const mediaUrl = uploaded?.url || uploaded?.mediaUrl || uploaded?.location || optimized.uri;
                    await sendChatMessage({ targetUserId: conversationUser.id || conversationUser._id, type: 'image', mediaUrl });
                    setMessages(prev => [...prev, { id: `tmp_${Date.now()}`, type: 'image', mediaUrl, timestamp: new Date().toISOString(), senderId: 'me' }]);
                } else if (asset.type === 'video') {
                    const thumbUri = await generateVideoThumbnail(asset.uri);
                    const uploaded = await uploadChatMedia({ media: { uri: asset.uri, name: `vid_${Date.now()}.mp4`, type: 'video/mp4' }, thumbnail: thumbUri ? { uri: thumbUri, name: `thumb_${Date.now()}.jpg`, type: 'image/jpeg' } : undefined });
                    const mediaUrl = uploaded?.url || uploaded?.mediaUrl || uploaded?.location || asset.uri;
                    const thumbnailUrl = uploaded?.thumbnailUrl || thumbUri || null;
                    await sendChatMessage({ targetUserId: conversationUser.id || conversationUser._id, type: 'video', mediaUrl, thumbnailUrl });
                    setMessages(prev => [...prev, { id: `tmp_${Date.now()}`, type: 'video', mediaUrl, thumbnailUrl, timestamp: new Date().toISOString(), senderId: 'me' }]);
                }
            } catch (e) {
                Alert.alert('Upload', e?.message || "Échec de l’envoi du média");
            }
        }
    };

    const handleInputFocus = () => {
        chatService.sendTyping(conversationUser.id, true);
    };

    const handleInputBlur = () => {
        chatService.sendTyping(conversationUser.id, false);
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
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

                <View style={styles.headerUser}>
                    <View style={styles.headerAvatarContainer}>
                        {conversationUser.photo ? (
                            <Image source={{ uri: proxifyImageUrl(conversationUser.photo) }} style={styles.headerAvatar} />
                        ) : (
                            <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.accent + '20' }]}>
                                <Text style={[styles.headerAvatarInitial, { color: colors.accent }]}>{conversationUser.username[0].toUpperCase()}</Text>
                            </View>
                        )}
                        <View style={[styles.statusIndicator, { backgroundColor: '#4CD964', borderColor: colors.surface }]} />
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>{conversationUser.username}</Text>
                        {isTyping ? (
                            <Text style={[styles.typingText, { color: colors.accent }]}>en train d'écrire...</Text>
                        ) : (
                            <Text style={[styles.statusText, { color: colors.textSecondary }]}>En ligne</Text>
                        )}
                    </View>
                </View>

                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: conversationUser.id || conversationUser._id })} style={[styles.backButton, { backgroundColor: colors.accent + '15' }]}>
                    <Text style={{ fontSize: 20, color: colors.accent }}>👤</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={({ item, index }) => (
                    <MessageBubble
                        message={{
                            id: item.id || item._id,
                            content: item.text || item.content,
                            type: item.type || (item.mediaUrl ? 'image' : 'text'),
                            mediaUrl: item.mediaUrl,
                            thumbnailUrl: item.thumbnailUrl,
                            timestamp: item.createdAt || item.timestamp,
                            senderId: item.senderId || item.from || item.authorId,
                        }}
                        isMe={(item.senderId || item.from) === 'me' || (item.isMine === true)}
                        recipientAvatar={conversationUser.photo}
                        showReadReceipt={(item.id || item._id) === (messages[messages.length - 1]?.id || messages[messages.length - 1]?._id)}
                    />
                )}
                keyExtractor={item => String(item.id || item._id)}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                ListHeaderComponent={hasMore ? (
                    <TouchableOpacity style={styles.loadMore} disabled={loadingMore} onPress={async () => {
                        if (!conversationId || loadingMore) return;
                        try {
                            setLoadingMore(true);
                            const first = messages[0];
                            const before = first?.id || first?._id;
                            const res = await getConversationMessages(conversationId, { before, limit: 20 });
                            const raw = res?.messages || res?.items || res || [];
                            const older = Array.isArray(raw) ? raw : [];
                            setMessages(prev => [...older, ...prev]);
                            setHasMore(older.length >= 20);
                        } catch (_) {
                            setHasMore(false);
                        } finally {
                            setLoadingMore(false);
                        }
                    }}>
                        <Text style={{ color: colors.accent, fontWeight: '700' }}>Charger plus de messages</Text>
                    </TouchableOpacity>
                ) : null}
                ListFooterComponent={loading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} /> : null}
            />

            <View style={[styles.inputWrapper, { paddingBottom: Platform.OS === 'ios' ? 30 : 15 }]}>
                <View style={[styles.inputContainer, { backgroundColor: colors.surface, shadowColor: isDark ? '#000' : colors.accent }]}>
                    <TouchableOpacity onPress={handlePickMedia} style={[styles.attachButton, { backgroundColor: colors.accent + '15' }]}>
                        <Text style={{ fontSize: 20 }}>📎</Text>
                    </TouchableOpacity>
                    <TextInput
                        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt }]}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Message..."
                        placeholderTextColor={colors.textSecondary}
                        onFocus={handleInputFocus}
                        onBlur={handleInputBlur}
                        multiline
                    />
                    <TouchableOpacity
                        onPress={handleSendMessage}
                        style={[styles.sendButton, { backgroundColor: inputText.trim() ? colors.accent : colors.accent + '30' }]}
                        disabled={!inputText.trim()}
                    >
                        <Text style={{ fontSize: 18, color: '#fff' }}>🚀</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
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
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerUser: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    headerAvatarContainer: {
        position: 'relative',
        marginRight: 10,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    headerAvatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerAvatarInitial: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
    },
    headerInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    headerName: {
        fontSize: 16,
        fontWeight: '800',
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
    },
    typingText: {
        fontSize: 11,
        fontWeight: '600',
        fontStyle: 'italic',
    },
    messageList: {
        paddingVertical: 20,
        paddingHorizontal: 10,
    },
    loadMore: {
        alignItems: 'center',
        padding: 10,
        marginBottom: 10,
    },
    inputWrapper: {
        paddingHorizontal: 15,
        paddingTop: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 8,
        alignItems: 'center',
        borderRadius: 30,
        elevation: 5,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    input: {
        flex: 1,
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        maxHeight: 120,
        marginHorizontal: 8,
        fontSize: 15,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default ConversationScreen;

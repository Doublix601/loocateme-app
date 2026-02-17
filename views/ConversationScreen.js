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
    const { colors } = useTheme();
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
            style={[styles.container, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={{ fontSize: 24, color: colors.accent }}>←</Text>
                </TouchableOpacity>
                <View style={styles.headerUser}>
                    <Text style={[styles.headerName, { color: colors.textPrimary }]}>{conversationUser.username}</Text>
                    {isTyping && <Text style={[styles.typingText, { color: colors.accent }]}>en train d'écrire...</Text>}
                </View>
                <View style={{ width: 40 }} />
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
                        <Text style={{ color: colors.accent }}>Charger plus</Text>
                    </TouchableOpacity>
                ) : null}
                ListFooterComponent={loading ? <ActivityIndicator color={colors.accent} /> : null}
            />

            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TouchableOpacity onPress={handlePickMedia} style={styles.attachButton}>
                    <Text style={{ fontSize: 20 }}>📎</Text>
                </TouchableOpacity>
                <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt }]}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Écrivez un message..."
                    placeholderTextColor={colors.textSecondary}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    multiline
                />
                <TouchableOpacity onPress={handleSendMessage} style={styles.sendButton}>
                    <Text style={{ fontSize: 20, color: colors.accent }}>🚀</Text>
                </TouchableOpacity>
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
        paddingHorizontal: 16,
        paddingTop: 40,
        paddingBottom: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#ccc',
    },
    backButton: {
        padding: 8,
    },
    headerUser: {
        alignItems: 'center',
    },
    headerName: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    typingText: {
        fontSize: 12,
        fontStyle: 'italic',
    },
    messageList: {
        paddingVertical: 16,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        alignItems: 'flex-end',
        borderTopWidth: 1,
    },
    input: {
        flex: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        maxHeight: 100,
        marginHorizontal: 8,
    },
    sendButton: {
        padding: 8,
    },
    attachButton: {
        padding: 8,
    }
});

export default ConversationScreen;

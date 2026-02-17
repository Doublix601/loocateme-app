import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { proxifyImageUrl } from '../ServerUtils';

const { width } = Dimensions.get('window');

const MessageBubble = ({ message, isMe, recipientAvatar, showReadReceipt }) => {
    const { colors } = useTheme();

    const renderContent = () => {
        switch (message.type) {
            case 'image':
                return (
                    <Image
                        source={{ uri: proxifyImageUrl(message.mediaUrl) }}
                        style={styles.mediaContent}
                        resizeMode="cover"
                    />
                );
            case 'video':
                return (
                    <View style={styles.videoPlaceholder}>
                        <Image
                            source={{ uri: proxifyImageUrl(message.thumbnailUrl || message.mediaUrl) }}
                            style={styles.mediaContent}
                            resizeMode="cover"
                        />
                        <View style={styles.playIconContainer}>
                            <Text style={{ fontSize: 30 }}>▶️</Text>
                        </View>
                    </View>
                );
            default:
                return (
                    <Text style={[styles.text, { color: isMe ? '#fff' : colors.textPrimary }]}>
                        {message.content}
                    </Text>
                );
        }
    };

    return (
        <View style={[styles.container, isMe ? styles.myContainer : styles.theirContainer]}>
            <View style={[
                styles.bubble,
                { backgroundColor: isMe ? colors.accent : colors.surfaceAlt },
                isMe ? styles.myBubble : styles.theirBubble
            ]}>
                {renderContent()}
                <Text style={[styles.timestamp, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
            {showReadReceipt && isMe && recipientAvatar && (
                <View style={styles.readReceiptContainer}>
                    <Image source={{ uri: proxifyImageUrl(recipientAvatar) }} style={styles.readReceiptAvatar} />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginVertical: 4,
        paddingHorizontal: 12,
    },
    myContainer: {
        alignItems: 'flex-end',
    },
    theirContainer: {
        alignItems: 'flex-start',
    },
    bubble: {
        padding: 12,
        borderRadius: 20,
        maxWidth: width * 0.75,
    },
    myBubble: {
        borderBottomRightRadius: 4,
    },
    theirBubble: {
        borderBottomLeftRadius: 4,
    },
    text: {
        fontSize: 16,
    },
    timestamp: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    mediaContent: {
        width: width * 0.6,
        height: width * 0.6,
        borderRadius: 12,
        marginBottom: 4,
    },
    videoPlaceholder: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playIconContainer: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.5)',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    readReceiptContainer: {
        marginTop: 2,
    },
    readReceiptAvatar: {
        width: 14,
        height: 14,
        borderRadius: 7,
    },
});

export default MessageBubble;

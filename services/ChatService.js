// Fallback ChatService sans socket.io (API REST only)
import { sendChatMessage, markConversationRead } from '../components/ApiRequest';
import { publish } from '../components/EventBus';

class ChatService {
    constructor() {
        this.connected = true; // REST fallback: considéré "actif"
    }

    connect() {
        // Pas de WebSocket: rien à faire, on publie un état connecté
        try { publish('chat:connected'); } catch (_) {}
    }

    disconnect() {
        try { publish('chat:disconnected'); } catch (_) {}
    }

    // Envoi via API REST
    async sendMessage(recipientId, content, type = 'text', mediaUrl = null) {
        try {
            await sendChatMessage({ targetUserId: recipientId, type, text: type === 'text' ? content : undefined, mediaUrl });
            return true;
        } catch (e) {
            console.warn('[ChatService] Échec envoi message via API', e?.message || e);
            return false;
        }
    }

    // Pas de typing en REST fallback
    sendTyping(_recipientId, _isTyping) { /* no-op */ }

    async sendReadReceipt(messageId, _senderId, conversationId) {
        try {
            if (!conversationId || !messageId) return;
            await markConversationRead(conversationId, { messageId });
        } catch (e) {
            // silencieux
        }
    }
}

const chatService = new ChatService();
export default chatService;

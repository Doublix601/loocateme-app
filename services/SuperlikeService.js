import { post } from '../components/ApiRequest';
import PremiumService from './PremiumService';

const SuperlikeService = {
  getSuperlikesRemaining() {
    return PremiumService.getSuperlikesRemaining();
  },

  // Envoie un superlike à targetUserId.
  // Déclenche une notification push côté backend (endpoint /premium/superlike).
  async send(targetUserId) {
    const remaining = PremiumService.getSuperlikesRemaining();
    if (remaining <= 0) {
      return { success: false, reason: 'no_superlikes' };
    }

    const consumed = await PremiumService.consumeSuperlike();
    if (!consumed) return { success: false, reason: 'no_superlikes' };

    try {
      const res = await post('/premium/superlike', { targetUserId });
      return { success: true, data: res };
    } catch (e) {
      // Rollback si erreur réseau
      await PremiumService.addSuperlikes(1);
      return { success: false, reason: 'network_error', error: e.message };
    }
  },
};

export default SuperlikeService;

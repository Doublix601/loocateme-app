import { Alert } from 'react-native';
import { post } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import PremiumService from './PremiumService';

const ProfileBoostService = {
  getBoostsRemaining() {
    return PremiumService.getBoostsRemaining();
  },

  isActive(boostUntil) {
    if (!boostUntil) return false;
    return new Date(boostUntil) > new Date();
  },

  // Durée du boost en minutes restantes (0 si inactif)
  remainingMinutes(boostUntil) {
    if (!this.isActive(boostUntil)) return 0;
    return Math.max(0, Math.ceil((new Date(boostUntil) - Date.now()) / 60000));
  },

  // Demande confirmation puis active le boost.
  // boostUntil : valeur courante user.boostUntil pour détecter si déjà actif.
  // locationId  : établissement actuel (currentPoiId).
  async activateWithConfirm(locationId, boostUntil) {
    if (this.isActive(boostUntil)) {
      const mins = this.remainingMinutes(boostUntil);
      Alert.alert('Boost déjà actif 🔥', `Ton profil est mis en avant encore ${mins} minute${mins > 1 ? 's' : ''}.`);
      return { success: false, reason: 'already_active' };
    }

    const remaining = PremiumService.getBoostsRemaining();
    if (remaining <= 0) {
      return { success: false, reason: 'no_boosts' };
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Activer un boost 🔥',
        'Le boost démarre immédiatement et dure 30 minutes. Ton profil remonte en tête de la liste de cet établissement.',
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve({ success: false, reason: 'cancelled' }) },
          {
            text: 'Activer',
            onPress: async () => {
              resolve(await ProfileBoostService._activate(locationId));
            },
          },
        ]
      );
    });
  },

  async _activate(locationId) {
    const consumed = await PremiumService.consumeBoost();
    if (!consumed) return { success: false, reason: 'no_boosts' };
    try {
      const res = await post('/premium/boost/activate', { locationId });
      publish('ui:reload');
      return { success: true, boostUntil: res?.boostUntil };
    } catch (e) {
      // Rollback
      await PremiumService.addBoosts(1);
      return { success: false, reason: 'network_error', error: e.message };
    }
  },
};

export default ProfileBoostService;

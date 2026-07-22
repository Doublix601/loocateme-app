import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEBUG_CONFIG } from './DebugConfig';
import { getMyUser, get } from '../components/ApiRequest';

const STORAGE_KEY = '@loocateme:premium_v2';

// Allocations hebdo/mensuelles offertes avec un abonnement actif.
const SUPERLIKE_WEEKLY_ALLOWANCE = 3;

let _state = {
  subscriptionStatus: 'free', // 'free' | 'premium_monthly' | 'premium_yearly'
  boostsRemaining: 0,
  superlikesRemaining: 0,
  lastSyncAt: 0,
};
let _initialized = false;

async function _load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _state = { ..._state, ...parsed };
    }
  } catch (e) {
    console.warn('[PremiumService] load error:', e.message);
  }
}

async function _save() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) {
    console.warn('[PremiumService] save error:', e.message);
  }
}

const PremiumService = {
  async init() {
    if (_initialized) return;
    await _load();
    _initialized = true;
  },

  // Source de vérité pour le statut premium.
  isPremium() {
    if (DEBUG_CONFIG.FORCE_PREMIUM) return true;
    return _state.subscriptionStatus !== 'free';
  },

  getSubscriptionStatus() {
    if (DEBUG_CONFIG.FORCE_PREMIUM) return 'premium_monthly';
    return _state.subscriptionStatus;
  },

  getBoostsRemaining() {
    return _state.boostsRemaining;
  },

  getSuperlikesRemaining() {
    return _state.superlikesRemaining;
  },

  // Décrémente et persiste. Retourne false si stock vide.
  async consumeBoost() {
    if (_state.boostsRemaining <= 0) return false;
    _state.boostsRemaining = Math.max(0, _state.boostsRemaining - 1);
    await _save();
    return true;
  },

  async consumeSuperlike() {
    if (_state.superlikesRemaining <= 0) return false;
    _state.superlikesRemaining = Math.max(0, _state.superlikesRemaining - 1);
    await _save();
    return true;
  },

  // Appelé par IAPStore après un achat consommable.
  async addBoosts(count) {
    _state.boostsRemaining += count;
    await _save();
  },

  async addSuperlikes(count) {
    _state.superlikesRemaining += count;
    await _save();
  },

  // RESET_CONSUMABLES (action debug)
  async resetConsumables() {
    _state.boostsRemaining = 0;
    _state.superlikesRemaining = 0;
    await _save();
  },

  // Synchronise depuis le backend. En cas d'erreur réseau, le cache local reste valide.
  async refreshFromBackend() {
    try {
      const res = await getMyUser({ cache: 'reload' });
      const user = res?.user;
      if (!user) return;

      const wasFree = _state.subscriptionStatus === 'free';
      _state.subscriptionStatus = user.isPremium ? 'premium_monthly' : 'free';
      _state.boostsRemaining = typeof user.boostBalance === 'number' ? user.boostBalance : _state.boostsRemaining;

      if (typeof user.superlikeBalance === 'number') {
        _state.superlikesRemaining = user.superlikeBalance;
      } else if (wasFree && _state.subscriptionStatus !== 'free') {
        _state.superlikesRemaining = SUPERLIKE_WEEKLY_ALLOWANCE;
      }

      // Déclenche le reset hebdomadaire des superlikes si le user est premium
      if (_state.subscriptionStatus !== 'free') {
        try {
          const allowance = await get('/premium/allowance');
          if (typeof allowance?.superlikeBalance === 'number') {
            _state.superlikesRemaining = allowance.superlikeBalance;
          }
        } catch (_) {}
      }

      _state.lastSyncAt = Date.now();
      await _save();
    } catch (e) {
      console.warn('[PremiumService] refreshFromBackend failed, using cache:', e.message);
    }
  },

  // Appelé depuis UserContext après login / mise à jour profil.
  _updateFromUser(user) {
    if (!user) return;
    _state.subscriptionStatus = user.isPremium ? 'premium_monthly' : 'free';
    _state.boostsRemaining = typeof user.boostBalance === 'number' ? user.boostBalance : _state.boostsRemaining;
    if (typeof user.superlikeBalance === 'number') {
      _state.superlikesRemaining = user.superlikeBalance;
    }
    _save();
  },

  getState() {
    return { ..._state };
  },
};

export default PremiumService;

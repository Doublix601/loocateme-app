import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEBUG_CONFIG, IS_EXPO_GO } from './DebugConfig';
import { getMyUser, get } from '../components/ApiRequest';

const STORAGE_KEY = '@loocateme:premium_v2';

let _state = {
  subscriptionStatus: 'free', // 'free' | 'premium_monthly' | 'premium_yearly'
  boostsRemaining: 0,
  superlikesRemaining: 0,
  // Premium = superlikes illimités (aucun décompte). Les comptes gratuits
  // utilisent superlikesRemaining (packs achetés).
  superlikesUnlimited: false,
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

  // Renvoie Infinity quand les superlikes sont illimités (Premium). Les sites
  // d'affichage formatent via utils/formatCount ("∞"), et les gardes de type
  // `x <= 0` / `x > 0` restent correctes avec Infinity.
  getSuperlikesRemaining() {
    if (_state.superlikesUnlimited || (DEBUG_CONFIG.FORCE_PREMIUM && this.isPremium())) return Infinity;
    return _state.superlikesRemaining;
  },

  isSuperlikesUnlimited() {
    return _state.superlikesUnlimited || (DEBUG_CONFIG.FORCE_PREMIUM && this.isPremium());
  },

  // Décrémente et persiste. Retourne false si stock vide.
  async consumeBoost() {
    if (_state.boostsRemaining <= 0) return false;
    _state.boostsRemaining = Math.max(0, _state.boostsRemaining - 1);
    await _save();
    return true;
  },

  async consumeSuperlike() {
    if (this.isSuperlikesUnlimited()) return true; // Premium : pas de décompte
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

      _state.subscriptionStatus = user.isPremium ? 'premium_monthly' : 'free';
      _state.superlikesUnlimited = !!user.isPremium;

      // En Expo Go, les packs consommables (boost/superlike) sont simulés
      // localement (cf. ConsumablesShopSheet.js) car le Test Store RevenueCat
      // ne propose aucun package pour ces produits custom : aucune vraie
      // transaction n'atteint donc jamais le backend. Écraser le solde local
      // avec la valeur serveur (toujours 0) effacerait l'achat simulé à
      // chaque actualisation. Les abonnements, eux, restent synchronisés
      // normalement : le Test Store déclenche un vrai webhook RevenueCat.
      if (!IS_EXPO_GO) {
        _state.boostsRemaining = typeof user.boostBalance === 'number' ? user.boostBalance : _state.boostsRemaining;
        if (typeof user.superlikeBalance === 'number') {
          _state.superlikesRemaining = user.superlikeBalance;
        }

        // Premium : recharge mensuelle du plancher de boosts + confirme le
        // statut « superlikes illimités » (source serveur).
        if (_state.subscriptionStatus !== 'free') {
          try {
            const allowance = await get('/premium/allowance');
            if (typeof allowance?.superlikesUnlimited === 'boolean') {
              _state.superlikesUnlimited = allowance.superlikesUnlimited;
            }
            if (typeof allowance?.boostBalance === 'number') {
              _state.boostsRemaining = allowance.boostBalance;
            }
          } catch (_) {}
        }
      }

      _state.lastSyncAt = Date.now();
      await _save();
    } catch (e) {
      console.warn('[PremiumService] refreshFromBackend failed, using cache:', e.message);
    }
  },

  // Resynchronise le cache local boost/superlike depuis un objet `user` déjà
  // fraîchement récupéré du backend (ex: après un claim de récompense de
  // série) — évite un aller-retour réseau supplémentaire pour une donnée
  // qu'on vient tout juste de recevoir.
  updateFromUser(user) {
    if (!user) return;
    _state.subscriptionStatus = user.isPremium ? 'premium_monthly' : 'free';
    _state.superlikesUnlimited = !!user.isPremium;
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

import Purchases from 'react-native-purchases';
import { logger } from '../utils/logger';
import { DEBUG_CONFIG } from './DebugConfig';
import PremiumService from './PremiumService';
import { post } from '../components/ApiRequest';
import { logAnalyticsEvent } from './AnalyticsService';

// Quantités accordées par pack consommable
const CONSUMABLE_GRANTS = {
  loocateme_boost_pack_1: { boosts: 1, superlikes: 0 },
  loocateme_boost_pack_5: { boosts: 5, superlikes: 0 },
  loocateme_superlike_pack_3: { boosts: 0, superlikes: 3 },
  loocateme_superlike_pack_10: { boosts: 0, superlikes: 10 },
};

function _log(eventName, event) {
  try {
    logger.log('[IAP Analytics]', eventName, JSON.stringify(event));
    logAnalyticsEvent(eventName, event);
  } catch (_) {}
}

const IAPStore = {
  // Récupère l'offering courant RevenueCat.
  // Retourne null si IAP_DISABLED ou en cas d'erreur.
  async getOfferings() {
    if (DEBUG_CONFIG.IAP_DISABLED) return null;
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    } catch (e) {
      console.warn('[IAPStore] getOfferings failed:', e.message);
      return null;
    }
  },

  // Démarre l'essai gratuit 7 jours via le backend (sans paiement).
  async startTrial(userId) {
    try {
      const res = await post('/premium/trial/start', {});
      await PremiumService.refreshFromBackend();
      _log('iap_trial_start', { product_id: 'trial', timestamp: Date.now(), user_id: userId, success: true });
      return { success: true, trialActive: res?.trialActive, premiumTrialEnd: res?.premiumTrialEnd };
    } catch (e) {
      _log('iap_trial_start', { product_id: 'trial', timestamp: Date.now(), user_id: userId, success: false, error: e.message });
      throw e;
    }
  },

  // Achat d'un abonnement (monthly / yearly).
  async purchaseSubscription(pkg, userId) {
    if (DEBUG_CONFIG.IAP_DISABLED) {
      logger.log('[DEBUG] IAP disabled — subscription purchase simulated via trial');
      try {
        await post('/premium/trial/start', {});
      } catch (_) {}
      await PremiumService.refreshFromBackend();
      _log('iap_subscription_purchase', {
        product_id: pkg?.product?.identifier ?? 'simulated',
        timestamp: Date.now(),
        user_id: userId,
        success: true,
        debug: true,
      });
      return { success: true, isMock: true };
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      await PremiumService.refreshFromBackend();
      _log('iap_subscription_purchase', { product_id: pkg?.product?.identifier, timestamp: Date.now(), user_id: userId, success: true });
      return { success: true, customerInfo };
    } catch (e) {
      if (e.userCancelled) return { success: false, cancelled: true };
      _log('iap_subscription_purchase', {
        product_id: pkg?.product?.identifier,
        timestamp: Date.now(),
        user_id: userId,
        success: false,
        error: e.message,
      });
      throw e;
    }
  },

  // Achat d'un consommable (boosts / superlikes).
  async purchaseConsumable(pkg, userId) {
    const productId = pkg?.product?.identifier ?? '';
    const grant = CONSUMABLE_GRANTS[productId] ?? null;

    if (DEBUG_CONFIG.IAP_DISABLED) {
      logger.log('[DEBUG] IAP disabled — consumable purchase simulated');
      if (grant) {
        if (grant.boosts > 0) await PremiumService.addBoosts(grant.boosts);
        if (grant.superlikes > 0) await PremiumService.addSuperlikes(grant.superlikes);
      }
      _log('iap_consumable_purchase', { product_id: productId, timestamp: Date.now(), user_id: userId, success: true, debug: true });
      return { success: true, isMock: true, grant };
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (grant) {
        if (grant.boosts > 0) await PremiumService.addBoosts(grant.boosts);
        if (grant.superlikes > 0) await PremiumService.addSuperlikes(grant.superlikes);
      }
      _log('iap_consumable_purchase', { product_id: productId, timestamp: Date.now(), user_id: userId, success: true });
      return { success: true, customerInfo, grant };
    } catch (e) {
      if (e.userCancelled) return { success: false, cancelled: true };
      _log('iap_consumable_purchase', { product_id: productId, timestamp: Date.now(), user_id: userId, success: false, error: e.message });
      throw e;
    }
  },

  // Restauration des achats existants (App Store / Play Store).
  async restorePurchases(userId) {
    if (DEBUG_CONFIG.IAP_DISABLED) {
      logger.log('[DEBUG] IAP disabled — restore simulated');
      await PremiumService.refreshFromBackend();
      return { success: true, isMock: true };
    }
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      await PremiumService.refreshFromBackend();
      _log('iap_restore', { product_id: 'restore', timestamp: Date.now(), user_id: userId, success: true });
      return { success: true, customerInfo };
    } catch (e) {
      _log('iap_restore', { product_id: 'restore', timestamp: Date.now(), user_id: userId, success: false, error: e.message });
      throw e;
    }
  },
};

export default IAPStore;

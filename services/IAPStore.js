import { Platform, Linking } from 'react-native';
import Purchases from 'react-native-purchases';
import { logger } from '../utils/logger';
import { DEBUG_CONFIG, IS_EXPO_GO } from './DebugConfig';
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

// Garantit que RevenueCat connaît l'utilisateur backend avant un achat réel.
// UserContext appelle déjà Purchases.logIn() à l'hydratation/login, mais ça
// tourne en parallèle de Purchases.configure() au démarrage de l'app : si
// configure() n'a pas encore fini à ce moment-là, logIn() échoue en silence
// et n'est jamais retenté. Sans cet appel juste avant l'achat, RevenueCat
// reste sur un $RCAnonymousID que le webhook /api/iap/webhook ne peut pas
// rattacher à un compte (User.findById échoue) — le passage premium
// n'arrive alors jamais côté serveur, même si l'achat a réussi.
async function _ensureIdentity(userId) {
  if (!userId) return;
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return customerInfo;
  } catch (e) {
    logger.log('[IAPStore] logIn before purchase failed:', e.message);
  }
}

const _wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Le webhook RevenueCat -> backend qui bascule isPremium arrive de façon
// asynchrone (serveur à serveur), après que Purchases.purchasePackage() ait
// déjà résolu côté client. Un unique refreshFromBackend() immédiatement
// après l'achat lit donc souvent encore l'ancien statut. On retente
// quelques fois à intervalle court avant d'abandonner (l'UI restera à jour
// au prochain refresh/mount de toute façon).
async function _refreshPremiumUntilActive(attempts = 4, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    await PremiumService.refreshFromBackend();
    if (PremiumService.isPremium()) return true;
    if (i < attempts - 1) await _wait(delayMs);
  }
  return PremiumService.isPremium();
}

const IAPStore = {
  // Récupère l'offering courant RevenueCat.
  // Retourne null si IAP_DISABLED ou en cas d'erreur.
  async getOfferings() {
    if (DEBUG_CONFIG.IAP_DISABLED) return null;
    // On laisse remonter l'erreur (clé RevenueCat absente/invalide, réseau,
    // offering non configuré) pour que l'appelant bascule sur l'état
    // « Réessayer » au lieu de rester bloqué sur « Chargement des offres… ».
    const offerings = await Purchases.getOfferings();
    if (!offerings?.current) {
      throw new Error('Aucun offering RevenueCat disponible');
    }
    return offerings.current;
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
      await _ensureIdentity(userId);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      await _refreshPremiumUntilActive();
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
      await _ensureIdentity(userId);
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
      await _ensureIdentity(userId);
      const { customerInfo } = await Purchases.restorePurchases();
      await _refreshPremiumUntilActive();
      _log('iap_restore', { product_id: 'restore', timestamp: Date.now(), user_id: userId, success: true });
      return { success: true, customerInfo };
    } catch (e) {
      _log('iap_restore', { product_id: 'restore', timestamp: Date.now(), user_id: userId, success: false, error: e.message });
      throw e;
    }
  },

  // Infos de l'abonnement actif (plan, date de renouvellement, auto-renew).
  // Retourne null si IAP_DISABLED, en Expo Go sans achat simulé, ou en cas d'erreur.
  async getCustomerInfo() {
    if (DEBUG_CONFIG.IAP_DISABLED) return null;
    try {
      const info = await Purchases.getCustomerInfo();
      console.log('[IAPStore][DEBUG] customerInfo.entitlements.active:', JSON.stringify(info?.entitlements?.active));
      return info;
    } catch (e) {
      logger.log('[IAPStore] getCustomerInfo failed:', e.message);
      return null;
    }
  },

  // Ouvre l'interface native de gestion d'abonnement (changement de plan,
  // résiliation) — sur iOS l'App Store gère nativement le report du
  // changement de plan à la fin de la période en cours ; sur Android on
  // ouvre directement la fiche d'abonnement Play Store (pas d'équivalent
  // "showManageSubscriptions" natif côté RevenueCat pour Android).
  // showManageSubscriptions() a besoin du module natif RevenueCat, absent en
  // Expo Go (mode Browser/Test Store) — on retombe alors sur le lien Apple
  // générique, qui fonctionne sans module natif.
  async openManageSubscriptions(productId) {
    try {
      if (Platform.OS === 'ios' && !IS_EXPO_GO) {
        await Purchases.showManageSubscriptions();
      } else if (Platform.OS === 'ios') {
        await Linking.openURL('https://apps.apple.com/account/subscriptions');
      } else {
        const pkg = 'me.loocate.app';
        const url = productId
          ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${pkg}`
          : `https://play.google.com/store/account/subscriptions?package=${pkg}`;
        await Linking.openURL(url);
      }
    } catch (e) {
      logger.log('[IAPStore] openManageSubscriptions failed:', e.message);
      throw e;
    }
  },
};

export default IAPStore;

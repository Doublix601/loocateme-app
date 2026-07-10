import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@loocateme:premium_nudges_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

// Cooldown par signal (jours) appliqué après affichage OU fermeture.
const COOLDOWN_DAYS = {
  radius_limited: 7,
  profile_views: 5,
  consumables_depleted: 3,
  periodic_home: 7,
};

// Ordre de priorité en cas de signaux concurrents dans le même tick.
const PRIORITY = ['consumables_depleted', 'radius_limited', 'profile_views', 'periodic_home'];

const GLOBAL_WEEKLY_CAP = 3; // max nudges affichés, tous signaux confondus, par fenêtre glissante de 7 jours

// Textes centralisés. `profile_views` reprend à l'identique l'ancien Alert.alert
// (services/PremiumService.js historique / UserProfileScreen.js) pour ne pas changer le fond.
const COPY = {
  radius_limited: {
    title: '🗺️ Va plus loin',
    message: "Ta recherche est limitée à 500 m. Passe Premium pour explorer jusqu'à 2 km.",
    source: 'radius_limit',
  },
  profile_views: {
    title: '🔥 Passez Premium !',
    message: "Vous avez consulté plusieurs profils. Passez Premium pour voir qui a visité VOTRE profil et débloquer de nombreuses autres fonctionnalités !",
    source: 'profile_views',
  },
  consumables_depleted: {
    title: '✨ Premium, ça inclut...',
    message: '1 pack de boost + 3 superlikes offerts chaque semaine avec Premium.',
    source: 'consumables_depleted',
  },
  periodic_home: {
    title: '💎 Découvre Premium',
    message: 'Débloque le rayon étendu, les statistiques et plus encore.',
    source: 'periodic_home_banner',
  },
};

function _emptySignalState() {
  return { lastShownAt: 0, lastDismissedAt: 0, counter: 0 };
}

function _emptyState() {
  return {
    signals: {
      radius_limited: _emptySignalState(),
      profile_views: _emptySignalState(),
      consumables_depleted: _emptySignalState(),
      periodic_home: _emptySignalState(),
    },
    global: { shownAtTimestamps: [] },
  };
}

let _state = _emptyState();
let _initialized = false;
// Cap "1 nudge par session app" : volontairement en mémoire seulement (pas persisté),
// sinon "1 par session" deviendrait de facto "1 par jour" au prochain lancement.
let _sessionShown = false;

async function _load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _state = {
        signals: { ..._emptyState().signals, ...(parsed.signals || {}) },
        global: { ..._emptyState().global, ...(parsed.global || {}) },
      };
    }
  } catch (e) {
    console.warn('[PremiumNudgeService] load error:', e.message);
  }
}

async function _save() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) {
    console.warn('[PremiumNudgeService] save error:', e.message);
  }
}

function _log(event) {
  try {
    console.log('[PremiumNudge Analytics]', JSON.stringify(event));
    // TODO: brancher sur votre SDK analytics (Amplitude, Mixpanel, etc.)
  } catch (_) {}
}

function _isEligible(signalId, eligibility) {
  if (!eligibility?.premiumSystemEnabled) return false;
  if (eligibility?.isPremium) return false;
  if (_sessionShown) return false;

  const now = Date.now();
  const sig = _state.signals[signalId] ?? _emptySignalState();
  const cooldownMs = (COOLDOWN_DAYS[signalId] ?? 7) * DAY_MS;
  if (now - sig.lastShownAt < cooldownMs) return false;
  if (now - sig.lastDismissedAt < cooldownMs) return false;

  const recentCount = _state.global.shownAtTimestamps.filter((t) => now - t < 7 * DAY_MS).length;
  if (recentCount >= GLOBAL_WEEKLY_CAP) return false;

  return true;
}

function _buildPayload(signalId) {
  const copy = COPY[signalId];
  if (!copy) return null;
  return { id: signalId, title: copy.title, message: copy.message, source: copy.source };
}

const PremiumNudgeService = {
  async init() {
    if (_initialized) return;
    await _load();
    _initialized = true;
  },

  // Lit l'éligibilité et retourne le payload du nudge à afficher, ou null. Sans effet de bord
  // (n'écrit rien) : c'est recordShown/recordDismissed qui posent les cooldowns, ce qui permet
  // à un appelant d'évaluer "à blanc" sans s'engager à afficher quoi que ce soit.
  async evaluate(signalId, eligibility) {
    await this.init();
    if (!_isEligible(signalId, eligibility)) return null;
    return _buildPayload(signalId);
  },

  // Incrémente un compteur persistant pour `signalId` et ne déclenche `evaluate` qu'au seuil
  // (puis le remet à 0), pour reproduire une cadence "tous les N événements" (ex: profile_views).
  async bumpCounter(signalId, threshold, eligibility) {
    await this.init();
    const sig = _state.signals[signalId] ?? _emptySignalState();
    const count = (sig.counter || 0) + 1;
    if (count >= threshold) {
      _state.signals[signalId] = { ...sig, counter: 0 };
      await _save();
      return this.evaluate(signalId, eligibility);
    }
    _state.signals[signalId] = { ...sig, counter: count };
    await _save();
    return null;
  },

  // Appelé au moment où le nudge est réellement affiché (bannière montée ou note inline rendue).
  async recordShown(signalId) {
    await this.init();
    const now = Date.now();
    const sig = _state.signals[signalId] ?? _emptySignalState();
    _state.signals[signalId] = { ...sig, lastShownAt: now };
    _state.global.shownAtTimestamps = [..._state.global.shownAtTimestamps, now].filter(
      (t) => now - t < 7 * DAY_MS
    );
    _sessionShown = true;
    await _save();
    _log({ signal: signalId, event: 'shown', timestamp: now });
  },

  async recordDismissed(signalId) {
    await this.init();
    const now = Date.now();
    const sig = _state.signals[signalId] ?? _emptySignalState();
    _state.signals[signalId] = { ...sig, lastDismissedAt: now };
    await _save();
    _log({ signal: signalId, event: 'dismissed', timestamp: now });
  },

  // --- Debug / QA (utilisé par DebugScreen.js) ---

  // Bypass cooldown/plafond pour la QA, mais respecte toujours le flag premiumSystemEnabled
  // et le statut premium de l'utilisateur (sinon le bouton "forcer" masquerait un vrai bug de gating).
  async forceSignal(signalId, eligibility) {
    await this.init();
    if (!eligibility?.premiumSystemEnabled || eligibility?.isPremium) return null;
    return _buildPayload(signalId);
  },

  async resetSession() {
    _sessionShown = false;
  },

  async resetAll() {
    _state = _emptyState();
    _sessionShown = false;
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[PremiumNudgeService] resetAll error:', e.message);
    }
  },

  getState() {
    return { ..._state, _sessionShown };
  },
};

export default PremiumNudgeService;

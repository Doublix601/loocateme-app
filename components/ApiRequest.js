// Simple API client for loocateme backend
import { logger } from '../utils/logger';
// Base URL of the backend API
import { getServerAddress } from './ServerUtils';
import Constants from 'expo-constants';
import { publish } from './EventBus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { optimizeImageForUpload } from './ImageUtils';
import { Platform } from 'react-native';

const resolvedBase = process.env.EXPO_PUBLIC_API_URL
  ? String(process.env.EXPO_PUBLIC_API_URL)
  : `${getServerAddress()}/api`;

export const BASE_URL = resolvedBase.replace(/\/$/, '');

const ACCESS_TOKEN_KEY = 'loocateme_access_token';
const REFRESH_TOKEN_KEY = 'loocateme_refresh_token';
const PUSH_TOKEN_KEY = 'loocateme_push_token';

// In-memory access token holder. Persisted via AsyncStorage for auto-login.
let accessToken = null;
// Native (RN) doesn't reliably carry the httpOnly refresh cookie, so the
// refresh token is also returned in the login/signup body and stored here.
let refreshToken = null;
let loggedBaseUrlOnce = false;
const APP_VERSION =
  Constants?.expoConfig?.version ||
  Constants?.manifest2?.extra?.expoClient?.version ||
  Constants?.manifest?.version ||
  process.env.EXPO_APP_VERSION ||
  '0.0.0';

// --- Lightweight cache for GET requests to avoid spamming the API on navigation ---
// Key format: `${method}:${url}` (method is uppercased)
const apiCache = new Map();
// In-flight dedupe for GET requests (avoid bursts)
const inflightRequests = new Map();

// Une rafale de requêtes (ex: plusieurs pull-to-refresh manuels rapprochés)
// peut avoir plusieurs appels en vol simultanément ; si le backend est déjà
// en rate-limit, chacun peut recevoir son propre 429. Sans garde, chaque 429
// republie 'location_rate_limited' et rouvre RateLimitModal (cf. App.js),
// y compris après que l'utilisateur l'a déjà fermée. On ne republie donc
// l'event qu'une fois par fenêtre de rate-limit réelle.
let rateLimitNotifiedUntil = 0;
const RATE_LIMIT_DEFAULT_SUPPRESS_MS = 10 * 1000; // fallback si le header Retry-After/RateLimit-Reset est absent

export function clearApiCache() {
  try {
    apiCache.clear();
  } catch (_) {}
}

export function invalidateApiCacheByPrefix(prefix = '') {
  if (!prefix) return;
  const p = String(prefix);
  for (const key of apiCache.keys()) {
    if (key.includes(p)) apiCache.delete(key);
  }
}

// Préfixes de routes dont la réponse d'une mutation (POST/PUT/PATCH/DELETE)
// contient toujours le document de l'appelant lui-même sous `{ user }` —
// jamais celui d'un autre utilisateur (les actions admin sur d'autres users
// vivent sous /admin, et la lecture du profil d'un autre user est un GET, qui
// ne passe jamais par cette branche). Sert à diffuser cet objet `user` sur
// `api:mutation` pour que UserContext reste synchronisé même si l'appelant
// (ex: check-in via QR code, heartbeat en arrière-plan) ne pense pas à le
// faire lui-même — cf. UserContext.js.
const SELF_USER_MUTATION_PREFIXES = ['/user/', '/users/', '/profile/', '/social/'];
function isSelfUserMutationPath(path) {
  return typeof path === 'string' && SELF_USER_MUTATION_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function setAccessToken(token) {
  accessToken = token || null;
  // Fire-and-forget persistence
  if (token) {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, token).catch(() => {});
  } else {
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setRefreshToken(token) {
  refreshToken = token || null;
  if (token) {
    AsyncStorage.setItem(REFRESH_TOKEN_KEY, token).catch(() => {});
  } else {
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY).catch(() => {});
  }
}

export async function initApiFromStorage() {
  try {
    const stored = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefresh = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    if (storedRefresh) refreshToken = storedRefresh;
    if (stored) {
      accessToken = stored;
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

export async function get(path, options = {}) {
  return request(path, { ...options, method: 'GET' });
}

export async function post(path, body, options = {}) {
  return request(path, { ...options, method: 'POST', body });
}

export async function put(path, body, options = {}) {
  return request(path, { ...options, method: 'PUT', body });
}

export async function patch(path, body, options = {}) {
  return request(path, { ...options, method: 'PATCH', body });
}

export async function del(path, options = {}) {
  return request(path, { ...options, method: 'DELETE' });
}

async function request(
  path,
  {
    method = 'GET',
    body,
    headers = {},
    formData = null,
    retry = true,
    includeCredentials = false,
    timeoutMs,
    suppressAuthHandling = false,
    cache: cacheMode = 'default',
    ttlMs = 30000,
  } = {},
) {
  if (!loggedBaseUrlOnce) {
    logger.log(`[API] Using BASE_URL: ${BASE_URL}`);
    loggedBaseUrlOnce = true;
  }
  // Prepare request init upfront so we can safely append headers below
  const init = {
    method,
    headers: { ...headers },
  };

  // Enforce shouldReload parameter on all API calls except login/signup (backend requirement)
  const isLoginOrSignup =
    typeof path === 'string' && (path.startsWith('/auth/login') || path.startsWith('/auth/signup'));
  let url = `${BASE_URL}${path}`;
  if (!isLoginOrSignup) {
    const joiner = url.includes('?') ? '&' : '?';
    url = `${url}${joiner}shouldReload=1`;
    init.headers['X-Should-Reload'] = '1';
  }

  // Only include credentials when explicitly required (e.g., refresh/logout)
  if (includeCredentials) {
    init.credentials = 'include';
  }

  // Always send current app version so le backend peut imposer une version minimale
  try {
    init.headers['X-App-Version'] = APP_VERSION;
  } catch (_) {}

  if (accessToken) {
    init.headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (formData) {
    // Let the browser set multipart/form-data boundary
    init.body = formData;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const isGet = String(method).toUpperCase() === 'GET';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase());

  const cacheKey = `${String(method).toUpperCase()}:${url}`;
  const inflightKey = `${cacheKey}|${cacheMode}`;

  // Serve from cache for GET requests unless explicit reload is requested
  if (isGet && cacheMode !== 'reload') {
    const cached = apiCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
  }

  // Dedupe in-flight GET requests
  if (isGet && inflightRequests.has(inflightKey)) {
    return inflightRequests.get(inflightKey);
  }

  let res;
  let controller;
  let timeoutId;
  const doFetchWithTimeout = async (targetUrl) => {
    let localController;
    let localTimeoutId;
    const localInit = { ...init };
    if (typeof AbortController !== 'undefined' && timeoutMs && timeoutMs > 0) {
      localController = new AbortController();
      localInit.signal = localController.signal;
    }
    const fetchPromise = fetch(targetUrl, localInit);
    let racePromise = fetchPromise;
    if (timeoutMs && timeoutMs > 0) {
      const timeoutPromise = new Promise((_, reject) => {
        localTimeoutId = setTimeout(() => {
          const err = new Error('Délai dépassé');
          err.code = 'TIMEOUT';
          err.status = 0;
          try {
            localController && localController.abort && localController.abort();
          } catch {}
          reject(err);
        }, timeoutMs);
      });
      racePromise = Promise.race([fetchPromise, timeoutPromise]);
    }
    try {
      const response = await racePromise;
      if (localTimeoutId) {
        try {
          clearTimeout(localTimeoutId);
        } catch {}
      }
      return response;
    } catch (e) {
      if (localTimeoutId) {
        try {
          clearTimeout(localTimeoutId);
        } catch {}
      }
      throw e;
    }
  };

  const runRequest = (async () => {
    try {
      // First attempt
      res = await doFetchWithTimeout(url);
    } catch (networkErr) {
      // Forward TIMEOUT/Abort as-is
      if (
        networkErr &&
        (networkErr.code === 'TIMEOUT' ||
          networkErr.name === 'AbortError' ||
          networkErr.message?.toLowerCase().includes('aborted'))
      ) {
        if (networkErr.code !== 'TIMEOUT') {
          const err = new Error('Délai dépassé');
          err.code = 'TIMEOUT';
          err.status = 0;
          throw err;
        }
        throw networkErr;
      }
      // If network error, try protocol fallback (http <-> https) for same host once
      try {
        const u = new URL(url);
        // Disable fallback for local development (IP addresses or localhost)
        const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || /^192\.168\./.test(u.hostname);

        if (isLocal) {
          throw networkErr; // Skip fallback
        }

        const toggledProtocol = u.protocol === 'http:' ? 'https:' : 'http:';
        const fallbackUrl = `${toggledProtocol}//${u.host}${u.pathname}${u.search}${u.hash}`;
        if (u.protocol === 'https:') {
          // Silent retry for https -> http fallback
          res = await doFetchWithTimeout(fallbackUrl);
        } else {
          console.warn('[API] Network error, retrying with protocol fallback', { from: url, to: fallbackUrl, method });
          res = await doFetchWithTimeout(fallbackUrl);
        }
      } catch (_fallbackErr) {
        console.error('[API] Network error (no fallback succeeded)', {
          url,
          method,
          error: networkErr?.message || networkErr,
        });
        throw networkErr;
      }
    }

    // Attempt refresh on 401 once (only for non-auth endpoints)
    const isAuthPath = typeof path === 'string' && path.startsWith('/auth/');
    // Web uses the httpOnly cookie; native uses the stored refresh token (see refreshAccessToken)
    const canAttemptRefresh = Platform.OS === 'web' || !!refreshToken;
    if (res.status === 401 && retry && accessToken && !isAuthPath && canAttemptRefresh) {
      try {
        const refreshed = await refreshAccessToken();
        if (refreshed?.accessToken) {
          accessToken = refreshed.accessToken;
          // Persist refreshed token
          AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken).catch(() => {});
          return request(path, { method, body, headers, formData, retry: false });
        }
      } catch (refreshErr) {
        console.error('[API] Refresh token failed', {
          url: `${BASE_URL}/auth/refresh`,
          status: refreshErr?.status,
          error: refreshErr?.message || refreshErr,
        });
      }
    }

    // If backend signals UI reload (abonnement changé), publish event and clear cache
    try {
      const headerReload = res?.headers?.get && res.headers.get('X-UI-Reload');
      if (headerReload === '1') {
        try {
          clearApiCache();
        } catch (_) {}
        try {
          publish('ui:reload');
        } catch (_) {}
      }
    } catch (_) {}

    // Parse JSON or throw error
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      // ignore, keep raw text
      data = text;
    }

    if (!res.ok) {
      console.error('[API] Request failed', {
        url,
        method,
        status: res.status,
        code: data?.code,
        message: data?.message,
        response: data,
      });

      // Version minimale requise par le backend
      if (res.status === 426) {
        try {
          publish('force_update_required', {
            status: 426,
            details: data?.details || null,
            message: data?.message || "Veuillez mettre à jour l'application pour continuer.",
          });
        } catch (_) {}
      }

      // Rate-limit spécifique aux endpoints de position (heartbeatLimiter côté
      // API : heartbeat, check-in manuel, correction de check-in).
      // Centralisé ici (plutôt que dans chaque écran qui appelle ces
      // endpoints) pour afficher une seule modale cohérente quel que soit le
      // point d'entrée — cf. RateLimitModal.js, monté globalement dans App.js.
      if (
        res.status === 429 &&
        data?.code === 'RATE_LIMITED' &&
        data?.message === 'Too many location updates' &&
        Date.now() >= rateLimitNotifiedUntil
      ) {
        try {
          const retryAfterHeader = res.headers?.get?.('Retry-After') || res.headers?.get?.('RateLimit-Reset');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
          const suppressMs =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : RATE_LIMIT_DEFAULT_SUPPRESS_MS;
          rateLimitNotifiedUntil = Date.now() + suppressMs;
          publish('location_rate_limited', {
            retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null,
          });
        } catch (_) {}
      }

      // Detect authentication/user-not-found errors and auto-logout
      const code = data?.code;
      const msg = (data?.message || '').toString().toLowerCase();
      // AUTH_MISSING means this specific request carried no token — this can legitimately
      // happen for a not-yet-authenticated user, or as a startup race before the persisted
      // token has been reloaded into memory. It must NOT force a global logout, otherwise a
      // racy unauthenticated call at boot can wipe out a perfectly valid stored session.
      // Only treat 401 as an authentication status. 403s are feature/business restrictions in our app.
      const isAuthStatus = res.status === 401 && code !== 'AUTH_MISSING';
      // Do not treat REFRESH_INVALID as a standalone trigger (avoid logging out on failed /auth/refresh)
      const isAuthCode = code === 'AUTH_INVALID' || code === 'UNAUTHORIZED' || code === 'USER_NOT_FOUND';
      const isUserNotFound404 =
        res.status === 404 && (code === 'NOT_FOUND' || msg.includes('user not found')) && path.startsWith('/users');
      // Do NOT treat business 403 restrictions as auth errors
      const nonAuthForbiddenCodes = new Set([
        'INVISIBLE',
        'PREMIUM_REQUIRED',
        'PLAN_REQUIRED',
        'PAYWALL',
        'PLAN_DOWNGRADED',
      ]);
      const isNonAuthForbidden =
        res.status === 403 && (nonAuthForbiddenCodes.has(String(code)) || msg.includes('premium'));
      const shouldGlobalLogout =
        ((isAuthStatus && !isNonAuthForbidden) || isAuthCode || isUserNotFound404) &&
        !suppressAuthHandling &&
        !isAuthPath;
      if (shouldGlobalLogout) {
        try {
          await logout();
        } finally {
          publish('auth:logout', {
            reason: isUserNotFound404 ? 'USER_NOT_FOUND' : 'AUTH',
            status: res.status,
            code: code || null,
            path,
          });
        }
      }

      const err = new Error(data?.message || `Request failed with ${res.status}`);
      err.status = res.status;
      err.code = data?.code;
      err.details = data?.details;
      err.response = data;
      throw err;
    }

    // Cache successful GET responses
    if (isGet && cacheMode !== 'reload') {
      const expiry = Date.now() + Math.max(0, ttlMs || 0);
      try {
        apiCache.set(cacheKey, { expiry, data });
      } catch (_) {}
    }

    // Invalidation + notification APRÈS que la mutation ait réellement abouti
    // côté backend (et donc après que celui-ci ait lui-même invalidé son cache
    // Redis, ex: locations:v1:*) : publier avant l'envoi de la requête faisait
    // courir fetchNearbyLocations() avant même que le heartbeat/check-in ait
    // atteint le serveur, donc il retombait sur des données encore périmées.
    if (isMutation) {
      try {
        apiCache.clear();
        const selfUser = isSelfUserMutationPath(path) && data && typeof data === 'object' ? data.user || null : null;
        publish('api:mutation', { path, method, user: selfUser });
      } catch (_) {}
    }

    return data;
  })();

  if (isGet) {
    inflightRequests.set(inflightKey, runRequest);
  }

  try {
    return await runRequest;
  } finally {
    if (isGet) inflightRequests.delete(inflightKey);
  }
}

// AUTH
export async function signup({
  email,
  password,
  username,
  firstName = '',
  lastName = '',
  customName = '',
  birthdate,
  gender,
  ageAttested = false,
}) {
  const data = await request('/auth/signup', {
    method: 'POST',
    body: { email, password, username, firstName, lastName, customName, birthdate, gender, ageAttested },
  });
  if (data?.accessToken) setAccessToken(data.accessToken);
  if (data?.refreshToken) setRefreshToken(data.refreshToken);
  try {
    publish('auth:login', { user: data?.user || null });
  } catch (_) {}
  return data;
}

export async function login({ email, password }) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
    timeoutMs: 5000,
    retry: false,
    suppressAuthHandling: true,
  });
  if (data?.accessToken) setAccessToken(data.accessToken);
  if (data?.refreshToken) setRefreshToken(data.refreshToken);
  try {
    publish('auth:login', { user: data?.user || null });
  } catch (_) {}
  return data;
}

export async function socialLogin({ provider, idToken, user }) {
  const data = await request('/auth/social-login', {
    method: 'POST',
    body: { provider, idToken, user },
  });
  if (data?.accessToken) setAccessToken(data.accessToken);
  try {
    publish('auth:login', { user: data?.user || null });
  } catch (_) {}
  return data;
}

export async function refreshAccessToken() {
  // Web relies on the httpOnly cookie set by the backend; native (RN cookies are
  // unreliable) sends the refresh token explicitly in the body instead.
  const body = Platform.OS !== 'web' && refreshToken ? { refreshToken } : undefined;
  const data = await request('/auth/refresh', { method: 'POST', body, retry: false, includeCredentials: true });
  return data;
}

export async function logout() {
  try {
    let pushToken = null;
    try {
      pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    } catch (_) {}
    if (pushToken) {
      try {
        await request('/push/unregister-token', {
          method: 'POST',
          body: { token: pushToken },
          retry: false,
          suppressAuthHandling: true,
        });
      } catch (e) {
        console.warn('[API] Push unregister failed', e?.message || e);
      }
    }
    await request('/auth/logout', {
      method: 'POST',
      body: Platform.OS !== 'web' && refreshToken ? { refreshToken } : undefined,
      includeCredentials: true,
      retry: false,
      suppressAuthHandling: true,
    });
  } catch (e) {
    console.error('[API] Logout error', e);
  } finally {
    setAccessToken(null);
    setRefreshToken(null);
    try {
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {}
    try {
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    } catch {}
    try {
      publish('auth:logout', { reason: 'USER_REQUEST' });
    } catch (_) {}
  }
}

export async function forgotPassword(email) {
  return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function apiChangePassword(currentPassword, newPassword) {
  return request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}

// USERS
export async function getMyUser() {
  // Always bypass cache to avoid stale profile (socials, photo, premium, etc.)
  return request('/users/me', { method: 'GET', cache: 'reload' });
}

export async function getUserById(userId) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/users/${encodeURIComponent(id)}`, { method: 'GET', cache: 'reload' });
}

export async function updateMyLocation({ lat, lon }) {
  return request('/users/location', { method: 'POST', body: { lat, lon } });
}

export async function forceCheckIn({ locationId, lat, lon, bypassDistance, mode }) {
  return request('/users/location/force', { method: 'POST', body: { locationId, lat, lon, bypassDistance, mode } });
}

// Bascule le mode de check-in de l'utilisateur ('auto' : check-in automatique
// par proximité GPS, 'manual' : uniquement via le bouton "Je suis là").
export async function apiUpdateCheckInMode(checkInMode) {
  return request('/users/me/check-in-mode', { method: 'PATCH', body: { checkInMode } });
}

// Active/désactive le mode invisible (masque l'utilisateur des listes/lieux).
export async function apiUpdateInvisibleMode(invisibleMode) {
  return request('/users/me/invisible-mode', { method: 'PATCH', body: { invisibleMode } });
}

// Active/désactive le partage du lieu précis actuel (currentLocation) avec
// les autres utilisateurs, en plus de la ville. Défaut désactivé (RGPD).
export async function apiUpdateShareCurrentLocation(shareCurrentLocation) {
  return request('/users/me/share-current-location', { method: 'PATCH', body: { shareCurrentLocation } });
}

// Active/désactive un type de notification push précis (kind: 'superlike',
// 'profile_view', 'weekly_digest', etc. — voir push.service.js côté backend).
export async function apiUpdateNotificationPreferences(kind, enabled) {
  return request('/users/me/notification-preferences', { method: 'PATCH', body: { kind, enabled: !!enabled } });
}

// Dev only: force un check-out immédiat sans passer par le heartbeat GPS.
// Le backend refuse cette route si NODE_ENV === 'production'.
export async function forceCheckOut() {
  return request('/users/location/force-checkout', { method: 'POST' });
}

export async function getUsersAroundMe({ lat, lon, radius = 2000 }) {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) });
  return request(`/users/nearby?${qs.toString()}`, { method: 'GET' });
}

export async function getPopularUsers({ limit = 10 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  return request(`/users/popular?${qs.toString()}`, { method: 'GET' });
}

export async function getLocations({ lat, lon, limit, vibe, forceFresh } = {}) {
  const params = { lat: String(lat), lon: String(lon) };
  if (limit != null) params.limit = String(limit);
  if (vibe) params.vibe = String(vibe);
  // Contourne le cache Redis côté serveur (pas seulement le cache client déjà
  // court-circuité par `cache: 'reload'` ci-dessous) : réservé au pull-to-refresh
  // manuel, pour ne pas priver les appels silencieux/automatiques du cache.
  if (forceFresh) params.fresh = '1';
  const qs = new URLSearchParams(params);
  // Bypass le cache client (sinon jusqu'à 30s de retard sur un userCount/
  // activeUsers qui vient de changer suite à un check-in, en plus du cache
  // Redis serveur déjà invalidé côté backend) : cf. getLocationById ci-dessous,
  // même raisonnement pour éviter des données de présence périmées.
  const res = await request(`/locations?${qs.toString()}`, { method: 'GET', cache: 'reload' });
  try {
    // Cache léger (id/coords/rayon) pour une estimation optimiste du lieu
    // courant côté client, sans appel serveur (cf. guessLikelyVenueLocally).
    const { cacheNearbyVenues } = await import('../services/NearbyVenueCache');
    cacheNearbyVenues(res?.locations).catch(() => {});
  } catch (_) {}
  return res;
}

export async function getLocationById(id) {
  // Always bypass cache to avoid stale location info/photos on refresh
  return request(`/locations/${id}`, { method: 'GET', cache: 'reload' });
}

export async function getCrossedPathsUsers(locationId, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/locations/${locationId}/crossed-paths?${qs.toString()}`, { method: 'GET' });
}

// Seed unitaire d'un POI Overpass (id `osm:<osmId>`) côté backend pour qu'il
// soit ensuite récupérable par `getLocationById`. À appeler juste avant
// d'ouvrir l'écran de détail d'un lieu OSM affiché dans la liste.
export async function seedOsmLocation({ osmId, name, type, lat, lon }) {
  return request('/locations/osm-seed', {
    method: 'POST',
    body: { osmId, name, type, lat, lon },
  });
}

// Correction proposée par l'utilisateur sur un lieu (nom / type incorrect).
// Part en file de modération côté backend (source: 'user_report').
export async function submitLocationCorrection(locationId, { name, type, reason } = {}) {
  return request(`/locations/${encodeURIComponent(locationId)}/correction`, {
    method: 'POST',
    body: { name, type, reason },
  });
}

export async function updateUserStatus(status) {
  return request('/profile/status', {
    method: 'PATCH',
    body: { status },
  });
}

export async function claimSupervise() {
  return request('/users/streak/claim-supervise', { method: 'POST' });
}

export async function claimBoost() {
  return request('/users/streak/claim-boost', { method: 'POST' });
}

export async function searchUsers({ q, limit = 5, lat, lon, includeUsers = true, includeLocations = true }) {
  const params = { q: String(q || ''), limit: String(limit) };
  if (lat) params.lat = String(lat);
  if (lon) params.lon = String(lon);
  if (includeUsers === false) params.includeUsers = 'false';
  if (includeLocations === false) params.includeLocations = 'false';
  const qs = new URLSearchParams(params);
  // Use cache reload to minimize stale results in DebugScreen searches
  return request(`/users/search?${qs.toString()}`, { method: 'GET', cache: 'reload' });
}

// PREMIUM & IAP
export async function startPremiumTrial() {
  return request('/premium/trial/start', { method: 'POST' });
}

export async function verifyPurchase(isMock = false) {
  return request('/premium/verify', {
    method: 'POST',
    body: { isMock },
  });
}

// PARRAINAGE
export async function getMyReferralInfo() {
  return get('/referrals/me');
}

export async function redeemReferralCode(code) {
  return post('/referrals/redeem', { code });
}

export async function getReferralHistory({ page = 1, limit = 20 } = {}) {
  return get(`/referrals/history?page=${page}&limit=${limit}`);
}

// PROFILE
export async function updateProfile({ username, firstName, lastName, customName, bio }) {
  const body = {};
  if (username !== undefined) body.username = username;
  if (firstName !== undefined) body.firstName = firstName;
  if (lastName !== undefined) body.lastName = lastName;
  if (customName !== undefined) body.customName = customName;
  if (bio !== undefined) body.bio = bio;
  return request('/profile', { method: 'PUT', body });
}

export async function apiRequestEmailChange(newEmail, currentPassword) {
  return request('/users/me/email', { method: 'POST', body: { newEmail, currentPassword } });
}

// Endpoint public (token-based), pas besoin d'authentification.
export async function apiConfirmEmailChange(token) {
  return request('/users/me/email/confirm', { method: 'POST', body: { token } });
}

function guessMimeFromName(name = '') {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function normalizeUploadFile(input) {
  // Accepts:
  // - { uri, name, type }
  // - ImagePicker asset { uri, fileName/name, mimeType/type }
  // - string uri
  if (!input) return null;
  if (typeof input === 'string') {
    const uri = input;
    const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
    const type = guessMimeFromName(name);
    return { uri, name, type };
  }
  const uri = input.uri || input.url;
  const name = input.name || input.fileName || (uri ? uri.split('/').pop() : `photo_${Date.now()}.jpg`);
  const type = input.type || input.mimeType || guessMimeFromName(name);
  if (!uri) return null;
  return { uri, name, type };
}

export async function uploadProfilePhoto(file) {
  const part = normalizeUploadFile(file);
  if (!part) {
    const err = new Error('Invalid file');
    err.code = 'INVALID_FILE';
    throw err;
  }
  // Optimize image before upload to reduce payload size
  let optimized = part;
  try {
    optimized = await optimizeImageForUpload(part, { maxWidth: 1080, quality: 0.9 });
  } catch (_e) {
    // ignore optimization failures, send original
  }
  const form = new FormData();
  form.append('photo', optimized);
  return request('/profile/photo', { method: 'POST', formData: form });
}

export async function deleteProfilePhoto() {
  return request('/profile/photo', { method: 'DELETE' });
}

// SOCIAL
export async function upsertSocial({ type, handle }) {
  const data = await request('/social', { method: 'PUT', body: { type, handle } });
  // Clear GET cache so subsequent getMyUser or lists reflect latest socials immediately
  try {
    clearApiCache();
  } catch (_) {}
  return data;
}

export async function reorderSocial(order) {
  const data = await request('/social/reorder', { method: 'PUT', body: { order } });
  try {
    clearApiCache();
  } catch (_) {}
  return data;
}

export async function removeSocial(type) {
  const data = await request(`/social/${encodeURIComponent(type)}`, { method: 'DELETE' });
  // Clear GET cache so subsequent getMyUser or lists reflect latest socials immediately
  try {
    clearApiCache();
  } catch (_) {}
  return data;
}

// EVENTS & STATS & PUSH & PREMIUM
export async function trackProfileView(targetUserId) {
  return request('/events/profile-view', { method: 'POST', body: { targetUserId } });
}

export async function trackSocialClick(targetUserId, socialNetwork) {
  return request('/events/social-click', { method: 'POST', body: { targetUserId, socialNetwork } });
}

export async function trackUserSearch(query) {
  return request('/events/user-search', { method: 'POST', body: { query } });
}

export async function trackLocationView(locationId) {
  return request('/events/location-view', { method: 'POST', body: { locationId } });
}

export async function updateDemographics({ birthdate, gender }) {
  return request('/profile/demographics', { method: 'PUT', body: { birthdate, gender } });
}

export async function getStatsOverview(range = '30d') {
  const qs = new URLSearchParams({ range });
  return request(`/stats/overview?${qs.toString()}`, { method: 'GET' });
}

export async function getDetailedProfileViews(limit = 50) {
  const qs = new URLSearchParams({ limit: String(limit) });
  return request(`/stats/profile-views/detailed?${qs.toString()}`, { method: 'GET' });
}

export async function registerPushToken({ token, platform = 'unknown' }) {
  const res = await request('/push/register-token', { method: 'POST', body: { token, platform } });
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, String(token));
  } catch (_) {}
  return res;
}

export async function unregisterPushToken({ token }) {
  if (!token) return { success: false, skipped: true };
  return request('/push/unregister-token', {
    method: 'POST',
    body: { token },
    retry: false,
    suppressAuthHandling: true,
  });
}

// REPORTS & BLOCKS
export async function createReport({ reportedUserId, category, reason, description }) {
  return request('/reports', {
    method: 'POST',
    body: { reportedUserId, category, reason, description },
  });
}

export async function getReports({ status = 'pending', page = 1, limit = 50 } = {}) {
  const qs = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  return request(`/reports?${qs.toString()}`, { method: 'GET', cache: 'reload' });
}

export async function actOnReport(reportId, { action, target, durationHours, note, warningType } = {}) {
  const id = String(reportId || '');
  if (!id) throw new Error('reportId requis');
  return request(`/reports/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    body: { action, target, durationHours, note, warningType },
  });
}

export async function searchModerationUsers({ q, limit = 10 }) {
  const qs = new URLSearchParams({ q: String(q || ''), limit: String(limit) });
  return request(`/reports/users/search?${qs.toString()}`, { method: 'GET', cache: 'reload' });
}

export async function moderateUser(userId, { action, count, durationHours, note } = {}) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  const body = { action };
  if (typeof count === 'number') body.count = count;
  if (typeof durationHours === 'number') body.durationHours = durationHours;
  if (typeof note === 'string') body.note = note;
  return request(`/reports/users/${encodeURIComponent(id)}/moderate`, {
    method: 'POST',
    body,
  });
}

export async function getBlockedUsers() {
  return request('/blocks', { method: 'GET' });
}

// COMPTES PRO — modération des candidatures (ModeratorScreen)
export async function getBusinessClaims({ status = 'pending', page = 1, limit = 50 } = {}) {
  const qs = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  return request(`/business-claims?${qs.toString()}`, { method: 'GET', cache: 'reload' });
}

export async function actOnBusinessClaim(claimId, { action, rejectionReason } = {}) {
  const id = String(claimId || '');
  if (!id) throw new Error('claimId requis');
  return request(`/business-claims/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    body: { action, rejectionReason },
  });
}

// CODES PROMO PRO — gestion des avantages compte pro (ModeratorScreen)
export async function getPromoCodes() {
  return request('/promo-codes', { method: 'GET', cache: 'reload' });
}

export async function createPromoCode({ code, discountPercent, trialDays } = {}) {
  const body = { code };
  if (discountPercent !== undefined && discountPercent !== null && discountPercent !== '') {
    body.discountPercent = discountPercent;
  }
  if (trialDays !== undefined && trialDays !== null && trialDays !== '') {
    body.trialDays = trialDays;
  }
  return request('/promo-codes', { method: 'POST', body });
}

export async function deletePromoCode(promoCodeId) {
  const id = String(promoCodeId || '');
  if (!id) throw new Error('promoCodeId requis');
  return request(`/promo-codes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function blockUser(targetUserId) {
  return request('/blocks', { method: 'POST', body: { targetUserId } });
}

export async function unblockUser(blockId) {
  const id = String(blockId || '');
  if (!id) throw new Error('blockId requis');
  return request(`/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Convenience: initialize from a provided token (manual init)
export function initApi({ token } = {}) {
  if (token) setAccessToken(token);
  return { setAccessToken, getAccessToken };
}

// GDPR
export async function getPrivacyPolicy() {
  return request('/gdpr/policy', { method: 'GET' });
}

// Compares the user's accepted/seen policy version against the latest
// published one. `blocking: true` means a MAJOR update requires re-consent;
// `hasUnseenUpdate: true` means a MINOR update can be shown as a dismissible banner.
export async function getPolicyStatus() {
  return request('/gdpr/policy-status', { method: 'GET' });
}

// Explicitly accepts the latest published policy version (blocking modal, MAJOR bump).
export async function acceptPolicyVersion() {
  return request('/gdpr/policy/accept', { method: 'PUT' });
}

// Marks the latest published policy version as "seen" (dismiss the MINOR update banner).
export async function markPolicyVersionSeen() {
  return request('/gdpr/policy/seen', { method: 'PUT' });
}

export async function updateConsent({ accepted, version = 'v1', analytics = false }) {
  return request('/gdpr/consent', { method: 'PUT', body: { accepted, version, analytics } });
}

export async function exportMyData() {
  // Returns JSON; in RN you can present it or save to file if needed
  return request('/gdpr/export', { method: 'POST' });
}

export async function deleteMyAccount({ password }) {
  return request('/gdpr/account', { method: 'DELETE', body: { password }, retry: false });
}

// Préférences de notifications push, par "kind" (ex: new_follower, new_message, ...)
// (apiUpdateInvisibleMode et apiUpdateNotificationPreferences sont déjà définis plus haut)

// ADMIN / DEBUG
export async function setUserPremium(userId, isPremium) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PUT',
    body: { isPremium: !!isPremium },
  });
}

// ADMIN (DebugScreen): recherche de modération — inclut les comptes en mode
// invisible et bannis (contrairement à searchUsers). Accepte aussi un ObjectId.
export async function adminSearchUsers({ q, limit = 20 }) {
  const qs = new URLSearchParams({ q: String(q || ''), limit: String(limit) }).toString();
  return request(`/admin/users/search?${qs}`, { method: 'GET', cache: 'reload' });
}

// ADMIN (DebugScreen): édition fine du premium d'un compte.
// patch: { isPremium?, premiumSource?, premiumExpiresAt?, premiumTrialStart?, premiumTrialEnd? }
// Les dates sont des ISO strings, ou null pour effacer le champ.
export async function adminSetPremium(userId, patch = {}) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/premium`, { method: 'PATCH', body: patch });
}

// ADMIN (DebugScreen): solde de consommables app (boosts / superlikes).
// body: { mode: 'add' | 'set', boost?, superlike?, boostUntil? }
export async function adminSetConsumables(userId, body = {}) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/consumables`, { method: 'POST', body });
}

// ADMIN (DebugScreen): flags de compte. body: { invisibleMode?, checkInMode? }
export async function adminSetAccountFlags(userId, body = {}) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/account-flags`, { method: 'PATCH', body });
}

// ADMIN (DebugScreen): lieu pro géré par ce compte (ownerId), ou { location: null }.
export async function adminGetUserBusiness(userId) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/business`, { method: 'GET', cache: 'reload' });
}

// ADMIN (DebugScreen): override DB du palier pro (ne touche pas Stripe).
// body: { businessTier, periodDays?, grantProOffers?, force? }
export async function adminSetBusinessTier(locationId, body = {}) {
  const id = String(locationId || '');
  if (!id) throw new Error('locationId requis');
  return request(`/admin/business/${encodeURIComponent(id)}/tier`, { method: 'PATCH', body });
}

// ADMIN (DebugScreen): soldes de boosts pro. body: { mode: 'add'|'set', ultra?, pro?, event? }
export async function adminSetBusinessBoosts(locationId, body = {}) {
  const id = String(locationId || '');
  if (!id) throw new Error('locationId requis');
  return request(`/admin/business/${encodeURIComponent(id)}/boosts`, { method: 'POST', body });
}

// FEATURE FLAGS
export async function getFeatureFlags({ cache = 'default', ttlMs = 30000 } = {}) {
  // Public endpoint - no auth required
  return request('/settings/flags', { method: 'GET', cache, ttlMs });
}

// ADMIN: Get all feature flags with details
export async function getAdminFlags() {
  return request('/admin/flags', { method: 'GET', cache: 'reload' });
}

// ADMIN: Update a feature flag
export async function setFeatureFlag(key, enabled) {
  // Ces flags sont globaux (tous les utilisateurs en prod) : le backend exige
  // `confirm: true`. Le garde-fou côté UI est le dialogue de confirmation
  // affiché avant l'appel (cf. DebugScreen.toggleFlag).
  return request(`/admin/flags/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { enabled: !!enabled, confirm: true },
  });
}

// ADMIN: Update user role (admin/moderator/user)
export async function setUserRole(userId, role) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/user-role`, {
    method: 'PUT',
    body: { role },
  });
}

// ADMIN: Unban user
export async function unbanUser(userId) {
  const id = String(userId || '');
  if (!id) throw new Error('userId requis');
  return request(`/admin/users/${encodeURIComponent(id)}/unban`, {
    method: 'PUT',
  });
}

export async function triggerLocationSync() {
  return request('/admin/sync-locations', { method: 'POST' });
}


// Simple API client for loocateme backend
// Base URL of the backend API
import { getServerAddress } from './ServerUtils';
import { publish } from './EventBus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { optimizeImageForUpload } from './ImageUtils';
import { Platform } from 'react-native';

const resolvedBase = process.env.EXPO_PUBLIC_API_URL
  ? String(process.env.EXPO_PUBLIC_API_URL)
  : `${getServerAddress()}/api`;

export const BASE_URL = resolvedBase.replace(/\/$/, '');

const ACCESS_TOKEN_KEY = 'loocateme_access_token';

// In-memory access token holder. Persisted via AsyncStorage for auto-login.
let accessToken = null;
let loggedBaseUrlOnce = false;

// --- Lightweight cache for GET requests to avoid spamming the API on navigation ---
// Key format: `${method}:${url}` (method is uppercased)
const apiCache = new Map();

export function clearApiCache() {
    try { apiCache.clear(); } catch (_) {}
}

export function invalidateApiCacheByPrefix(prefix = '') {
    if (!prefix) return;
    const p = String(prefix);
    for (const key of apiCache.keys()) {
        if (key.includes(p)) apiCache.delete(key);
    }
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

export async function initApiFromStorage() {
    try {
        const stored = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        if (stored) {
            accessToken = stored;
            return stored;
        }
        return null;
    } catch {
        return null;
    }
}

async function request(path, { method = 'GET', body, headers = {}, formData = null, retry = true, includeCredentials = false, timeoutMs, suppressAuthHandling = false, cache: cacheMode = 'default', ttlMs = 30000 } = {}) {
    if (!loggedBaseUrlOnce) {
        console.log(`[API] Using BASE_URL: ${BASE_URL}`);
        loggedBaseUrlOnce = true;
    }
    // Prepare request init upfront so we can safely append headers below
    const init = {
        method,
        headers: { ...headers },
    };

    // Enforce shouldReload parameter on all API calls except login/signup (backend requirement)
    const isLoginOrSignup = typeof path === 'string' && (path.startsWith('/auth/login') || path.startsWith('/auth/signup'));
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
    const cacheKey = `${String(method).toUpperCase()}:${url}`;

    // Serve from cache for GET requests unless explicit reload is requested
    if (isGet && cacheMode !== 'reload') {
        const cached = apiCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
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
                    try { localController && localController.abort && localController.abort(); } catch {}
                    reject(err);
                }, timeoutMs);
            });
            racePromise = Promise.race([fetchPromise, timeoutPromise]);
        }
        try {
            const response = await racePromise;
            if (localTimeoutId) { try { clearTimeout(localTimeoutId); } catch {} }
            return response;
        } catch (e) {
            if (localTimeoutId) { try { clearTimeout(localTimeoutId); } catch {} }
            throw e;
        }
    };

    try {
        // First attempt
        res = await doFetchWithTimeout(url);
    } catch (networkErr) {
        // Forward TIMEOUT/Abort as-is
        if (networkErr && (networkErr.code === 'TIMEOUT' || networkErr.name === 'AbortError' || networkErr.message?.toLowerCase().includes('aborted'))) {
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
            const toggledProtocol = u.protocol === 'http:' ? 'https:' : 'http:';
            const fallbackUrl = `${toggledProtocol}//${u.host}${u.pathname}${u.search}${u.hash}`;
            console.warn('[API] Network error, retrying with protocol fallback', { from: url, to: fallbackUrl, method });
            res = await doFetchWithTimeout(fallbackUrl);
        } catch (_fallbackErr) {
            console.error('[API] Network error (no fallback succeeded)', { url, method, error: networkErr?.message || networkErr });
            throw networkErr;
        }
    }

    // Attempt refresh on 401 once (only for non-auth endpoints)
    const isAuthPath = typeof path === 'string' && path.startsWith('/auth/');
    // Do NOT attempt refresh on native platforms (RN) because backend uses httpOnly cookies → web-only
    const canAttemptRefresh = Platform && Platform.OS === 'web';
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
            console.error('[API] Refresh token failed', { url: `${BASE_URL}/auth/refresh`, status: refreshErr?.status, error: refreshErr?.message || refreshErr });
        }
    }

    // If backend signals UI reload (abonnement changé), publish event and clear cache
    try {
        const headerReload = res?.headers?.get && res.headers.get('X-UI-Reload');
        if (headerReload === '1') {
            try { clearApiCache(); } catch (_) {}
            try { publish('ui:reload'); } catch (_) {}
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
        console.error('[API] Request failed', { url, method, status: res.status, code: data?.code, message: data?.message, response: data });

        // Detect authentication/user-not-found errors and auto-logout
        const code = data?.code;
        const msg = (data?.message || '').toString().toLowerCase();
        // Only treat 401 as an authentication status. 403s are feature/business restrictions in our app.
        const isAuthStatus = res.status === 401;
        // Do not treat REFRESH_INVALID as a standalone trigger (avoid logging out on failed /auth/refresh)
        const isAuthCode = code === 'AUTH_MISSING' || code === 'AUTH_INVALID' || code === 'UNAUTHORIZED' || code === 'USER_NOT_FOUND';
        const isUserNotFound404 = res.status === 404 && (code === 'NOT_FOUND' || msg.includes('user not found')) && path.startsWith('/users');
        // Do NOT treat business 403 restrictions as auth errors
        const nonAuthForbiddenCodes = new Set(['INVISIBLE', 'PREMIUM_REQUIRED', 'PLAN_REQUIRED', 'PAYWALL', 'PLAN_DOWNGRADED']);
        const isNonAuthForbidden = res.status === 403 && (nonAuthForbiddenCodes.has(String(code)) || msg.includes('premium'));
        const shouldGlobalLogout = ((isAuthStatus && !isNonAuthForbidden) || isAuthCode || isUserNotFound404) && !suppressAuthHandling && !isAuthPath;
        if (shouldGlobalLogout) {
            try {
                await logout();
            } finally {
                publish('auth:logout', { reason: isUserNotFound404 ? 'USER_NOT_FOUND' : 'AUTH', status: res.status, code: code || null, path });
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
        try { apiCache.set(cacheKey, { expiry, data }); } catch (_) {}
    }
    return data;
}

// AUTH
export async function signup({ email, password, username, firstName = '', lastName = '', customName = '' }) {
    const data = await request('/auth/signup', {
        method: 'POST',
        body: { email, password, username, firstName, lastName, customName },
    });
    if (data?.accessToken) setAccessToken(data.accessToken);
    try { publish('auth:login', { user: data?.user || null }); } catch (_) {}
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
    try { publish('auth:login', { user: data?.user || null }); } catch (_) {}
    return data;
}

export async function refreshAccessToken() {
    // Uses httpOnly cookie set by backend (works on web; RN native may not include cookies)
    const data = await request('/auth/refresh', { method: 'POST', retry: false, includeCredentials: true });
    return data;
}

export async function logout() {
    try {
        await request('/auth/logout', { method: 'POST', includeCredentials: true, retry: false, suppressAuthHandling: true });
    } catch (e) {
        console.error('[API] Logout error', e);
    } finally {
        setAccessToken(null);
        try { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
        try { publish('auth:logout', { reason: 'USER_REQUEST' }); } catch (_) {}
    }
}

export async function forgotPassword(email) {
    return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

// USERS
export async function getMyUser() {
    // Always bypass cache to avoid stale profile (socials, photo, premium, etc.)
    return request('/users/me', { method: 'GET', cache: 'reload' });
}

export async function updateMyLocation({ lat, lon }) {
    return request('/users/location', { method: 'POST', body: { lat, lon } });
}

export async function getUsersAroundMe({ lat, lon, radius = 2000 }) {
    const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) });
    return request(`/users/nearby?${qs.toString()}`, { method: 'GET' });
}

export async function getPopularUsers({ limit = 10 } = {}) {
    const qs = new URLSearchParams({ limit: String(limit) });
    return request(`/users/popular?${qs.toString()}`, { method: 'GET' });
}

export async function searchUsers({ q, limit = 10 }) {
    const qs = new URLSearchParams({ q: String(q || ''), limit: String(limit) });
    // Use cache reload to minimize stale results in DebugScreen searches
    return request(`/users/search?${qs.toString()}`, { method: 'GET', cache: 'reload' });
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
        optimized = await optimizeImageForUpload(part, { maxWidth: 720, maxHeight: 720, quality: 0.8 });
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
    try { clearApiCache(); } catch (_) {}
    return data;
}

export async function removeSocial(type) {
    const data = await request(`/social/${encodeURIComponent(type)}`, { method: 'DELETE' });
    // Clear GET cache so subsequent getMyUser or lists reflect latest socials immediately
    try { clearApiCache(); } catch (_) {}
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

export async function getStatsOverview(range = '30d') {
    const qs = new URLSearchParams({ range });
    return request(`/stats/overview?${qs.toString()}`, { method: 'GET' });
}

export async function getDetailedProfileViews(limit = 50) {
    const qs = new URLSearchParams({ limit: String(limit) });
    return request(`/stats/profile-views/detailed?${qs.toString()}`, { method: 'GET' });
}

export async function registerPushToken({ token, platform = 'unknown' }) {
    return request('/push/register-token', { method: 'POST', body: { token, platform } });
}

export async function startPremiumTrial() {
    return request('/premium/trial/start', { method: 'POST' });
}

// SETTINGS
export async function setVisibility(isVisible) {
    return request('/settings/visibility', { method: 'PUT', body: { isVisible } });
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

export async function updateConsent({ accepted, version = 'v1', analytics = false, marketing = false }) {
    return request('/gdpr/consent', { method: 'PUT', body: { accepted, version, analytics, marketing } });
}

export async function exportMyData() {
    // Returns JSON; in RN you can present it or save to file if needed
    return request('/gdpr/export', { method: 'POST' });
}

export async function deleteMyAccount({ password }) {
    return request('/gdpr/account', { method: 'DELETE', body: { password }, retry: false });
}

// ADMIN / DEBUG
export async function getAllUsers({ page = 1, limit = 100 } = {}) {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
    // Bypass cache to always fetch fresh data for admin listings used by DebugScreen
    return request(`/admin/users?${p}`, { method: 'GET', cache: 'reload' });
}

export async function setUserPremium(userId, isPremium) {
    const id = String(userId || '');
    if (!id) throw new Error('userId requis');
    return request(`/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PUT',
        body: { isPremium: !!isPremium },
    });
}

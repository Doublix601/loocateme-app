// Simple API client for loocateme backend
// Base URL of the backend API
import { getServerAddress } from './ServerUtils';
import { publish } from './EventBus';
import AsyncStorage from '@react-native-async-storage/async-storage';

const resolvedBase = process.env.EXPO_PUBLIC_API_URL
  ? String(process.env.EXPO_PUBLIC_API_URL)
  : `${getServerAddress()}/api`;

export const BASE_URL = resolvedBase.replace(/\/$/, '');

const ACCESS_TOKEN_KEY = 'loocateme_access_token';

// In-memory access token holder. Persisted via AsyncStorage for auto-login.
let accessToken = null;
let loggedBaseUrlOnce = false;

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

async function request(path, { method = 'GET', body, headers = {}, formData = null, retry = true, includeCredentials = false, timeoutMs, suppressAuthHandling = false } = {}) {
    if (!loggedBaseUrlOnce) {
        console.log(`[API] Using BASE_URL: ${BASE_URL}`);
        loggedBaseUrlOnce = true;
    }
    const url = `${BASE_URL}${path}`;

    const init = {
        method,
        headers: { ...headers },
    };

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

    let res;
    let controller;
    let timeoutId;
    try {
        // If AbortController exists, attach a signal pre-fetch so aborts can cancel the request
        if (typeof AbortController !== 'undefined' && timeoutMs && timeoutMs > 0) {
            controller = new AbortController();
            init.signal = controller.signal;
        }

        const fetchPromise = fetch(url, init);

        let racePromise = fetchPromise;
        if (timeoutMs && timeoutMs > 0) {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const err = new Error('Délai dépassé');
                    err.code = 'TIMEOUT';
                    err.status = 0;
                    // Try to abort underlying fetch if supported
                    try { controller && controller.abort && controller.abort(); } catch {}
                    reject(err);
                }, timeoutMs);
            });
            racePromise = Promise.race([fetchPromise, timeoutPromise]);
        }

        res = await racePromise;
        if (timeoutId) { try { clearTimeout(timeoutId); } catch {} }
    } catch (networkErr) {
        if (timeoutId) { try { clearTimeout(timeoutId); } catch {} }
        // Forward TIMEOUT error as-is
        if (networkErr && (networkErr.code === 'TIMEOUT' || networkErr.name === 'AbortError' || networkErr.message?.toLowerCase().includes('aborted'))) {
            if (networkErr.code !== 'TIMEOUT') {
                const err = new Error('Délai dépassé');
                err.code = 'TIMEOUT';
                err.status = 0;
                throw err;
            }
            throw networkErr;
        }
        console.error('[API] Network error', { url, method, error: networkErr?.message || networkErr });
        throw networkErr;
    }

    // Attempt refresh on 401 once (only for non-auth endpoints)
    const isAuthPath = typeof path === 'string' && path.startsWith('/auth/');
    if (res.status === 401 && retry && accessToken && !isAuthPath) {
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
        const isAuthStatus = res.status === 401 || res.status === 403;
        const isAuthCode = code === 'AUTH_MISSING' || code === 'AUTH_INVALID' || code === 'REFRESH_INVALID' || code === 'UNAUTHORIZED' || code === 'USER_NOT_FOUND';
        const isUserNotFound404 = res.status === 404 && (code === 'NOT_FOUND' || msg.includes('user not found')) && path.startsWith('/users');
        // Do NOT treat visibility restriction as an auth error
        const isVisibilityForbidden = res.status === 403 && code === 'INVISIBLE';
        const shouldGlobalLogout = ((isAuthStatus && !isVisibilityForbidden) || isAuthCode || isUserNotFound404) && !suppressAuthHandling && !isAuthPath;
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

    return data;
}

// AUTH
export async function signup({ email, password, name }) {
    const data = await request('/auth/signup', {
        method: 'POST',
        body: { email, password, name },
    });
    if (data?.accessToken) setAccessToken(data.accessToken);
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
    }
}

export async function forgotPassword(email) {
    return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

// USERS
export async function getMyUser() {
    return request('/users/me', { method: 'GET' });
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
    return request(`/users/search?${qs.toString()}`, { method: 'GET' });
}

// PROFILE
export async function updateProfile({ name, bio }) {
    return request('/profile', { method: 'PUT', body: { name, bio } });
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
    const form = new FormData();
    form.append('photo', part);
    return request('/profile/photo', { method: 'POST', formData: form });
}

export async function deleteProfilePhoto() {
    return request('/profile/photo', { method: 'DELETE' });
}

// SOCIAL
export async function upsertSocial({ type, handle }) {
    return request('/social', { method: 'PUT', body: { type, handle } });
}

export async function removeSocial(type) {
    return request(`/social/${encodeURIComponent(type)}`, { method: 'DELETE' });
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
    return request(`/admin/users?${p}`, { method: 'GET' });
}

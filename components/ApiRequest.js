// Simple API client for loocateme backend
// Base URL of the backend API
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

// In-memory access token holder. In a real app, you can persist it with SecureStore/AsyncStorage if needed.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

async function request(path, { method = 'GET', body, headers = {}, formData = null, retry = true } = {}) {
  const url = `${BASE_URL}${path}`;

  const init = {
    method,
    headers: { ...headers },
    credentials: 'include', // needed for refresh cookie
  };

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

  const res = await fetch(url, init);

  // Attempt refresh on 401 once
  if (res.status === 401 && retry && accessToken) {
    const refreshed = await refreshAccessToken().catch(() => null);
    if (refreshed?.accessToken) {
      accessToken = refreshed.accessToken;
      return request(path, { method, body, headers, formData, retry: false });
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
    const err = new Error(data?.message || `Request failed with ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
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
  });
  if (data?.accessToken) setAccessToken(data.accessToken);
  return data;
}

export async function refreshAccessToken() {
  // Uses httpOnly cookie set by backend
  const data = await request('/auth/refresh', { method: 'POST', retry: false });
  return data;
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
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

export async function getUsersAroundMe({ lat, lon, radius = 300 }) {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) });
  return request(`/users/nearby?${qs.toString()}`, { method: 'GET' });
}

// PROFILE
export async function updateProfile({ name, bio }) {
  return request('/profile', { method: 'PUT', body: { name, bio } });
}

export async function uploadProfilePhoto(file) {
  const form = new FormData();
  form.append('photo', file);
  return request('/profile/photo', { method: 'POST', formData: form });
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

// Convenience: initialize from a persisted token if you have one
export function initApi({ token } = {}) {
  if (token) setAccessToken(token);
  return { setAccessToken, getAccessToken };
}

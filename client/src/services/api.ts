import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';
import { router } from 'expo-router';

const rawUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const BASE_URL =
  Platform.OS === 'web'
    ? (process.env.EXPO_PUBLIC_API_URL_WEB ?? rawUrl.replace(/^http:\/\/[\d.]+/, 'http://localhost'))
    : rawUrl;

console.log('[API] Base URL:', BASE_URL, `(platform: ${Platform.OS})`);

const api = axios.create({ baseURL: BASE_URL });

// ── Response interceptor ──────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    console.log(`[API] ← ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError<{ error?: string }>) => {
    const status = error.response?.status;
    const url    = error.config?.url;
    const method = error.config?.method?.toUpperCase();
    const errCode = error.response?.data?.error;

    if (error.response) {
      console.error(`[API] ✗ ${method} ${url} → HTTP ${status} — ${errCode ?? JSON.stringify(error.response.data)}`);
      // Session gone — redirect to login (skip if already on auth routes to avoid loops)
      if (status === 401 && (errCode === 'NO_SESSION' || errCode === 'SESSION_EXPIRED')) {
        router.replace('/login' as any);
      }
    } else if (error.request) {
      console.error(`[API] ✗ ${method} ${url} → No response (backend down?)`);
    } else {
      console.error(`[API] ✗ Request setup error: ${error.message}`);
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const checkAuthStatus = () => api.get('/auth/status');
export const startLogin      = () => api.post('/auth/login');
export const logoutApi       = () => api.post('/auth/logout');

// ── Profiles ──────────────────────────────────────────────────────────────
export const extractProfile  = (url: string) => api.post('/extract', { url });
export const getProfiles     = (page = 1, limit = 20, search = '') =>
  api.get('/profiles', { params: { page, limit, search } });
export const getProfileById  = (id: string) => api.get(`/profiles/${id}`);
export const updateProfile   = (id: string, data: object) => api.patch(`/profiles/${id}`, data);
export const deleteProfile   = (id: string) => api.delete(`/profiles/${id}`);
export const refreshProfile  = (id: string) => api.post(`/profiles/${id}/refresh`);
export const downloadContact = (id: string) =>
  api.get(`/profiles/${id}/contact`, { responseType: 'blob' });
export const exportProfiles  = () =>
  api.get('/profiles/export', { responseType: 'blob' });

export default api;

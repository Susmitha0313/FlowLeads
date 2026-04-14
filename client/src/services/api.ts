import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
console.log('[API] Base URL:', BASE_URL);

const api = axios.create({ baseURL: BASE_URL });

// ── Request interceptor — attach JWT + log ─────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn(`[API] No auth token found for ${config.method?.toUpperCase()} ${config.url}`);
  }
  console.log(`[API] → ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// ── Response interceptor — log success + structured errors ─────────────────
api.interceptors.response.use(
  (response) => {
    console.log(`[API] ← ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError<{ error?: string; detail?: unknown }>) => {
    const status   = error.response?.status;
    const url      = error.config?.url;
    const method   = error.config?.method?.toUpperCase();
    const resData  = error.response?.data;

    if (error.response) {
      console.error(`[API] ✗ ${method} ${url} → HTTP ${status}`);
      console.error(`[API]   Server message: ${resData?.error ?? JSON.stringify(resData)}`);
      if (resData?.detail) {
        console.error(`[API]   Detail:`, JSON.stringify(resData.detail));
      }
    } else if (error.request) {
      // Request was made but no response — network issue
      console.error(`[API] ✗ ${method} ${url} → No response received`);
      console.error(`[API]   Hint: is the backend running? Is EXPO_PUBLIC_API_URL correct?`);
      console.error(`[API]   EXPO_PUBLIC_API_URL = ${BASE_URL}`);
    } else {
      console.error(`[API] ✗ Request setup error: ${error.message}`);
    }

    return Promise.reject(error);
  }
);

// Auth
export const linkedinAuth = (code: string) =>
  api.post('/auth/linkedin', { code });
export const getMe = () => api.get('/auth/me');

// Profiles
export const extractProfile = (url: string) => api.post('/extract', { url });
export const getProfiles = (page = 1, limit = 20, search = '') =>
  api.get('/profiles', { params: { page, limit, search } });
export const updateProfile = (id: string, data: object) => api.patch(`/profiles/${id}`, data);
export const getProfileById = (id: string) => api.get(`/profiles/${id}`);
export const deleteProfile = (id: string) => api.delete(`/profiles/${id}`);
export const refreshProfile = (id: string) => api.post(`/profiles/${id}/refresh`);
export const downloadContact = (id: string) =>
  api.get(`/profiles/${id}/contact`, { responseType: 'blob' });
export const exportProfiles = () =>
  api.get('/profiles/export', { responseType: 'blob' });

export default api;

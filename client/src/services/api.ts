import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL });

// Attach JWT bearer token to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

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

import axios from 'axios';

// Android emulator → 10.0.2.2 maps to host localhost
// Physical device → replace with your machine's LAN IP e.g. http://192.168.1.x:3000/api
export const BASE_URL = 'http://192.168.0.110:3000/api';

const api = axios.create({ baseURL: BASE_URL });

export const checkAuthStatus = () => api.get('/auth/status');
export const extractProfile = (url: string) => api.post('/extract', { url });
export const getProfiles = () => api.get('/profiles');
export const getProfileById = (id: string) => api.get(`/profiles/${id}`);
export const deleteProfile = (id: string) => api.delete(`/profiles/${id}`);
export const refreshProfile = (id: string) => api.post(`/profiles/${id}/refresh`);
export const downloadContact = (id: string) =>
  api.get(`/profiles/${id}/contact`, { responseType: 'blob' });
export const exportProfiles = () =>
  api.get('/profiles/export', { responseType: 'blob' });

export default api;

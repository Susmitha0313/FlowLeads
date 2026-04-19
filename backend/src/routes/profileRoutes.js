import express from 'express';
import { getAuthStatus, login, logout } from '../controllers/authController.js';
import {
  extractProfile,
  getProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
  refreshProfile,
  exportProfiles,
  downloadContact,
} from '../controllers/profileController.js';

const router = express.Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth
router.get('/auth/status', getAuthStatus);
router.post('/auth/login', login);
router.post('/auth/logout', logout);

// Profiles
router.post('/extract', extractProfile);
router.get('/profiles', getProfiles);
router.get('/profiles/export', exportProfiles);
router.get('/profiles/:id', getProfileById);
router.patch('/profiles/:id', updateProfile);
router.delete('/profiles/:id', deleteProfile);
router.post('/profiles/:id/refresh', refreshProfile);
router.get('/profiles/:id/contact', downloadContact);

export default router;

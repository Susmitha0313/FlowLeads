import express from 'express';
import { linkedinOAuthCallback, linkedinCallback, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
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

// Auth — public
router.get('/auth/linkedin/callback', linkedinOAuthCallback); // LinkedIn redirects here → deep-links code to app
router.post('/auth/linkedin', linkedinCallback);              // App POSTs code here to get JWT

// Auth — protected
router.get('/auth/me', requireAuth, getMe);

// Profiles — all protected
router.post('/extract', requireAuth, extractProfile);
router.get('/profiles', requireAuth, getProfiles);
router.get('/profiles/export', requireAuth, exportProfiles);
router.get('/profiles/:id', requireAuth, getProfileById);
router.patch('/profiles/:id', requireAuth, updateProfile);
router.delete('/profiles/:id', requireAuth, deleteProfile);
router.post('/profiles/:id/refresh', requireAuth, refreshProfile);
router.get('/profiles/:id/contact', requireAuth, downloadContact);

export default router;

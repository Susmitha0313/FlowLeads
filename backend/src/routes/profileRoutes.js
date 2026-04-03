import express from 'express';
import {
  checkAuthStatus,
  extractProfile,
  getProfiles,
  getProfileById,
  deleteProfile,
  refreshProfile,
  exportProfiles,
  downloadContact,
} from '../controllers/profileController.js';

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/auth/status', checkAuthStatus);

router.post('/extract', extractProfile);

router.get('/profiles', getProfiles);
router.get('/profiles/export', exportProfiles);   // must be before /:id
router.get('/profiles/:id', getProfileById);
router.delete('/profiles/:id', deleteProfile);
router.post('/profiles/:id/refresh', refreshProfile);
router.get('/profiles/:id/contact', downloadContact);

export default router;

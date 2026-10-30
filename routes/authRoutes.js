import { Router } from 'express';
import { finishGoogleAuth, getMe, logout, startGoogleAuth } from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/google', startGoogleAuth);
router.get('/google/callback', finishGoogleAuth);
router.get('/me', requireAuth, getMe);
router.post('/logout', logout);

export default router;

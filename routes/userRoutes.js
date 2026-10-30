import { Router } from 'express';
import {
  createAddress,
  deleteAddress,
  getProfile,
  listAddresses,
  updateAddress,
  updateProfile
} from '../controllers/userController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import requireSameOrigin from '../middleware/requireSameOrigin.js';

const router = Router();

router.use(requireAuth);
router.get('/me', getProfile);
router.patch('/me', requireSameOrigin, updateProfile);
router.get('/me/addresses', listAddresses);
router.post('/me/addresses', requireSameOrigin, createAddress);
router.patch('/me/addresses/:addressId', requireSameOrigin, updateAddress);
router.delete('/me/addresses/:addressId', requireSameOrigin, deleteAddress);

export default router;

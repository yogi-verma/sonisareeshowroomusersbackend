import { Router } from 'express';
import {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem
} from '../controllers/cartController.js';
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
router.get('/me/cart', getCart);
router.post('/me/cart/items', requireSameOrigin, addCartItem);
router.patch('/me/cart/items/:productId', requireSameOrigin, updateCartItem);
router.delete('/me/cart/items/:productId', requireSameOrigin, removeCartItem);
router.delete('/me/cart', requireSameOrigin, clearCart);

export default router;

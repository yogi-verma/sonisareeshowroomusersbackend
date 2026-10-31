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
import { createCartPaymentOrder, createPaymentOrder, verifyPayment } from '../controllers/paymentController.js';
import { getMyOrder, listMyOrders } from '../controllers/orderController.js';

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
router.get('/me/:email/orders', listMyOrders);
router.get('/me/:email/orders/:orderId', getMyOrder);
router.post('/me/orders', requireSameOrigin, createPaymentOrder);
router.post('/me/orders/verify', requireSameOrigin, verifyPayment);
router.post('/me/cart/checkout', requireSameOrigin, createCartPaymentOrder);

export default router;

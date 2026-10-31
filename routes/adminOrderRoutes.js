import { Router } from 'express';
import { getAdminOrders, markOrderDelivered } from '../controllers/adminOrderController.js';
import { getAdminUsers } from '../controllers/adminUserController.js';
import requireAdminOrdersKey from '../middleware/requireAdminOrdersKey.js';

const router = Router();

router.use(requireAdminOrdersKey);
router.get('/users', getAdminUsers);
router.get('/orders', getAdminOrders);
router.patch('/orders/:orderId/deliver', markOrderDelivered);

export default router;

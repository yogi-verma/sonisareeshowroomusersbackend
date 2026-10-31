import { Router } from 'express';
import { getAdminOrders, markOrderDelivered } from '../controllers/adminOrderController.js';
import requireAdminOrdersKey from '../middleware/requireAdminOrdersKey.js';

const router = Router();

router.use(requireAdminOrdersKey);
router.get('/orders', getAdminOrders);
router.patch('/orders/:orderId/deliver', markOrderDelivered);

export default router;

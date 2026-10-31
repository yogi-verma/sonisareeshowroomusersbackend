import { Router } from 'express';
import { handleRazorpayWebhook } from '../controllers/paymentController.js';

const router = Router();

router.post('/razorpay/webhook', handleRazorpayWebhook);

export default router;

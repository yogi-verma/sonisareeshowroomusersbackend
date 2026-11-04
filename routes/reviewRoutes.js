import { Router } from 'express';
import { getAllProductReviews } from '../controllers/productReviewController.js';

const router = Router();

router.get('/', getAllProductReviews);

export default router;

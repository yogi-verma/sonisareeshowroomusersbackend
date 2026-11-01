import { Router } from 'express';
import { getProductReviews, saveProductReview } from '../controllers/productReviewController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import requireSameOrigin from '../middleware/requireSameOrigin.js';

const router = Router();

router.get('/:productId/reviews', getProductReviews);
router.put('/:productId/reviews', requireAuth, requireSameOrigin, saveProductReview);

export default router;

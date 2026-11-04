import mongoose from 'mongoose';
import { getCatalogProducts } from '../services/catalogService.js';
import { validateCoupon } from '../services/couponService.js';

export async function validateTry01(req, res, next) {
  try {
    const { code, productId } = req.body || {};
    if (typeof code !== 'string' || code.trim().toUpperCase() !== 'TRY01') {
      return res.status(400).json({ valid: false, message: 'Invalid coupon code.' });
    }
    if (typeof productId !== 'string' || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ valid: false, message: 'A valid productId is required.' });
    }
    const [product] = await getCatalogProducts([productId]);
    if (!product) return res.status(404).json({ valid: false, message: 'Product not found in the catalog.' });
    const result = await validateCoupon({ user: req.user, productId });
    return res.status(result.valid ? 200 : 409).json(result);
  } catch (error) {
    return next(error);
  }
}

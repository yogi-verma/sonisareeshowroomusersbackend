import CouponRedemption from '../models/CouponRedemption.js';

export const COUPON_CODE = 'TRY01';
export const COUPON_PERCENT = 20;
const RESERVATION_MS = 30 * 60 * 1000;

export function calculateCouponDiscount(subtotalPaise) {
  return Math.floor((subtotalPaise * COUPON_PERCENT) / 100);
}

export async function reserveCoupon({ user, orderId }) {
  const now = new Date();
  try {
    await CouponRedemption.findOneAndUpdate(
      { code: COUPON_CODE, email: user.email.toLowerCase(), status: 'reserved', reservedUntil: { $lte: now } },
      { $set: { userId: user._id, orderId, reservedUntil: new Date(now.getTime() + RESERVATION_MS) } },
      { new: true }
    ).orFail();
    return;
  } catch (error) {
    if (error.name !== 'DocumentNotFoundError') {
      if (error.code === 11000) throw Object.assign(new Error('This coupon has already been used or is being used by another checkout.'), { statusCode: 409 });
      throw error;
    }
  }

  try {
    await CouponRedemption.create({
      code: COUPON_CODE,
      email: user.email.toLowerCase(),
      userId: user._id,
      orderId,
      status: 'reserved',
      reservedUntil: new Date(now.getTime() + RESERVATION_MS)
    });
  } catch (error) {
    if (error.code === 11000) throw Object.assign(new Error('This coupon has already been used or is being used by another checkout.'), { statusCode: 409 });
    throw error;
  }
}

export async function redeemCouponForOrder(order) {
  if (!order.couponCode) return;
  const alreadyRedeemed = await CouponRedemption.exists({ code: order.couponCode, email: order.customerEmail, orderId: order._id, status: 'redeemed' });
  if (alreadyRedeemed) return;
  const redemption = await CouponRedemption.findOneAndUpdate(
    { code: order.couponCode, email: order.customerEmail, orderId: order._id, status: 'reserved' },
    { $set: { status: 'redeemed', redeemedAt: new Date(), reservedUntil: null } },
    { new: true }
  );
  if (!redemption) {
    const redeemedByThisOrder = await CouponRedemption.exists({ code: order.couponCode, email: order.customerEmail, orderId: order._id, status: 'redeemed' });
    if (!redeemedByThisOrder) throw new Error('Coupon reservation is missing or expired; paid order requires review.');
  }
}

export async function releaseCouponForOrder(order) {
  if (!order.couponCode) return;
  await CouponRedemption.updateOne(
    { code: order.couponCode, email: order.customerEmail, orderId: order._id, status: 'reserved' },
    { $set: { reservedUntil: new Date(0) } }
  );
}

export async function validateCoupon({ user, productId }) {
  const existing = await CouponRedemption.findOne({ code: COUPON_CODE, email: user.email.toLowerCase() }).lean();
  if (existing?.status === 'redeemed') return { valid: false, message: 'This coupon has already been used.' };
  if (existing?.status === 'reserved' && existing.reservedUntil > new Date()) {
    return { valid: false, message: 'This coupon is reserved for another checkout.' };
  }
  return { valid: true, code: COUPON_CODE, discountPercent: COUPON_PERCENT, productId };
}

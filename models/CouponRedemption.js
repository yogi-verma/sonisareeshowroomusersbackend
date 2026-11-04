import mongoose from 'mongoose';

const couponRedemptionSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  status: { type: String, enum: ['reserved', 'redeemed'], default: 'reserved', required: true },
  reservedUntil: { type: Date, default: null },
  redeemedAt: { type: Date, default: null }
}, { timestamps: true });

couponRedemptionSchema.index({ code:  1, email: 1 }, { unique: true });

const CouponRedemption = mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', couponRedemptionSchema);
export default CouponRedemption;

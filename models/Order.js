import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, trim: true },
  productType: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  photoUrl: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 99 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerName: { type: String, trim: true, default: '' },
  customerEmail: { type: String, lowercase: true, trim: true, default: '', index: true },
  customerPhone: { type: String, trim: true, default: '' },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true, trim: true },
  productType: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  productPhotoUrl: { type: String, default: '' },
  items: { type: [orderItemSchema], default: [] },
  source: { type: String, enum: ['buy_now', 'cart'], default: 'buy_now', index: true },
  quantity: { type: Number, required: true, min: 1, max: 9900 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 100 },
  couponCode: { type: String, uppercase: true, trim: true, default: '' },
  couponDiscount: { type: Number, min: 0, default: 0 },
  couponProductId: { type: mongoose.Schema.Types.ObjectId, default: null },
  currency: { type: String, required: true, default: 'INR' },
  receipt: { type: String, required: true, unique: true },
  razorpayOrderId: { type: String, default: '', index: true },
  razorpayPaymentId: { type: String, default: '', index: true },
  paymentMethod: { type: String, default: '' },
  paymentStatus: {
    type: String,
    enum: ['creating', 'pending', 'authorized', 'paid', 'failed'],
    default: 'creating',
    index: true
  },
  deliveryStatus: { type: String, enum: ['pending', 'delivered'], default: null, index: true },
  deliveredAt: { type: Date, default: null },
  deliveredBy: { type: String, trim: true, default: '' },
  paidAt: { type: Date, default: null },
  cartAppliedAt: { type: Date, default: null }
}, { timestamps: true });

orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export default Order;

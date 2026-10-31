import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true, trim: true },
  productType: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, max: 99 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 100 },
  currency: { type: String, required: true, default: 'INR' },
  receipt: { type: String, required: true, unique: true },
  razorpayOrderId: { type: String, default: '', index: true },
  razorpayPaymentId: { type: String, default: '', index: true },
  paymentStatus: {
    type: String,
    enum: ['creating', 'pending', 'authorized', 'paid', 'failed'],
    default: 'creating',
    index: true
  },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export default Order;

import mongoose from 'mongoose';

const productReviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true, trim: true, maxlength: 120 },
  rating: {
    type: Number,
    required: true,
    min: [1, 'Rating must be from 1 to 5 stars.'],
    max: [5, 'Rating must be from 1 to 5 stars.'],
    validate: { validator: Number.isInteger, message: 'Rating must be a whole number from 1 to 5.' }
  },
  comment: { type: String, required: true, trim: true, minlength: [1, 'Comment is required.'], maxlength: [1000, 'Comment cannot exceed 1000 characters.'] }
}, { timestamps: true });

productReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
productReviewSchema.index({ productId: 1, createdAt: -1 });

const ProductReview = mongoose.models.ProductReview || mongoose.model('ProductReview', productReviewSchema);
export default ProductReview;

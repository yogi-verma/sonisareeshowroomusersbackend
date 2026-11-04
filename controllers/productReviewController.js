import mongoose from 'mongoose';
import ProductReview from '../models/ProductReview.js';
import { getCatalogProducts } from '../services/catalogService.js';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function validateProductId(productId) {
  if (typeof productId !== 'string' || !mongoose.isValidObjectId(productId)) {
    throw httpError(400, 'A valid product ID is required.');
  }
  return new mongoose.Types.ObjectId(productId);
}

function parsePageValue(value, fallback, maximum, field) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum || (field === 'limit' && parsed < 1)) {
    throw httpError(400, `${field} must be a whole number from ${field === 'limit' ? 1 : 0} to ${maximum}.`);
  }
  return parsed;
}

function serializeReview(review) {
  const user = review.userId && typeof review.userId === 'object' && review.userId._id
    ? review.userId
    : null;
  return {
    id: review._id.toString(),
    userId: String(user?._id || review.userId),
    userPicture: user?.picture || '',
    userName: review.userName,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

export async function getProductReviews(req, res, next) {
  try {
    const productId = validateProductId(req.params.productId);
    const limit = parsePageValue(req.query.limit, 20, 100, 'limit');
    const skip = parsePageValue(req.query.skip, 0, 100000, 'skip');
    const match = { productId };

    const [reviews, summaryRows] = await Promise.all([
      ProductReview.find(match)
        .select('userId userName rating comment createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductReview.aggregate([
        { $match: match },
        { $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
        } }
      ])
    ]);

    const row = summaryRows[0];
    const summary = {
      totalReviews: row?.totalReviews ?? 0,
      averageRating: row ? Math.round(row.averageRating * 10) / 10 : 0,
      ratingCounts: {
        1: row?.oneStar ?? 0,
        2: row?.twoStars ?? 0,
        3: row?.threeStars ?? 0,
        4: row?.fourStars ?? 0,
        5: row?.fiveStars ?? 0
      }
    };

    res.set('Cache-Control', 'no-store');
    return res.json({
      reviews: reviews.map(serializeReview),
      summary,
      pagination: { limit, skip, hasMore: skip + reviews.length < summary.totalReviews }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAllProductReviews(req, res, next) {
  try {
    const limit = parsePageValue(req.query.limit, 100, 100, 'limit');
    const skip = parsePageValue(req.query.skip, 0, 100000, 'skip');
    const [reviews, totalReviews] = await Promise.all([
      ProductReview.find()
        .select('userId userName rating comment createdAt updatedAt')
        .populate('userId', 'picture')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductReview.countDocuments()
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      reviews: reviews.map(serializeReview),
      pagination: { limit, skip, hasMore: skip + reviews.length < totalReviews }
    });
  } catch (error) {
    return next(error);
  }
}

export async function saveProductReview(req, res, next) {
  try {
    const productId = validateProductId(req.params.productId);
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'A JSON object with rating and comment is required.');
    }
    const unsupportedField = Object.keys(body).find((field) => !['rating', 'comment'].includes(field));
    if (unsupportedField) throw httpError(400, `Unsupported review field: ${unsupportedField}.`);

    const rating = body.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw httpError(400, 'Rating must be a whole number from 1 to 5 stars.');
    }
    if (typeof body.comment !== 'string' || !body.comment.trim()) {
      throw httpError(400, 'A comment is required.');
    }
    const comment = body.comment.trim();
    if (comment.length > 1000) throw httpError(400, 'Comment cannot exceed 1000 characters.');

    const [product] = await getCatalogProducts([productId.toString()]);
    if (!product) throw httpError(404, 'Product not found.');

    const reviewFilter = { productId, userId: req.user._id };
    const update = { $set: { userName: req.user.name || 'Customer', rating, comment } };
    let review;
    try {
      review = await ProductReview.findOneAndUpdate(reviewFilter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      review = await ProductReview.findOneAndUpdate(reviewFilter, update, { new: true, runValidators: true });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Your review was saved.', review: serializeReview(review) });
  } catch (error) {
    return next(error);
  }
}

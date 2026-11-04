import mongoose from 'mongoose';
import Order from '../models/Order.js';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function assertOwnEmail(req) {
  const requestedEmail = (req.params.email || '').trim().toLowerCase();
  if (!requestedEmail || requestedEmail !== req.user.email.toLowerCase()) {
    throw httpError(403, 'You can only view orders belonging to your signed-in account.');
  }
}

function toOrderSummary(order) {
  const items = order.items?.length ? order.items.map((item) => ({
    productId: item.productId.toString(),
    name: item.name,
    productType: item.productType,
    category: item.category,
    photoUrl: item.photoUrl || '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal
  })) : [{
    productId: order.productId.toString(),
    name: order.productName,
    productType: order.productType,
    category: order.category,
    photoUrl: order.productPhotoUrl || '',
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    lineTotal: order.amount / 100
  }];
  const couponCode = order.couponCode || '';
  const couponProductId = order.couponProductId?.toString() || '';
  const couponProductName = couponProductId
    ? items.find((item) => item.productId === couponProductId)?.name || ''
    : '';

  return {
    id: order._id.toString(),
    productId: order.productId.toString(),
    productName: items.length === 1 ? items[0].name : `${items.length} products`,
    productType: order.productType,
    category: order.category,
    productPhotoUrl: order.productPhotoUrl || '',
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    itemCount: items.length,
    items,
    unitPrice: order.unitPrice,
    subtotalAmount: items.reduce((total, item) => total + item.lineTotal, 0),
    totalAmount: order.amount / 100,
    couponCode,
    couponProductId,
    couponProductName,
    couponDiscount: (order.couponDiscount || 0) / 100,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveryMessage: order.deliveryStatus === 'delivered'
      ? 'Your payment was received successfully. Your order has been delivered.'
      : 'Your payment was received successfully. Your order delivery is pending. You will receive your order within 10 days.',
    deliveredAt: order.deliveredAt || null,
    paymentMethod: order.paymentMethod || '',
    paidAt: order.paidAt,
    placedAt: order.createdAt
  };
}

export async function listMyOrders(req, res, next) {
  try {
    assertOwnEmail(req);
    const orders = await Order.find({ userId: req.user._id, paymentStatus: 'paid' })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();
    return res.json({ totalOrders: orders.length, orders: orders.map(toOrderSummary) });
  } catch (error) {
    return next(error);
  }
}

export async function getMyOrder(req, res, next) {
  try {
    assertOwnEmail(req);
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) throw httpError(400, 'A valid order ID is required.');

    const order = await Order.findOne({
      _id: orderId,
      userId: req.user._id,
      paymentStatus: 'paid'
    }).lean();
    if (!order) throw httpError(404, 'Paid order not found.');

    return res.json({
      order: {
        ...toOrderSummary(order),
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        receipt: order.receipt,
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: order.razorpayPaymentId,
        paidAt: order.paidAt || null
      }
    });
  } catch (error) {
    return next(error);
  }
}

import mongoose from 'mongoose';
import Order from '../models/Order.js';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function serializeOrder(order) {
  return {
    id: order._id.toString(),
    receipt: order.receipt,
    customerName: order.customerName || 'Customer',
    customerEmail: order.customerEmail || '',
    customerPhone: order.customerPhone || '',
    items: (order.items?.length ? order.items : [{
      productId: order.productId,
      name: order.productName,
      productType: order.productType,
      category: order.category,
      photoUrl: order.productPhotoUrl,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      lineTotal: order.amount / 100
    }]).map((item) => ({
      productId: String(item.productId),
      name: item.name,
      productType: item.productType,
      category: item.category,
      photoUrl: item.photoUrl || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal
    })),
    totalAmount: order.amount / 100,
    currency: order.currency,
    paymentMethod: order.paymentMethod || 'Razorpay',
    paymentId: order.razorpayPaymentId,
    paidAt: order.paidAt,
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveredAt: order.deliveredAt,
    deliveredBy: order.deliveredBy || ''
  };
}

export async function getAdminOrders(_req, res, next) {
  try {
    const [totalSuccessfullyDelivered, pendingOrders, completed] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'paid', deliveryStatus: 'delivered' }),
      Order.find({ paymentStatus: 'paid', deliveryStatus: { $ne: 'delivered' } })
        .sort({ paidAt: 1, createdAt: 1 })
        .lean(),
      Order.find({ paymentStatus: 'paid', deliveryStatus: 'delivered' })
        .sort({ deliveredAt: -1 })
        .lean()
    ]);

    return res.json({
      totalSuccessfullyDelivered,
      pendingOrders: pendingOrders.length,
      orders: pendingOrders.map(serializeOrder),
      completedOrders: completed.length,
      completed: completed.map(serializeOrder)
    });
  } catch (error) {
    return next(error);
  }
}

export async function markOrderDelivered(req, res, next) {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) throw httpError(400, 'A valid order ID is required.');
    const deliveredBy = typeof req.body?.deliveredBy === 'string' ? req.body.deliveredBy.trim().slice(0, 100) : '';
    if (!deliveredBy) throw httpError(400, 'Admin identity is required to confirm delivery.');

    const order = await Order.findOne({ _id: orderId, paymentStatus: 'paid' });
    if (!order) throw httpError(404, 'Paid order not found.');
    if (order.deliveryStatus === 'delivered') {
      return res.json({ message: 'This order was already marked delivered.', order: serializeOrder(order) });
    }

    order.deliveryStatus = 'delivered';
    order.deliveredAt = new Date();
    order.deliveredBy = deliveredBy;
    await order.save();
    return res.json({ message: 'Order marked as delivered.', order: serializeOrder(order) });
  } catch (error) {
    return next(error);
  }
}

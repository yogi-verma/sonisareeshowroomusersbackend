import { createHmac, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { getCatalogProducts } from '../services/catalogService.js';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw httpError(503, 'Razorpay is not configured on the server.');
  return { keyId, keySecret };
}

function verifyHexSignature(expected, supplied) {
  if (typeof supplied !== 'string' || !/^[a-f\d]{64}$/i.test(supplied)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const suppliedBuffer = Buffer.from(supplied, 'hex');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function applyPurchasedCart(order) {
  if (order.source !== 'cart' || !order.items?.length) return;

  const claimedOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'paid', source: 'cart', cartAppliedAt: null },
    { $set: { cartAppliedAt: new Date() } },
    { new: true }
  );
  if (!claimedOrder) return;

  const user = await User.findById(order.userId);
  if (!user) return;
  try {
    for (const purchasedItem of order.items) {
      const cartIndex = user.cart.findIndex((item) => String(item.productId) === String(purchasedItem.productId));
      if (cartIndex < 0) continue;
      const cartItem = user.cart[cartIndex];
      if (cartItem.quantity > purchasedItem.quantity) cartItem.quantity -= purchasedItem.quantity;
      else user.cart.splice(cartIndex, 1);
    }
    await user.save();
  } catch (error) {
    await Order.updateOne({ _id: order._id, cartAppliedAt: claimedOrder.cartAppliedAt }, { $set: { cartAppliedAt: null } }).catch(() => {});
    throw error;
  }
}

async function applyPurchasedInventory(order) {
  const items = order.items?.length
    ? order.items.map(({ productId, quantity }) => ({ productId: String(productId), quantity }))
    : [{ productId: String(order.productId), quantity: order.quantity }];
  const baseUrl = (process.env.ADMIN_BACKEND_URL || 'http://localhost:5001').replace(/\/+$/, '');
  const key = process.env.ADMIN_ORDERS_API_KEY;
  if (!key) throw new Error('ADMIN_ORDERS_API_KEY is not configured.');

  const response = await fetch(`${baseUrl}/api/internal/inventory/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-inventory-sync-key': key },
    body: JSON.stringify({ orderId: String(order._id), items }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || `Inventory sync failed with status ${response.status}.`);
  }
}

async function razorpayRequest(path, init = {}) {
  const { keyId, keySecret } = getCredentials();
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw httpError(502, 'Could not connect to Razorpay. Please try again.');
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const statusCode = response.status === 401 ? 502 : 502;
    throw httpError(statusCode, result.error?.description || 'Razorpay could not process this request.');
  }
  return result;
}

export async function createPaymentOrder(req, res, next) {
  let localOrder;
  try {
    const { productId, quantity = 1 } = req.body || {};
    if (typeof productId !== 'string' || !mongoose.isValidObjectId(productId)) {
      throw httpError(400, 'A valid productId is required.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw httpError(400, 'Quantity must be a whole number from 1 to 99.');
    }

    const [product] = await getCatalogProducts([productId]);
    if (!product) throw httpError(404, 'Product not found in the catalog.');
    if (!Number.isFinite(product.price) || product.price < 0 || !Number.isInteger(product.stock) || product.stock < 0) {
      throw httpError(409, 'Product price or inventory is unavailable.');
    }
    if (product.stock < quantity) throw httpError(409, `Only ${product.stock} item(s) are currently available.`);

    const unitPrice = Number(product.price.toFixed(2));
    const amount = Math.round(unitPrice * 100) * quantity;
    if (amount < 100) throw httpError(400, 'The minimum payment amount is ₹1.00.');
    if (!Number.isSafeInteger(amount)) throw httpError(400, 'The payment amount is invalid.');

    const { keyId } = getCredentials();
    localOrder = await Order.create({
      userId: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phoneNumber || '',
      productId: product._id,
      productName: product.name,
      productType: product.productType,
      category: product.category,
      productPhotoUrl: product.photo?.url || '',
      items: [{
        productId: product._id,
        name: product.name,
        productType: product.productType,
        category: product.category,
        photoUrl: product.photo?.url || '',
        quantity,
        unitPrice,
        lineTotal: Number((unitPrice * quantity).toFixed(2))
      }],
      source: 'buy_now',
      quantity,
      unitPrice,
      amount,
      currency: 'INR',
      receipt: `ss_${new mongoose.Types.ObjectId().toString()}`,
      paymentStatus: 'creating'
    });

    const gatewayOrder = await razorpayRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({ amount, currency: 'INR', receipt: localOrder.receipt })
    });
    if (!gatewayOrder.id || gatewayOrder.amount !== amount || gatewayOrder.currency !== 'INR') {
      throw httpError(502, 'Razorpay returned an invalid order response.');
    }

    localOrder.razorpayOrderId = gatewayOrder.id;
    localOrder.paymentStatus = 'pending';
    await localOrder.save();

    return res.status(201).json({
      localOrderId: localOrder.id,
      keyId,
      orderId: gatewayOrder.id,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      productName: product.name
    });
  } catch (error) {
    if (localOrder && localOrder.paymentStatus === 'creating') {
      localOrder.paymentStatus = 'failed';
      await localOrder.save().catch(() => {});
    }
    return next(error);
  }
}

export async function createCartPaymentOrder(req, res, next) {
  let localOrder;
  try {
    const cart = req.user.cart || [];
    if (!cart.length) throw httpError(400, 'Your cart is empty. Add a product before checkout.');

    const products = await getCatalogProducts(cart.map((item) => String(item.productId)));
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const items = cart.map((cartItem) => {
      const product = productsById.get(String(cartItem.productId));
      if (!product) throw httpError(409, `${cartItem.name} is no longer available in the catalog.`);
      if (!Number.isFinite(product.price) || product.price < 0 || !Number.isInteger(product.stock) || product.stock < cartItem.quantity) {
        throw httpError(409, `${product.name} does not have enough stock for your cart quantity.`);
      }
      const unitPrice = Number(product.price.toFixed(2));
      return {
        productId: product._id,
        name: product.name,
        productType: product.productType,
        category: product.category,
        photoUrl: product.photo?.url || '',
        quantity: cartItem.quantity,
        unitPrice,
        lineTotal: Number((unitPrice * cartItem.quantity).toFixed(2))
      };
    });

    const amount = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0);
    if (amount < 100) throw httpError(400, 'The minimum payment amount is ₹1.00.');
    if (!Number.isSafeInteger(amount)) throw httpError(400, 'The payment amount is invalid.');

    const { keyId } = getCredentials();
    const firstItem = items[0];
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    localOrder = await Order.create({
      userId: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phoneNumber || '',
      productId: firstItem.productId,
      productName: items.length === 1 ? firstItem.name : `${items.length} products`,
      productType: firstItem.productType,
      category: firstItem.category,
      productPhotoUrl: firstItem.photoUrl,
      items,
      source: 'cart',
      quantity: totalQuantity,
      unitPrice: firstItem.unitPrice,
      amount,
      currency: 'INR',
      receipt: `ss_${new mongoose.Types.ObjectId().toString()}`,
      paymentStatus: 'creating'
    });

    const gatewayOrder = await razorpayRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({ amount, currency: 'INR', receipt: localOrder.receipt })
    });
    if (!gatewayOrder.id || gatewayOrder.amount !== amount || gatewayOrder.currency !== 'INR') {
      throw httpError(502, 'Razorpay returned an invalid order response.');
    }
    localOrder.razorpayOrderId = gatewayOrder.id;
    localOrder.paymentStatus = 'pending';
    await localOrder.save();

    return res.status(201).json({
      localOrderId: localOrder.id,
      keyId,
      orderId: gatewayOrder.id,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      productName: items.length === 1 ? firstItem.name : `${items.length} products`
    });
  } catch (error) {
    if (localOrder && localOrder.paymentStatus === 'creating') {
      localOrder.paymentStatus = 'failed';
      await localOrder.save().catch(() => {});
    }
    return next(error);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { localOrderId, razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (![localOrderId, razorpayOrderId, paymentId, signature].every((value) => typeof value === 'string' && value)) {
      throw httpError(400, 'Payment verification fields are required.');
    }
    if (!mongoose.isValidObjectId(localOrderId)) throw httpError(400, 'Invalid local order ID.');

    const order = await Order.findOne({ _id: localOrderId, userId: req.user._id });
    if (!order || !order.razorpayOrderId) throw httpError(404, 'Payment order not found.');
    if (order.razorpayOrderId !== razorpayOrderId) throw httpError(400, 'Razorpay order ID does not match this order.');

    const { keySecret } = getCredentials();
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest('hex');
    if (!verifyHexSignature(expectedSignature, signature)) {
      throw httpError(400, 'Payment signature is invalid. The order was not marked as paid.');
    }

    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.order_id !== order.razorpayOrderId || payment.amount !== order.amount || payment.currency !== order.currency) {
      throw httpError(400, 'Payment details do not match this order.');
    }
    if (payment.status === 'captured') {
      order.razorpayPaymentId = payment.id;
      order.paymentMethod = payment.method || '';
      order.paymentStatus = 'paid';
      order.deliveryStatus = order.deliveryStatus || 'pending';
      order.paidAt = order.paidAt || new Date();
      await order.save();
      await applyPurchasedInventory(order).catch((error) => console.error(`Could not sync paid order inventory: ${error.message}`));
      await applyPurchasedCart(order).catch((error) => console.error(`Could not sync paid cart order: ${error.message}`));
      return res.json({ verified: true, status: 'paid', orderId: order.id });
    }
    if (payment.status === 'authorized') {
      order.razorpayPaymentId = payment.id;
      order.paymentMethod = payment.method || '';
      order.paymentStatus = 'authorized';
      await order.save();
      return res.status(202).json({ verified: true, status: 'authorized', orderId: order.id, message: 'Payment is authorized and awaiting capture.' });
    }

    if (payment.status === 'failed') {
      order.razorpayPaymentId = payment.id;
      order.paymentStatus = 'failed';
      await order.save();
    }
    throw httpError(409, 'Payment is not captured. Please retry or contact support if money was deducted.');
  } catch (error) {
    return next(error);
  }
}

export async function handleRazorpayWebhook(req, res) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).json({ message: 'Razorpay webhook is not configured.' });

  const signature = req.get('x-razorpay-signature');
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const expectedSignature = createHmac('sha256', webhookSecret).update(body).digest('hex');
  if (!verifyHexSignature(expectedSignature, signature)) {
    return res.status(400).json({ message: 'Webhook signature is invalid.' });
  }

  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Webhook payload is invalid.' });
  }

  try {
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return res.json({ received: true });
    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (!order) return res.json({ received: true });
    if (payment.amount !== order.amount || payment.currency !== order.currency) {
      return res.status(400).json({ message: 'Webhook payment does not match the order.' });
    }

    if (event.event === 'payment.captured') {
      order.razorpayPaymentId = payment.id || order.razorpayPaymentId;
      order.paymentMethod = payment.method || order.paymentMethod;
      order.paymentStatus = 'paid';
      order.deliveryStatus = order.deliveryStatus || 'pending';
      order.paidAt = order.paidAt || new Date();
      await order.save();
      await applyPurchasedInventory(order);
      await applyPurchasedCart(order);
    } else if (event.event === 'payment.failed' && order.paymentStatus !== 'paid') {
      order.razorpayPaymentId = payment.id || order.razorpayPaymentId;
      order.paymentMethod = payment.method || order.paymentMethod;
      order.paymentStatus = 'failed';
      await order.save();
    }
  } catch (error) {
    console.error(`Razorpay webhook processing failed: ${error.message}`);
    return res.status(500).json({ message: 'Webhook processing failed.' });
  }

  return res.json({ received: true });
}

import mongoose from 'mongoose';
import { getCatalogProducts } from '../services/catalogService.js';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function assertBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'A JSON object is required.');
  }
}

function readQuantity(value, fallback = undefined) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw httpError(400, 'Quantity must be a whole number from 1 to 99.');
  }
  return value;
}

function validateProductId(productId) {
  if (typeof productId !== 'string' || !mongoose.isValidObjectId(productId)) {
    throw httpError(400, 'A valid productId is required.');
  }
  return productId;
}

async function findAvailableProduct(productId) {
  const [product] = await getCatalogProducts([productId]);
  if (!product) throw httpError(404, 'Product not found in the catalog.');
  if (!Number.isFinite(product.price) || !Number.isInteger(product.stock) || product.stock < 0) {
    throw httpError(409, 'Product inventory is currently unavailable.');
  }
  return product;
}

async function serializeCart(user) {
  const productIds = user.cart.map((item) => item.productId);
  const products = await getCatalogProducts(productIds.map((id) => id.toString()));
  const productById = new Map(products.map((product) => [product._id.toString(), product]));

  const items = user.cart.map((item) => {
    const product = productById.get(item.productId.toString());
    const unitPrice = product && Number.isFinite(product.price) ? product.price : item.unitPrice;
    const quantity = item.quantity;
    return {
      productId: item.productId,
      name: product?.name || item.name,
      productType: product?.productType || item.productType,
      category: product?.category || item.category,
      unitPrice,
      photoUrl: product?.photo?.url || item.photoUrl,
      quantity,
      availableStock: product?.stock ?? 0,
      isAvailable: Boolean(product && product.stock >= quantity),
      lineTotal: Number((unitPrice * quantity).toFixed(2))
    };
  });

  return {
    items,
    distinctItems: items.length,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: Number(items.reduce((total, item) => total + item.lineTotal, 0).toFixed(2))
  };
}

export async function getCart(req, res, next) {
  try {
    const cart = await serializeCart(req.user);
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
}

export async function addCartItem(req, res, next) {
  try {
    assertBody(req.body);
    const unsupported = Object.keys(req.body).find((key) => !['productId', 'quantity'].includes(key));
    if (unsupported) throw httpError(400, `Unsupported cart field: ${unsupported}.`);

    const productId = validateProductId(req.body.productId);
    const quantityToAdd = readQuantity(req.body.quantity, 1);
    const product = await findAvailableProduct(productId);
    const existingItem = req.user.cart.find((item) => item.productId.toString() === productId);
    const newQuantity = (existingItem?.quantity || 0) + quantityToAdd;

    if (newQuantity > 99) throw httpError(400, 'A cart item quantity cannot exceed 99.');
    if (product.stock === 0) throw httpError(409, 'This product is out of stock.');
    if (newQuantity > product.stock) {
      return res.status(409).json({
        message: `Only ${product.stock} item(s) are currently available.`,
        availableStock: product.stock,
        currentQuantity: existingItem?.quantity || 0
      });
    }
    if (!existingItem && req.user.cart.length >= 100) {
      throw httpError(409, 'Your cart can contain up to 100 different products.');
    }

    if (existingItem) {
      existingItem.quantity = newQuantity;
      existingItem.name = product.name;
      existingItem.productType = product.productType;
      existingItem.category = product.category;
      existingItem.unitPrice = product.price;
      existingItem.photoUrl = product.photo?.url || '';
    } else {
      req.user.cart.push({
        productId: product._id,
        name: product.name,
        productType: product.productType,
        category: product.category,
        unitPrice: product.price,
        photoUrl: product.photo?.url || '',
        quantity: newQuantity
      });
    }

    await req.user.save();
    const cart = await serializeCart(req.user);
    return res.status(existingItem ? 200 : 201).json({
      message: existingItem ? 'Cart quantity increased.' : 'Product added to cart.',
      cart
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateCartItem(req, res, next) {
  try {
    assertBody(req.body);
    if (Object.keys(req.body).length !== 1 || !('quantity' in req.body)) {
      throw httpError(400, 'Only quantity can be updated.');
    }

    const productId = validateProductId(req.params.productId);
    const quantity = readQuantity(req.body.quantity);
    const item = req.user.cart.find((entry) => entry.productId.toString() === productId);
    if (!item) throw httpError(404, 'Cart item not found.');

    const product = await findAvailableProduct(productId);
    if (quantity > product.stock) {
      return res.status(409).json({
        message: `Only ${product.stock} item(s) are currently available.`,
        availableStock: product.stock
      });
    }

    item.quantity = quantity;
    item.name = product.name;
    item.productType = product.productType;
    item.category = product.category;
    item.unitPrice = product.price;
    item.photoUrl = product.photo?.url || '';
    await req.user.save();

    const cart = await serializeCart(req.user);
    return res.json({ message: 'Cart quantity updated.', cart });
  } catch (error) {
    return next(error);
  }
}

export async function removeCartItem(req, res, next) {
  try {
    const productId = validateProductId(req.params.productId);
    const item = req.user.cart.find((entry) => entry.productId.toString() === productId);
    if (!item) throw httpError(404, 'Cart item not found.');

    req.user.cart.pull(item._id);
    await req.user.save();
    const cart = await serializeCart(req.user);
    return res.json({ message: 'Product removed from cart.', cart });
  } catch (error) {
    return next(error);
  }
}

export async function clearCart(req, res, next) {
  try {
    req.user.cart = [];
    await req.user.save();
    return res.json({ message: 'Cart cleared.', cart: { items: [], distinctItems: 0, totalItems: 0, subtotal: 0 } });
  } catch (error) {
    return next(error);
  }
}

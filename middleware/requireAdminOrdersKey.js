import { timingSafeEqual } from 'node:crypto';

export default function requireAdminOrdersKey(req, res, next) {
  const expected = process.env.ADMIN_ORDERS_API_KEY;
  const supplied = req.get('x-admin-orders-key');
  if (!expected || !supplied) {
    return res.status(503).json({ message: 'Admin order access is not configured.' });
  }

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(401).json({ message: 'Admin order access is not authorized.' });
  }
  return next();
}

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = req.cookies?.auth_token || bearer;
    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Authentication required.' });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    return next(error);
  }
}

import { verifyAdminToken } from '../services/chatAuthService.js';

export default async function requireChatAdmin(req, res, next) {
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = req.cookies?.adminToken || bearer;
  const admin = await verifyAdminToken(token);
  if (!admin) return res.status(401).json({ message: 'Admin authentication required.' });
  req.chatAdmin = admin;
  return next();
}

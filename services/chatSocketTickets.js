import { randomBytes } from 'node:crypto';
import ChatSocketTicket from '../models/ChatSocketTicket.js';
const TTL_MS = 30_000;

export async function createChatSocketTicket(adminId) {
  const ticket = randomBytes(32).toString('base64url');
  await ChatSocketTicket.create({
    token: ticket,
    adminId: String(adminId),
    expiresAt: new Date(Date.now() + TTL_MS)
  });
  return { ticket, expiresIn: TTL_MS / 1000 };
}

export async function consumeChatSocketTicket(ticket) {
  const value = await ChatSocketTicket.findOneAndDelete({
    token: ticket,
    expiresAt: { $gt: new Date() }
  }).lean();
  return value ? { id: value.adminId } : null;
}

import { randomBytes } from 'node:crypto';

const tickets = new Map();
const TTL_MS = 30_000;

export function createChatSocketTicket(adminId) {
  const now = Date.now();
  for (const [key, value] of tickets) if (value.expiresAt <= now) tickets.delete(key);
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(ticket, { adminId: String(adminId), expiresAt: now + TTL_MS });
  return { ticket, expiresIn: TTL_MS / 1000 };
}

export function consumeChatSocketTicket(ticket) {
  const value = tickets.get(ticket);
  if (!value) return null;
  tickets.delete(ticket);
  return value.expiresAt > Date.now() ? { id: value.adminId } : null;
}

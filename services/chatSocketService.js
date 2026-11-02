import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ChatConversation from '../models/ChatConversation.js';
import ChatMessage from '../models/ChatMessage.js';
import ChatPresence from '../models/ChatPresence.js';
import { verifyAdminToken } from './chatAuthService.js';
import { sendMessage } from './chatService.js';
import connectDB from '../config/database.js';
import chatEvents, { publishChatMessage, publishChatPresence, publishChatSeen } from './chatEvents.js';
import { consumeChatSocketTicket } from './chatSocketTickets.js';

const MAX_PAYLOAD = 16 * 1024;
const adminSockets = new Set();
const userSockets = new Map();
const presenceTimers = new Map();
const OFFLINE_GRACE_MS = 60_000;
const ADMIN_PRESENCE_ID = 'showroom-admin';

function readCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function send(socket, event) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
}

function userRoom(userId) {
  let sockets = userSockets.get(userId);
  if (!sockets) { sockets = new Set(); userSockets.set(userId, sockets); }
  return sockets;
}

function broadcastUser(userId, event) {
  for (const socket of userSockets.get(String(userId)) || []) send(socket, event);
}

function broadcastAdmins(event) {
  for (const socket of adminSockets) send(socket, event);
}

chatEvents.on('message', ({ userId, message }) => {
  const event = { type: 'message', message };
  broadcastUser(userId, event);
  broadcastAdmins(event);
});

chatEvents.on('seen', (event) => {
  const payload = { type: 'seen', conversationId: event.conversationId, seenAt: event.seenAt, seenBy: event.seenBy };
  if (event.seenBy === 'user') broadcastAdmins(payload);
  else broadcastUser(event.userId, payload);
});

chatEvents.on('presence', (presence) => {
  const payload = { type: 'presence', presence };
  if (presence.actorType === 'user') broadcastAdmins(payload);
  else for (const sockets of userSockets.values()) for (const socket of sockets) send(socket, payload);
});

function presenceKey(identity) { return `${identity.type}:${identity.type === 'admin' ? ADMIN_PRESENCE_ID : identity.id}`; }

async function setOnline(identity) {
  const actorId = identity.type === 'admin' ? ADMIN_PRESENCE_ID : identity.id;
  const key = presenceKey(identity);
  const timer = presenceTimers.get(key);
  if (timer) clearTimeout(timer);
  presenceTimers.delete(key);
  await ChatPresence.findOneAndUpdate(
    { actorType: identity.type, actorId },
    { $set: { status: 'online' }, $setOnInsert: { lastSeenAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  publishChatPresence(identity.type, actorId, 'online', null);
}

function scheduleOffline(identity) {
  const actorId = identity.type === 'admin' ? ADMIN_PRESENCE_ID : identity.id;
  const key = presenceKey(identity);
  const existing = presenceTimers.get(key);
  if (existing) clearTimeout(existing);
  const disconnectedAt = new Date();
  const timer = setTimeout(async () => {
    presenceTimers.delete(key);
    const stillConnected = identity.type === 'admin' ? adminSockets.size > 0 : Boolean(userSockets.get(identity.id)?.size);
    if (stillConnected) return;
    try {
      await ChatPresence.findOneAndUpdate(
        { actorType: identity.type, actorId },
        { $set: { status: 'offline', lastSeenAt: disconnectedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      publishChatPresence(identity.type, actorId, 'offline', disconnectedAt);
    } catch (error) {
      console.error(`Could not update chat presence: ${error.message}`);
    }
  }, OFFLINE_GRACE_MS);
  timer.unref?.();
  presenceTimers.set(key, timer);
}

async function sendPresenceSnapshot(socket, identity, peerUserId) {
  const ownActorId = identity.type === 'admin' ? ADMIN_PRESENCE_ID : identity.id;
  const records = await ChatPresence.find({
    $or: [
      { actorType: identity.type, actorId: ownActorId },
      { actorType: identity.type === 'admin' ? 'user' : 'admin', actorId: identity.type === 'admin' ? peerUserId : ADMIN_PRESENCE_ID }
    ]
  }).select('actorType actorId status lastSeenAt').lean();
  for (const record of records) send(socket, { type: 'presence', presence: record });
}

export function attachChatWebSocket(server, { allowedOrigins = [] } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

  server.on('upgrade', async (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/ws/chat') return;
    const origin = request.headers.origin;
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }

    try {
      await connectDB();
      const cookies = readCookies(request.headers.cookie);
      const url = new URL(request.url, 'http://localhost');
      const requestedRole = url.searchParams.get('role');
      if (requestedRole && !['user', 'admin'].includes(requestedRole)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return;
      }
      let identity;
      const ticket = url.searchParams.get('ticket');
      const ticketAdmin = ticket ? consumeChatSocketTicket(ticket) : null;
      if (requestedRole === 'admin' && ticketAdmin) identity = { type: 'admin', id: ticketAdmin.id };
      if (!requestedRole && ticketAdmin) identity = { type: 'admin', id: ticketAdmin.id };
      if (requestedRole !== 'user' && !identity && cookies.adminToken) {
        const admin = await verifyAdminToken(cookies.adminToken);
        if (admin) identity = { type: 'admin', id: String(admin.id) };
      }
      if ((requestedRole === 'user' || !identity) && cookies.auth_token && process.env.JWT_SECRET) {
        try {
          const payload = jwt.verify(cookies.auth_token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
          if (payload?.sub) {
            const user = await User.findById(payload.sub).select('_id').lean();
            if (user) identity = { type: 'user', id: String(user._id) };
          }
        } catch { /* Reject below when the cookie is invalid or expired. */ }
      }
      if (!identity) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      const conversationId = url.searchParams.get('conversationId');
      const selectedConversation = identity.type === 'admin' && conversationId
        ? await ChatConversation.findById(conversationId).select('userId').lean()
        : null;
      if (identity.type === 'admin' && conversationId && !selectedConversation) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.identity = identity;
        ws.on('error', () => {});
        if (identity.type === 'admin') adminSockets.add(ws);
        else userRoom(identity.id).add(ws);
        const peerUserId = selectedConversation ? String(selectedConversation.userId) : null;
        void setOnline(identity).then(() => sendPresenceSnapshot(ws, identity, peerUserId)).catch((error) => console.error(`Could not load chat presence: ${error.message}`));
        send(ws, { type: 'connected', role: identity.type });
        ws.on('message', async (data, isBinary) => {
          if (isBinary) { send(ws, { type: 'error', message: 'Binary messages are not supported.' }); return; }
          try {
            const event = JSON.parse(data.toString());
            if (event?.type === 'seen') {
              let conversation;
              if (identity.type === 'admin') {
                if (typeof event.conversationId !== 'string') { send(ws, { type: 'error', message: 'conversationId is required.' }); return; }
                conversation = await ChatConversation.findById(event.conversationId).select('userId').lean();
              } else {
                conversation = await ChatConversation.findOne({ userId: identity.id }).select('userId').lean();
              }
              if (!conversation) return;
              const seenAt = new Date();
              const seenResult = await ChatMessage.updateMany({
                conversationId: conversation._id,
                senderType: identity.type === 'admin' ? 'user' : 'admin',
                seenAt: null
              }, { $set: { seenAt } });
              await ChatConversation.updateOne({ _id: conversation._id }, { $set: { [identity.type === 'admin' ? 'unreadByAdmin' : 'unreadByUser']: 0 } });
              if (seenResult.modifiedCount) publishChatSeen(conversation.userId, conversation._id, seenAt, identity.type);
              return;
            }
            if (event?.type !== 'message') { send(ws, { type: 'error', message: 'Unsupported event type.' }); return; }
            let userId = identity.id;
            if (identity.type === 'admin') {
              if (typeof event.conversationId !== 'string') { send(ws, { type: 'error', message: 'conversationId is required.' }); return; }
              const conversation = await ChatConversation.findById(event.conversationId).select('userId').lean();
              if (!conversation) { send(ws, { type: 'error', message: 'Conversation not found.' }); return; }
              userId = String(conversation.userId);
            }
            const result = await sendMessage({ userId, adminId: identity.type === 'admin' ? identity.id : undefined, senderType: identity.type, body: event.body });
            publishChatMessage(userId, result.message);
          } catch (error) {
            send(ws, { type: 'error', message: error.statusCode ? error.message : 'Could not send message.' });
          }
        });
        ws.on('close', () => {
          if (identity.type === 'admin') adminSockets.delete(ws);
          else {
            const sockets = userSockets.get(identity.id);
            sockets?.delete(ws);
            if (sockets?.size === 0) { userSockets.delete(identity.id); scheduleOffline(identity); }
          }
          if (identity.type === 'admin' && adminSockets.size === 0) scheduleOffline(identity);
        });
      });
    } catch {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
    }
  });
  return wss;
}

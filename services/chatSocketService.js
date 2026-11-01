import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ChatConversation from '../models/ChatConversation.js';
import { verifyAdminToken } from './chatAuthService.js';
import { sendMessage } from './chatService.js';
import connectDB from '../config/database.js';
import chatEvents, { publishChatMessage } from './chatEvents.js';
import { consumeChatSocketTicket } from './chatSocketTickets.js';

const MAX_PAYLOAD = 16 * 1024;
const adminSockets = new Set();
const userSockets = new Map();

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
        if (!identity) {
          const admin = await verifyAdminToken(cookies.adminToken);
          if (admin) identity = { type: 'admin', id: String(admin.id) };
        }
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

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.identity = identity;
        ws.on('error', () => {});
        if (identity.type === 'admin') adminSockets.add(ws);
        else userRoom(identity.id).add(ws);
        send(ws, { type: 'connected', role: identity.type });
        ws.on('message', async (data, isBinary) => {
          if (isBinary) { send(ws, { type: 'error', message: 'Binary messages are not supported.' }); return; }
          try {
            const event = JSON.parse(data.toString());
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
            if (sockets?.size === 0) userSockets.delete(identity.id);
          }
        });
      });
    } catch {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
    }
  });
  return wss;
}

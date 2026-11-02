import express from 'express';
import { createServer } from 'node:http';
import { attachChatWebSocket } from '../services/chatSocketService.js';

const app = express();
app.get('*', (_req, res) => res.status(426).json({ message: 'WebSocket upgrade required.' }));

const server = createServer(app);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
attachChatWebSocket(server, { allowedOrigins });

export default server;

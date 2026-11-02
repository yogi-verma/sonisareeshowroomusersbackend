import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app.js';
import { attachChatWebSocket } from './services/chatSocketService.js';

const port = Number(process.env.PORT) || 5000;
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('Backend startup failed: MONGODB_URI and JWT_SECRET are required.');
  process.exit(1);
}

const server = createServer(app);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
attachChatWebSocket(server, { allowedOrigins });

server.listen(port, () => {
  console.log(`Server listening on port ${port}.`);
});

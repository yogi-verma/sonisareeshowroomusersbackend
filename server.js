import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT) || 5000;

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('Backend startup failed: MONGODB_URI and JWT_SECRET are required.');
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}.`);
});

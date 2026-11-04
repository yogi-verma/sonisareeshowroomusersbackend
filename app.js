import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import userRoutes from './routes/userRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminOrderRoutes from './routes/adminOrderRoutes.js';
import productReviewRoutes from './routes/productReviewRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

const app = express();

app.use('/api/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()) || 'http://localhost:3000',
  credentials: true
}));
app.use(async (_req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    return res.status(503).json({ message: 'Database unavailable.' });
  }
});
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminOrderRoutes);
app.use('/api/products', productReviewRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);

app.use((error, req, res, next) => {
  console.error(error.message);
  const statusCode = error.statusCode || error.status ||
    (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
  res.status(statusCode).json({
    message: statusCode < 500 ? error.message : 'An unexpected server error occurred.'
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

export default app;

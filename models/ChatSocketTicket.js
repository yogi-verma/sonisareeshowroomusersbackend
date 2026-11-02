import mongoose from 'mongoose';

const chatSocketTicketSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  adminId: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

export default mongoose.models.ChatSocketTicket
  || mongoose.model('ChatSocketTicket', chatSocketTicketSchema);

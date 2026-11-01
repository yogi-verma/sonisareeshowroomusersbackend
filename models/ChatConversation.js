import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  lastMessage: { type: String, default: '', maxlength: 2000 },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastMessageBy: { type: String, enum: ['user', 'admin'], default: 'user' },
  unreadByAdmin: { type: Number, default: 0, min: 0 },
  unreadByUser: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

export default mongoose.model('ChatConversation', chatConversationSchema);

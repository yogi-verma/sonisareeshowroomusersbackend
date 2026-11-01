import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
  senderType: { type: String, enum: ['user', 'admin'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 }
}, { timestamps: true });

chatMessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
export default mongoose.model('ChatMessage', chatMessageSchema);

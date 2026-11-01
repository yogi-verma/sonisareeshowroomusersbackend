import mongoose from 'mongoose';
import ChatConversation from '../models/ChatConversation.js';
import ChatMessage from '../models/ChatMessage.js';

export const MAX_MESSAGE_LENGTH = 2000;

export function serializeMessage(message) {
  return {
    id: String(message._id), conversationId: String(message.conversationId),
    senderType: message.senderType, senderId: String(message.senderId),
    body: message.body, createdAt: message.createdAt, seenAt: message.seenAt || null
  };
}

export async function sendMessage({ userId, adminId, senderType, body }) {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > MAX_MESSAGE_LENGTH) {
    throw Object.assign(new Error(`Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`), { statusCode: 400 });
  }
  const id = userId;
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('A valid user ID is required.'), { statusCode: 400 });
  let conversation = await ChatConversation.findOne({ userId: id });
  if (!conversation) {
    try { conversation = await ChatConversation.create({ userId: id }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await ChatConversation.findOne({ userId: id });
    }
  }
  if (conversation.status === 'closed' && senderType === 'user') {
    conversation.status = 'open';
    await conversation.save();
  }
  const senderId = senderType === 'user' ? userId : adminId;
  const message = await ChatMessage.create({ conversationId: conversation._id, senderType, senderId, body: body.trim() });
  await ChatConversation.updateOne({ _id: conversation._id }, {
    $set: { lastMessage: body.trim(), lastMessageAt: message.createdAt, lastMessageBy: senderType },
    $inc: senderType === 'user' ? { unreadByAdmin: 1 } : { unreadByUser: 1 }
  });
  return { conversation, message: serializeMessage(message) };
}


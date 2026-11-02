import mongoose from 'mongoose';
import ChatConversation from '../models/ChatConversation.js';
import ChatMessage from '../models/ChatMessage.js';
import ChatPresence from '../models/ChatPresence.js';
import { sendMessage, serializeMessage } from '../services/chatService.js';
import { publishChatMessage, publishChatSeen } from '../services/chatEvents.js';
import { createChatSocketTicket } from '../services/chatSocketTickets.js';

function badRequest(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
export function createAdminSocketTicket(req, res) {
  return res.json(createChatSocketTicket(req.chatAdmin.id));
}
function parsePage(req) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const before = req.query.before;
  if (before && !mongoose.isValidObjectId(before)) throw badRequest('A valid message cursor is required.');
  return { limit, before };
}

export async function getMyConversation(req, res, next) {
  try {
    const conversation = await ChatConversation.findOne({ userId: req.user._id }).lean();
    const adminPresence = await ChatPresence.findOne({ actorType: 'admin', actorId: 'showroom-admin' }).select('status lastSeenAt').lean();
    if (!conversation) return res.json({ conversation: null, messages: [], presence: { admin: adminPresence }, pagination: { hasMore: false } });
    const { limit, before } = parsePage(req);
    const seenAt = new Date();
    const seenResult = await ChatMessage.updateMany({ conversationId: conversation._id, senderType: 'admin', seenAt: null }, { $set: { seenAt } });
    if (seenResult.modifiedCount) publishChatSeen(req.user._id, conversation._id, seenAt, 'user');
    const query = { conversationId: conversation._id };
    if (before) {
      const cursor = await ChatMessage.findOne({ _id: before, conversationId: conversation._id }).select('createdAt').lean();
      if (!cursor) throw badRequest('The message cursor does not belong to this conversation.');
      query.createdAt = { $lt: cursor.createdAt };
    }
    const rows = await ChatMessage.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(serializeMessage);
    await ChatConversation.updateOne({ _id: conversation._id }, { $set: { unreadByUser: 0 } });
    return res.json({ conversation: { ...conversation, unreadByUser: 0 }, messages, presence: { admin: adminPresence }, pagination: { hasMore, nextBefore: hasMore ? messages[0]?.id : null } });
  } catch (error) { return next(error); }
}

export async function postMyMessage(req, res, next) {
  try {
    const result = await sendMessage({ userId: req.user._id, senderType: 'user', body: req.body?.body });
    publishChatMessage(req.user._id, result.message);
    return res.status(201).json({ conversation: result.conversation, message: result.message });
  } catch (error) { return next(error); }
}

export async function getAdminConversations(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const skip = Math.min(10000, Math.max(0, Number.parseInt(req.query.skip, 10) || 0));
    const [conversations, total] = await Promise.all([
      ChatConversation.find().sort({ lastMessageAt: -1 }).skip(skip).limit(limit).populate('userId', 'name email picture').lean(),
      ChatConversation.countDocuments()
    ]);
    const userIds = conversations.flatMap((item) => item.userId?._id ? [String(item.userId._id)] : []);
    const userPresenceRows = await ChatPresence.find({ actorType: 'user', actorId: { $in: userIds } }).select('actorId status lastSeenAt').lean();
    const presenceByUserId = new Map(userPresenceRows.map((presence) => [presence.actorId, presence]));
    return res.json({ conversations: conversations.map((conversation) => ({
      id: String(conversation._id), user: conversation.userId ? { id: String(conversation.userId._id), name: conversation.userId.name, email: conversation.userId.email, picture: conversation.userId.picture } : null,
      status: conversation.status, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt,
      lastMessageBy: conversation.lastMessageBy, unreadByAdmin: conversation.unreadByAdmin,
      userPresence: conversation.userId ? presenceByUserId.get(String(conversation.userId._id)) || null : null
    })), pagination: { total, limit, skip, hasMore: skip + conversations.length < total } });
  } catch (error) { return next(error); }
}

export async function getAdminConversationMessages(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) throw badRequest('A valid conversation ID is required.');
    const conversation = await ChatConversation.findById(conversationId).populate('userId', 'name email picture').lean();
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    const [userPresence, adminPresence] = await Promise.all([
      ChatPresence.findOne({ actorType: 'user', actorId: String(conversation.userId?._id || conversation.userId) }).select('status lastSeenAt').lean(),
      ChatPresence.findOne({ actorType: 'admin', actorId: 'showroom-admin' }).select('status lastSeenAt').lean()
    ]);
    const { limit, before } = parsePage(req);
    const seenAt = new Date();
    const seenResult = await ChatMessage.updateMany({ conversationId: conversation._id, senderType: 'user', seenAt: null }, { $set: { seenAt } });
    if (seenResult.modifiedCount) publishChatSeen(conversation.userId?._id || conversation.userId, conversation._id, seenAt, 'admin');
    const query = { conversationId: conversation._id };
    if (before) {
      const cursor = await ChatMessage.findOne({ _id: before, conversationId: conversation._id }).select('createdAt').lean();
      if (!cursor) throw badRequest('The message cursor does not belong to this conversation.');
      query.createdAt = { $lt: cursor.createdAt };
    }
    const rows = await ChatMessage.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(serializeMessage);
    await ChatConversation.updateOne({ _id: conversation._id }, { $set: { unreadByAdmin: 0 } });
    return res.json({ conversation, messages, presence: { user: userPresence, admin: adminPresence }, pagination: { hasMore, nextBefore: hasMore ? messages[0]?.id : null } });
  } catch (error) { return next(error); }
}

export async function postAdminMessage(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) throw badRequest('A valid conversation ID is required.');
    const conversation = await ChatConversation.findById(conversationId).lean();
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    const result = await sendMessage({ userId: conversation.userId, adminId: req.chatAdmin.id, senderType: 'admin', body: req.body?.body });
    publishChatMessage(conversation.userId, result.message);
    return res.status(201).json({ message: result.message });
  } catch (error) { return next(error); }
}

export async function updateConversationStatus(req, res, next) {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) throw badRequest('A valid conversation ID is required.');
    const { status } = req.body || {};
    if (!['open', 'closed'].includes(status)) throw badRequest('Status must be open or closed.');
    const conversation = await ChatConversation.findByIdAndUpdate(conversationId, { $set: { status } }, { new: true }).lean();
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    return res.json({ conversation });
  } catch (error) { return next(error); }
}

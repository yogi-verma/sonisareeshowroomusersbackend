import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import requireSameOrigin from '../middleware/requireSameOrigin.js';
import requireChatAdmin from '../middleware/requireChatAdmin.js';
import { getMyConversation, postMyMessage, getAdminConversations, getAdminConversationMessages, postAdminMessage, updateConversationStatus, createAdminSocketTicket } from '../controllers/chatController.js';

const router = Router();
router.get('/me', requireAuth, getMyConversation);
router.post('/me/messages', requireAuth, requireSameOrigin, postMyMessage);
router.get('/admin/conversations', requireChatAdmin, getAdminConversations);
router.post('/admin/socket-ticket', requireChatAdmin, createAdminSocketTicket);
router.get('/admin/conversations/:conversationId/messages', requireChatAdmin, getAdminConversationMessages);
router.post('/admin/conversations/:conversationId/messages', requireChatAdmin, requireSameOrigin, postAdminMessage);
router.patch('/admin/conversations/:conversationId', requireChatAdmin, requireSameOrigin, updateConversationStatus);
export default router;

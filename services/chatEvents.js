import { EventEmitter } from 'node:events';

const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(0);

export function publishChatMessage(userId, message) {
  chatEvents.emit('message', { userId: String(userId), message });
}

export function publishChatSeen(userId, conversationId, seenAt, seenBy) {
  chatEvents.emit('seen', { userId: String(userId), conversationId: String(conversationId), seenAt, seenBy });
}

export function publishChatPresence(actorType, actorId, status, lastSeenAt) {
  chatEvents.emit('presence', { actorType, actorId: String(actorId), status, lastSeenAt });
}

export default chatEvents;

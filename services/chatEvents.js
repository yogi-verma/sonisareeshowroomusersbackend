import { EventEmitter } from 'node:events';

const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(0);
const recentlyPublished = new Map();
const EVENT_DEDUPE_MS = 60_000;

function emitOnce(key, event) {
  const now = Date.now();
  for (const [eventKey, expiresAt] of recentlyPublished) {
    if (expiresAt <= now) recentlyPublished.delete(eventKey);
  }
  if (recentlyPublished.has(key)) return;
  recentlyPublished.set(key, now + EVENT_DEDUPE_MS);
  chatEvents.emit(event.type, event.payload);
}

export function publishChatMessage(userId, message) {
  emitOnce(`message:${message.id}`, {
    type: 'message',
    payload: { userId: String(userId), message }
  });
}

export function publishChatSeen(userId, conversationId, seenAt, seenBy) {
  const timestamp = new Date(seenAt).toISOString();
  emitOnce(`seen:${conversationId}:${timestamp}:${seenBy}`, {
    type: 'seen',
    payload: { userId: String(userId), conversationId: String(conversationId), seenAt, seenBy }
  });
}

export function publishChatPresence(actorType, actorId, status, lastSeenAt) {
  const timestamp = lastSeenAt ? new Date(lastSeenAt).toISOString() : '';
  emitOnce(`presence:${actorType}:${actorId}:${status}:${timestamp}`, {
    type: 'presence',
    payload: { actorType, actorId: String(actorId), status, lastSeenAt }
  });
}

export default chatEvents;

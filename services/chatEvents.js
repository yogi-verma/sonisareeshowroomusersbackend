import { EventEmitter } from 'node:events';

const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(0);

export function publishChatMessage(userId, message) {
  chatEvents.emit('message', { userId: String(userId), message });
}

export default chatEvents;

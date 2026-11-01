import mongoose from 'mongoose';

const chatPresenceSchema = new mongoose.Schema({
  actorType: { type: String, enum: ['user', 'admin'], required: true },
  actorId: { type: String, required: true },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  lastSeenAt: { type: Date, default: null }
}, { timestamps: true });

chatPresenceSchema.index({ actorType: 1, actorId: 1 }, { unique: true });
export default mongoose.model('ChatPresence', chatPresenceSchema);

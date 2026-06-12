const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: String, enum: ['client', 'admin'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'registration_successful',
        'uci_generated',
        'document_uploaded',
        'document_approved',
        'document_rejected',
        'additional_documents_requested',
        'payment_received',
        'application_decision',
        'status_update',
        'message'
      ],
      required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    link: { type: String } // optional frontend route to navigate to
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);

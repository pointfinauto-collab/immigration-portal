const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transactionId: { type: String, required: true, unique: true },
    receiptNumber: { type: String, unique: true, sparse: true },
    paymentReference: { type: String, unique: true, sparse: true }, // for representative payments

    amount: { type: Number, required: true },
    currency: { type: String, default: 'CAD' },

    paymentMethod: {
      type: String,
      enum: ['Visa', 'Mastercard', 'American Express', 'Bank Transfer', 'Representative Payment'],
      required: true
    },

    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
      default: 'Pending'
    },

    // Card details are NEVER stored fully - only masked reference for demo purposes
    cardLast4: { type: String },

    // Representative payment specific fields
    representative: {
      fullName: { type: String },
      relationship: { type: String },
      email: { type: String },
      phone: { type: String }
    },

    markedReceivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    markedReceivedAt: { type: Date },

    paymentDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);

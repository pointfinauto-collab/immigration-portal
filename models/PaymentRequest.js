const mongoose = require('mongoose');

const paymentRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },

    title: { type: String, required: true, trim: true }, // what the fee is for, e.g. "Additional Processing Fee"
    description: { type: String, trim: true }, // optional longer note/reason
    amount: { type: Number, required: true },
    currency: { type: String, default: 'CAD' },

    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Cancelled'],
      default: 'Pending'
    },

    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // linked once paid
    paidAt: { type: Date },

    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    cancelledAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentRequest', paymentRequestSchema);

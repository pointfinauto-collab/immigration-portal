const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      'Draft',
      'Submitted',
      'Under Review',
      'Additional Documents Required',
      'Approved',
      'Refused',
      'Completed'
    ],
    required: true
  },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  note: { type: String, default: '' }
});

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    gcReferenceNumber: { type: String, required: true, unique: true },
    ucinNumber: { type: String, required: true },

    applicationType: { type: String, default: 'General Immigration Application' },

    status: {
      type: String,
      enum: [
        'Draft',
        'Submitted',
        'Under Review',
        'Additional Documents Required',
        'Approved',
        'Refused',
        'Completed'
      ],
      default: 'Draft'
    },

    statusHistory: [statusHistorySchema],

    assignedOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },

    submittedAt: { type: Date },
    decisionAt: { type: Date },
    decisionNote: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);

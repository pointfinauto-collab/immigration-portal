const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ['User', 'AdminUser', 'System'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorEmail: { type: String },

    action: { type: String, required: true }, // e.g. 'LOGIN', 'DOCUMENT_APPROVED', 'STATUS_UPDATED'
    targetType: { type: String }, // e.g. 'User', 'Document', 'Payment'
    targetId: { type: mongoose.Schema.Types.ObjectId },

    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);

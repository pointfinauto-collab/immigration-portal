const mongoose = require('mongoose');

const documentRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: {
      type: String,
      enum: ['passport', 'nationalId', 'passportPhoto', 'supportingDocument', 'additionalDocument'],
      required: true
    },
    originalName: { type: String, required: true },
    storedFileName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Replaced'],
      default: 'Pending'
    },

    adminComment: { type: String, default: '' },
    requestNote: { type: String, default: '' }, // when admin requests new document

    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRecord' },

    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentRecord', documentRecordSchema);

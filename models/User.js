const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const documentSchema = new mongoose.Schema({
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
  uploadedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
});

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: true
    },
    nationality: { type: String, required: true, trim: true },
    passportNumber: { type: String, required: true, trim: true },
    countryOfResidence: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: { type: String, required: true, minlength: 8, select: false },

    // Unique identifiers
    ucinNumber: { type: String, unique: true, index: true }, // UCI-XXXX-XXXX
    gcReferenceNumber: { type: String, unique: true, index: true }, // GC-YYYY-XXXXXX

    // Documents uploaded during registration & afterwards
    documents: [documentSchema],

    // Application progress
    applicationStatus: {
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

    assignedOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },

    role: { type: String, enum: ['client'], default: 'client' },

    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },

    lastLogin: { type: Date },
    refreshToken: { type: String, select: false }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);

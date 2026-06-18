const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const Application = require('../models/Application');
const DocumentRecord = require('../models/Document');
const { generateClientIdentifiers, generate6DigitCode } = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/sendEmail');
const {
  registrationConfirmationEmail,
  verificationCodeEmail,
  passwordResetCodeEmail
} = require('../utils/emailTemplates');
const { ALL_PROGRAM_NAMES, PROGRAM_CATEGORIES } = require('../utils/immigrationPrograms');

const VERIFICATION_CODE_TTL_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_RESET_ATTEMPTS = 5;

const signAccessToken = (id, userType) => {
  return jwt.sign({ id, userType }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const signRefreshToken = (id, userType) => {
  return jwt.sign({ id, userType }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

/**
 * @route POST /api/auth/register
 * @desc  Register a new client account with required document uploads
 */
const registerClient = async (req, res, next) => {
  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      nationality,
      passportNumber,
      countryOfResidence,
      phoneNumber,
      email,
      password,
      programCategory,
      programName
    } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    if (!programCategory || !PROGRAM_CATEGORIES.includes(programCategory)) {
      return res.status(400).json({ success: false, message: 'Please select a valid immigration program category.' });
    }
    if (!programName || !ALL_PROGRAM_NAMES.includes(programName)) {
      return res.status(400).json({ success: false, message: 'Please select a valid immigration program.' });
    }

    // Validate required file uploads
    const files = req.files || {};
    if (!files.passport || !files.passport[0]) {
      return res.status(400).json({ success: false, message: 'Passport document is required.' });
    }
    if (!files.passportPhoto || !files.passportPhoto[0]) {
      return res.status(400).json({ success: false, message: 'Passport photo is required.' });
    }
    if (!files.supportingDocuments || !files.supportingDocuments[0]) {
      return res.status(400).json({ success: false, message: 'At least one supporting document is required.' });
    }

    // Generate unique identifiers
    const { gcReferenceNumber, ucinNumber } = await generateClientIdentifiers();

    // Build documents array from uploaded files
    const documents = [];
    const pushDocs = (fieldFiles, documentType) => {
      if (!fieldFiles) return;
      fieldFiles.forEach((file) => {
        documents.push({
          documentType,
          originalName: file.originalname,
          storedFileName: file.filename,
          filePath: file.path.replace(/\\/g, '/'),
          mimeType: file.mimetype,
          size: file.size
        });
      });
    };

    pushDocs(files.passport, 'passport');
    pushDocs(files.nationalId, 'nationalId');
    pushDocs(files.passportPhoto, 'passportPhoto');
    pushDocs(files.supportingDocuments, 'supportingDocument');

    const verificationCode = generate6DigitCode();
    const verificationExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);

    const user = await User.create({
      fullName,
      dateOfBirth,
      gender,
      nationality,
      passportNumber,
      countryOfResidence,
      phoneNumber,
      email: email.toLowerCase(),
      password,
      gcReferenceNumber,
      ucinNumber,
      documents,
      applicationStatus: 'Draft',
      programCategory,
      programName,
      isEmailVerified: false,
      verificationCode,
      verificationExpiry,
      verificationAttempts: 0
    });

    // Create related Application record
    const application = await Application.create({
      user: user._id,
      gcReferenceNumber,
      ucinNumber,
      status: 'Draft',
      statusHistory: [{ status: 'Draft', note: 'Application created upon registration.' }]
    });

    // Create DocumentRecord entries (for admin-side document management collection)
    await Promise.all(
      documents.map((doc) =>
        DocumentRecord.create({
          user: user._id,
          documentType: doc.documentType,
          originalName: doc.originalName,
          storedFileName: doc.storedFileName,
          filePath: doc.filePath,
          mimeType: doc.mimeType,
          size: doc.size
        })
      )
    );

    // Notifications
    await createNotification(user._id, 'registration_successful');
    await createNotification(user._id, 'uci_generated');

    // Emails: registration confirmation + verification code
    await sendEmail({
      to: user.email,
      subject: 'Welcome to the Immigration Client Portal',
      html: registrationConfirmationEmail({ fullName: user.fullName, gcReferenceNumber, ucinNumber })
    });
    await sendEmail({
      to: user.email,
      subject: 'Verify your email address',
      html: verificationCodeEmail({ fullName: user.fullName, code: verificationCode })
    });

    await recordAuditLog({
      actorType: 'User',
      actorId: user._id,
      actorEmail: user.email,
      action: 'REGISTER',
      targetType: 'User',
      targetId: user._id,
      details: { gcReferenceNumber, ucinNumber, programCategory, programName },
      req
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for a verification code.',
      data: {
        email: user.email,
        gcReferenceNumber,
        ucinNumber
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/login
 * @desc  Client login
 */
const loginClient = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive || user.accountStatus === 'Suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordAuditLog({
        actorType: 'User',
        actorId: user._id,
        actorEmail: user.email,
        action: 'LOGIN_FAILED',
        req
      });
      return

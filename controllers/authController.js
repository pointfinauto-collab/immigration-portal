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
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        data: { email: user.email }
      });
    }

    const accessToken = signAccessToken(user._id, 'client');
    const refreshToken = signRefreshToken(user._id, 'client');

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    await recordAuditLog({
      actorType: 'User',
      actorId: user._id,
      actorEmail: user.email,
      action: 'LOGIN_SUCCESS',
      req
    });

    res.json({
      success: true,
      message: 'Login successful.',
      data: { user: user.toSafeObject(), accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/admin/login
 * @desc  Admin/officer login
 */
const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await AdminUser.findOne({ email: email.toLowerCase() }).select('+password');
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: 'Your admin account has been deactivated.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      await recordAuditLog({
        actorType: 'AdminUser',
        actorId: admin._id,
        actorEmail: admin.email,
        action: 'ADMIN_LOGIN_FAILED',
        req
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const accessToken = signAccessToken(admin._id, 'admin');
    const refreshToken = signRefreshToken(admin._id, 'admin');

    admin.refreshToken = refreshToken;
    admin.lastLogin = new Date();
    await admin.save();

    await recordAuditLog({
      actorType: 'AdminUser',
      actorId: admin._id,
      actorEmail: admin.email,
      action: 'ADMIN_LOGIN_SUCCESS',
      req
    });

    res.json({
      success: true,
      message: 'Admin login successful.',
      data: { admin: admin.toSafeObject(), accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/refresh
 * @desc  Issue new access token using refresh token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Refresh token is required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    let account;
    if (decoded.userType === 'client') {
      account = await User.findById(decoded.id).select('+refreshToken');
    } else {
      account = await AdminUser.findById(decoded.id).select('+refreshToken');
    }

    if (!account || account.refreshToken !== token) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const accessToken = signAccessToken(account._id, decoded.userType);
    res.json({ success: true, data: { accessToken } });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
};

/**
 * @route POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    if (req.userType === 'client') {
      req.user.refreshToken = undefined;
      await req.user.save();
    } else if (req.userType === 'admin') {
      req.admin.refreshToken = undefined;
      await req.admin.save();
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/verify-email
 * @desc  Verify a client's email using the 6-digit code sent at registration
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+verificationCode +verificationExpiry +verificationAttempts'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'This email is already verified. You can log in.' });
    }

    if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.'
      });
    }

    if (!user.verificationCode || !user.verificationExpiry || user.verificationExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    if (user.verificationCode !== code) {
      user.verificationAttempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }

    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    user.verificationAttempts = 0;
    await user.save();

    await recordAuditLog({
      actorType: 'User',
      actorId: user._id,
      actorEmail: user.email,
      action: 'EMAIL_VERIFIED',
      req
    });

    const accessToken = signAccessToken(user._id, 'client');
    const refreshToken = signRefreshToken(user._id, 'client');
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully.',
      data: { user: user.toSafeObject(), accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/resend-verification
 * @desc  Resend a new 6-digit email verification code
 */
const resendVerificationCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'This email is already verified. You can log in.' });
    }

    const verificationCode = generate6DigitCode();
    user.verificationCode = verificationCode;
    user.verificationExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
    user.verificationAttempts = 0;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Your new verification code',
      html: verificationCodeEmail({ fullName: user.fullName, code: verificationCode })
    });

    res.json({ success: true, message: 'A new verification code has been sent to your email.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/forgot-password
 * @desc  Sends a 6-digit password reset code to the user's email
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with that email, a password reset code has been sent.'
      });
    }

    const resetCode = generate6DigitCode();
    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
    user.passwordResetAttempts = 0;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Password reset code',
      html: passwordResetCodeEmail({ fullName: user.fullName, code: resetCode })
    });

    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset code has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/verify-reset-code
 */
const verifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordResetCode +passwordResetExpiry +passwordResetAttempts'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (user.passwordResetAttempts >= MAX_RESET_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new password reset code.'
      });
    }

    if (!user.passwordResetCode || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset code has expired. Please request a new one.' });
    }

    if (user.passwordResetCode !== code) {
      user.passwordResetAttempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'Incorrect reset code.' });
    }

    res.json({ success: true, message: 'Code verified. You may now set a new password.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordResetCode +passwordResetExpiry +passwordResetAttempts'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (user.passwordResetAttempts >= MAX_RESET_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new password reset code.'
      });
    }

    if (!user.passwordResetCode || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset code has expired. Please request a new one.' });
    }

    if (user.passwordResetCode !== code) {
      user.passwordResetAttempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'Incorrect reset code.' });
    }

    user.password = newPassword;
    user.passwordResetCode = undefined;
    user.passwordResetExpiry = undefined;
    user.passwordResetAttempts = 0;
    user.refreshToken = undefined;
    await user.save();

    await recordAuditLog({
      actorType: 'User',
      actorId: user._id,
      actorEmail: user.email,
      action: 'PASSWORD_RESET',
      req
    });

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerClient,
  loginClient,
  loginAdmin,
  refreshToken,
  logout,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  verifyResetCode,
  resetPassword
};

const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  validate,
  registerValidation,
  loginValidation,
  verifyEmailValidation,
  resendVerificationValidation,
  forgotPasswordValidation,
  verifyResetCodeValidation,
  resetPasswordValidation
} = require('../middleware/validators');
const upload = require('../config/upload');

// Registration with required document uploads
router.post(
  '/register',
  authLimiter,
  upload.fields([
    { name: 'passport', maxCount: 1 },
    { name: 'nationalId', maxCount: 1 },
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 5 }
  ]),
  registerValidation,
  validate,
  registerClient
);

// Client login
router.post('/login', authLimiter, loginValidation, validate, loginClient);

// Admin login
router.post('/admin/login', authLimiter, loginValidation, validate, loginAdmin);

// Email verification
router.post('/verify-email', authLimiter, verifyEmailValidation, validate, verifyEmail);
router.post('/resend-verification', authLimiter, resendVerificationValidation, validate, resendVerificationCode);

// Forgot / reset password
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validate, forgotPassword);
router.post('/verify-reset-code', authLimiter, verifyResetCodeValidation, validate, verifyResetCode);
router.post('/reset-password', authLimiter, resetPasswordValidation, validate, resetPassword);

// Refresh access token
router.post('/refresh', refreshToken);

// Logout (requires valid access token)
router.post('/logout', protect(), logout);

module.exports = router;

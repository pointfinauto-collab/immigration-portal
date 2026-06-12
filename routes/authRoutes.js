const express = require('express');
const router = express.Router();

const {
  registerClient,
  loginClient,
  loginAdmin,
  refreshToken,
  logout
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate, registerValidation, loginValidation } = require('../middleware/validators');
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

// Refresh access token
router.post('/refresh', refreshToken);

// Logout (requires valid access token)
router.post('/logout', protect(), logout);

module.exports = router;

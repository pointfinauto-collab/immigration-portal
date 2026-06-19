const express = require('express');
const router = express.Router();

const { checkStatus, getPrograms } = require('../controllers/publicController');
const { authLimiter } = require('../middleware/rateLimiter');

// Public, rate-limited status lookup (no authentication required)
router.get('/status', authLimiter, checkStatus);

// Public list of immigration programs (for the registration form dropdown)
router.get('/programs', getPrograms);

module.exports = router;

const express = require('express');
const router = express.Router();

const { checkStatus } = require('../controllers/publicController');
const { authLimiter } = require('../middleware/rateLimiter');

// Public, rate-limited status lookup (no authentication required)
router.get('/status', authLimiter, checkStatus);

module.exports = router;

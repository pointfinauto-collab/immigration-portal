const express = require('express');
const router = express.Router();

const { sendMessageAsClient, getMyMessages } = require('../controllers/messageController');
const { protect, requireClient } = require('../middleware/auth');
const { validate, messageValidation } = require('../middleware/validators');

router.use(protect(), requireClient);

router.post('/', messageValidation, validate, sendMessageAsClient);
router.get('/', getMyMessages);

module.exports = router;

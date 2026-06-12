const express = require('express');
const router = express.Router();

const { createPayment, getMyPayments, getReceipt } = require('../controllers/paymentController');
const { protect, requireClient } = require('../middleware/auth');
const { validate, paymentValidation } = require('../middleware/validators');

router.use(protect(), requireClient);

router.post('/', paymentValidation, validate, createPayment);
router.get('/', getMyPayments);
router.get('/:id/receipt', getReceipt);

module.exports = router;

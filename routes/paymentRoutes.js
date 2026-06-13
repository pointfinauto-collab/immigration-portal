const express = require('express');
const router = express.Router();

const { createPayment, createPaypalOrder, capturePaypalOrder, getMyPayments, getReceipt } = require('../controllers/paymentController');
const { protect, requireClient } = require('../middleware/auth');
const { validate, paymentValidation } = require('../middleware/validators');

router.use(protect(), requireClient);

router.post('/', paymentValidation, validate, createPayment);
router.post('/paypal/create-order', createPaypalOrder);
router.post('/paypal/capture-order', capturePaypalOrder);
router.get('/', getMyPayments);
router.get('/:id/receipt', getReceipt);

module.exports = router;

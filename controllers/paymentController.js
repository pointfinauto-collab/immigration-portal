const Payment = require('../models/Payment');
const {
  generateTransactionId,
  generateReceiptNumber,
  generatePaymentReference
} = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');
const paystack = require('../config/paystack');

/**
 * @route POST /api/payments
 * @desc  Initiate a payment for Bank Transfer or Representative Payment.
 *        Both result in a Pending payment with a payment reference, to be
 *        confirmed manually by an admin once funds are received.
 *        Card payments are handled separately via the /paystack endpoints.
 */
const createPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, representative } = req.body;

    if (!['Bank Transfer', 'Representative Payment'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Use the card checkout flow for card payments, or select Bank Transfer / Representative Payment here.'
      });
    }

    const transactionId = generateTransactionId();

    const paymentData = {
      user: req.user._id,
      transactionId,
      amount,
      paymentMethod,
      status: 'Pending',
      paymentReference: generatePaymentReference()
    };

    if (paymentMethod === 'Representative Payment') {
      if (!representative || !representative.fullName || !representative.email) {
        return res.status(400).json({
          success: false,
          message: 'Representative full name and email are required for representative payments.'
        });
      }
      paymentData.representative = {
        fullName: representative.fullName,
        relationship: representative.relationship || '',
        email: representative.email,
        phone: representative.phone || ''
      };
    }

    const payment = await Payment.create(paymentData);

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'PAYMENT_INITIATED',
      targetType: 'Payment',
      targetId: payment._id,
      details: { amount, paymentMethod, status: payment.status },
      req
    });

    res.status(201).json({ success: true, message: 'Payment record created.', data: { payment } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/payments/paystack/initialize
 * @desc  Initializes a Paystack transaction for the given amount and returns
 *        the authorization URL for the client to redirect to.
 */
const initializePaystackTransaction = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'A valid amount is required.' });
    }

    const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    const currency = process.env.PAYSTACK_CURRENCY || 'KES';

    const transaction = await paystack.initializeTransaction({
      amount,
      currency,
      email: req.user.email,
      callbackUrl: `${clientUrl}/payment.html?status=callback`,
      metadata: {
        userId: req.user._id.toString(),
        amount: String(amount)
      }
    });

    res.status(201).json({
      success: true,
      data: { authorizationUrl: transaction.authorization_url, reference: transaction.reference }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/payments/paystack/verify
 * @desc  Verifies a Paystack transaction by reference and, if successful,
 *        creates a Completed payment record with a receipt number.
 */
const verifyPaystackTransaction = async (req, res, next) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'reference is required.' });
    }

    const transaction = await paystack.verifyTransaction(reference);

    if (transaction.status !== 'success') {
      return res.status(400).json({ success: false, message: `Payment not completed (status: ${transaction.status}).` });
    }

    // Avoid creating duplicate records if this transaction was already processed
    const existing = await Payment.findOne({ paystackReference: transaction.reference });
    if (existing) {
      return res.status(200).json({ success: true, message: 'Payment already recorded.', data: { payment: existing } });
    }

    const amount = transaction.amount / 100; // Paystack amounts are in the smallest currency unit

    const payment = await Payment.create({
      user: req.user._id,
      transactionId: generateTransactionId(),
      receiptNumber: generateReceiptNumber(),
      amount,
      currency: (transaction.currency || 'KES').toUpperCase(),
      paymentMethod: 'Card (Paystack)',
      status: 'Completed',
      paystackReference: transaction.reference
    });

    await createNotification(req.user._id, 'payment_received');

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'PAYSTACK_PAYMENT_COMPLETED',
      targetType: 'Payment',
      targetId: payment._id,
      details: { amount, paystackReference: transaction.reference },
      req
    });

    res.status(201).json({ success: true, message: 'Payment completed successfully.', data: { payment } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/payments
 * @desc  Get all payments for the logged-in client
 */
const getMyPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { payments } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/payments/:id/receipt
 * @desc  Returns receipt data for a completed payment (used for client-side PDF generation)
 */
const getReceipt = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }
    if (payment.status !== 'Completed') {
      return res.status(400).json({ success: false, message: 'Receipt is only available for completed payments.' });
    }
    res.json({
      success: true,
      data: {
        receipt: {
          receiptNumber: payment.receiptNumber,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.paymentDate,
          clientName: req.user.fullName,
          ucinNumber: req.user.ucinNumber,
          gcReferenceNumber: req.user.gcReferenceNumber
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createPayment, initializePaystackTransaction, verifyPaystackTransaction, getMyPayments, getReceipt };

const Payment = require('../models/Payment');
const {
  generateTransactionId,
  generateReceiptNumber,
  generatePaymentReference
} = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');
const paypal = require('../config/paypal');

/**
 * @route POST /api/payments
 * @desc  Initiate a payment for Bank Transfer or Representative Payment.
 *        Both result in a Pending payment with a payment reference, to be
 *        confirmed manually by an admin once funds are received.
 *        PayPal payments are handled separately via the /paypal endpoints.
 */
const createPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, representative } = req.body;

    if (!['Bank Transfer', 'Representative Payment'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Use the PayPal checkout flow for card payments, or select Bank Transfer / Representative Payment here.'
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
 * @route POST /api/payments/paypal/create-order
 * @desc  Creates a PayPal order for the given amount and returns the order ID
 *        for the client-side PayPal Buttons to approve.
 */
const createPaypalOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'A valid amount is required.' });
    }

    const order = await paypal.createOrder(amount, 'CAD');

    res.status(201).json({ success: true, data: { orderId: order.id } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/payments/paypal/capture-order
 * @desc  Captures an approved PayPal order. On success, creates a Completed
 *        payment record with a receipt number.
 */
const capturePaypalOrder = async (req, res, next) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required.' });
    }

    const capture = await paypal.captureOrder(orderId);

    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({ success: false, message: `PayPal payment not completed (status: ${capture.status}).` });
    }

    const purchaseUnit = capture.purchase_units && capture.purchase_units[0];
    const captureDetails = purchaseUnit && purchaseUnit.payments && purchaseUnit.payments.captures && purchaseUnit.payments.captures[0];
    const capturedAmount = captureDetails ? captureDetails.amount.value : amount;

    const payment = await Payment.create({
      user: req.user._id,
      transactionId: generateTransactionId(),
      receiptNumber: generateReceiptNumber(),
      amount: capturedAmount,
      currency: 'CAD',
      paymentMethod: 'PayPal',
      status: 'Completed',
      paypalOrderId: capture.id,
      paypalPayerId: capture.payer && capture.payer.payer_id
    });

    await createNotification(req.user._id, 'payment_received');

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'PAYPAL_PAYMENT_COMPLETED',
      targetType: 'Payment',
      targetId: payment._id,
      details: { amount: capturedAmount, paypalOrderId: capture.id },
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

module.exports = { createPayment, createPaypalOrder, capturePaypalOrder, getMyPayments, getReceipt };

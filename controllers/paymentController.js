const Payment = require('../models/Payment');
const {
  generateTransactionId,
  generateReceiptNumber,
  generatePaymentReference
} = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * @route POST /api/payments
 * @desc  Initiate a payment. For card/bank methods, marked completed immediately (demo).
 *        For Representative Payment, a payment reference is generated and status is Pending.
 */
const createPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, cardLast4, representative } = req.body;

    const transactionId = generateTransactionId();

    const paymentData = {
      user: req.user._id,
      transactionId,
      amount,
      paymentMethod
    };

    if (paymentMethod === 'Representative Payment') {
      if (!representative || !representative.fullName || !representative.email) {
        return res.status(400).json({
          success: false,
          message: 'Representative full name and email are required for representative payments.'
        });
      }
      paymentData.status = 'Pending';
      paymentData.paymentReference = generatePaymentReference();
      paymentData.representative = {
        fullName: representative.fullName,
        relationship: representative.relationship || '',
        email: representative.email,
        phone: representative.phone || ''
      };
    } else if (paymentMethod === 'Bank Transfer') {
      paymentData.status = 'Pending';
      paymentData.paymentReference = generatePaymentReference();
    } else {
      // Visa, Mastercard, American Express - simulated immediate processing
      if (!cardLast4 || !/^\d{4}$/.test(cardLast4)) {
        return res.status(400).json({ success: false, message: 'A valid 4-digit card reference is required.' });
      }
      paymentData.status = 'Completed';
      paymentData.cardLast4 = cardLast4;
      paymentData.receiptNumber = generateReceiptNumber();
    }

    const payment = await Payment.create(paymentData);

    if (payment.status === 'Completed') {
      await createNotification(req.user._id, 'payment_received');
    }

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

module.exports = { createPayment, getMyPayments, getReceipt };

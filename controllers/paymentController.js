const Payment = require('../models/Payment');
const PaymentRequest = require('../models/PaymentRequest');
const {
  generateTransactionId,
  generateReceiptNumber,
  generatePaymentReference
} = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/sendEmail');
const { paymentConfirmationEmail } = require('../utils/emailTemplates');
const paystack = require('../config/paystack');

const createPayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, representative, paymentRequestId } = req.body;
    if (!['Bank Transfer', 'Representative Payment'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Use the card checkout flow for card payments, or select Bank Transfer / Representative Payment here.' });
    }
    let linkedRequest = null;
    if (paymentRequestId) {
      linkedRequest = await PaymentRequest.findOne({ _id: paymentRequestId, user: req.user._id, status: 'Pending' });
      if (!linkedRequest) return res.status(404).json({ success: false, message: 'Payment request not found or already settled.' });
    }
    const transactionId = generateTransactionId();
    const paymentData = { user: req.user._id, transactionId, amount, paymentMethod, status: 'Pending', paymentReference: generatePaymentReference() };
    if (linkedRequest) paymentData.paymentRequest = linkedRequest._id;
    if (paymentMethod === 'Representative Payment') {
      if (!representative || !representative.fullName || !representative.email) {
        return res.status(400).json({ success: false, message: 'Representative full name and email are required for representative payments.' });
      }
      paymentData.representative = { fullName: representative.fullName, relationship: representative.relationship || '', email: representative.email, phone: representative.phone || '' };
    }
    const payment = await Payment.create(paymentData);
    await recordAuditLog({ actorType: 'User', actorId: req.user._id, actorEmail: req.user.email, action: 'PAYMENT_INITIATED', targetType: 'Payment', targetId: payment._id, details: { amount, paymentMethod, status: payment.status, paymentRequestId: linkedRequest ? linkedRequest._id : null }, req });
    res.status(201).json({ success: true, message: 'Payment record created.', data: { payment } });
  } catch (error) {
    next(error);
  }
};

const initializePaystackTransaction = async (req, res, next) => {
  try {
    const { amount, paymentRequestId } = req.body;
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ success: false, message: 'A valid amount is required.' });
    if (paymentRequestId) {
      const linkedRequest = await PaymentRequest.findOne({ _id: paymentRequestId, user: req.user._id, status: 'Pending' });
      if (!linkedRequest) return res.status(404).json({ success: false, message: 'Payment request not found or already settled.' });
    }
    const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    const currency = process.env.PAYSTACK_CURRENCY || 'KES';
    const transaction = await paystack.initializeTransaction({
      amount, currency, email: req.user.email,
      callbackUrl: `${clientUrl}/payment.html?status=callback`,
      metadata: { userId: req.user._id.toString(), amount: String(amount), paymentRequestId: paymentRequestId || '' }
    });
    res.status(201).json({ success: true, data: { authorizationUrl: transaction.authorization_url, reference: transaction.reference } });
  } catch (error) {
    next(error);
  }
};

const verifyPaystackTransaction = async (req, res, next) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ success: false, message: 'reference is required.' });
    const transaction = await paystack.verifyTransaction(reference);
    if (transaction.status !== 'success') return res.status(400).json({ success: false, message: `Payment not completed (status: ${transaction.status}).` });
    const existing = await Payment.findOne({ paystackReference: transaction.reference });
    if (existing) return res.status(200).json({ success: true, message: 'Payment already recorded.', data: { payment: existing } });
    const amount = transaction.amount / 100;
    const paymentRequestId = transaction.metadata && transaction.metadata.paymentRequestId;
    let linkedRequest = null;
    if (paymentRequestId) {
      linkedRequest = await PaymentRequest.findOne({ _id: paymentRequestId, user: req.user._id, status: 'Pending' });
    }
    const payment = await Payment.create({
      user: req.user._id, transactionId: generateTransactionId(), receiptNumber: generateReceiptNumber(),
      amount, currency: (transaction.currency || 'KES').toUpperCase(), paymentMethod: 'Card (Paystack)',
      status: 'Completed', paystackReference: transaction.reference, paymentRequest: linkedRequest ? linkedRequest._id : undefined
    });
    if (linkedRequest) { linkedRequest.status = 'Paid'; linkedRequest.payment = payment._id; linkedRequest.paidAt = new Date(); await linkedRequest.save(); }
    await createNotification(req.user._id, 'payment_received');
    await sendEmail({ to: req.user.email, subject: 'Payment received', html: paymentConfirmationEmail({ fullName: req.user.fullName, amount, currency: payment.currency, receiptNumber: payment.receiptNumber }) });
    await recordAuditLog({ actorType: 'User', actorId: req.user._id, actorEmail: req.user.email, action: 'PAYSTACK_PAYMENT_COMPLETED', targetType: 'Payment', targetId: payment._id, details: { amount, paystackReference: transaction.reference, paymentRequestId: linkedRequest ? linkedRequest._id : null }, req });
    res.status(201).json({ success: true, message: 'Payment completed successfully.', data: { payment } });
  } catch (error) {
    next(error);
  }
};

const getMyPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { payments } });
  } catch (error) {
    next(error);
  }
};

const getReceipt = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found.' });
    if (payment.status !== 'Completed') return res.status(400).json({ success: false, message: 'Receipt is only available for completed payments.' });
    res.json({ success: true, data: { receipt: { receiptNumber: payment.receiptNumber, transactionId: payment.transactionId, amount: payment.amount, currency: payment.currency, paymentMethod: payment.paymentMethod, paymentDate: payment.paymentDate, clientName: req.user.fullName, ucinNumber: req.user.ucinNumber, gcReferenceNumber: req.user.gcReferenceNumber } } });
  } catch (error) {
    next(error);
  }
};

const getMyPaymentRequests = async (req, res, next) => {
  try {
    const paymentRequests = await PaymentRequest.find({ user: req.user._id, status: 'Pending' }).sort({ createdAt: -1 });
    res.json({ success: true, data: { paymentRequests } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createPayment, initializePaystackTransaction, verifyPaystackTransaction, getMyPayments, getMyPaymentRequests, getReceipt };

const User = require('../models/User');
const Application = require('../models/Application');
const DocumentRecord = require('../models/Document');
const Payment = require('../models/Payment');
const PaymentRequest = require('../models/PaymentRequest');
const AdminUser = require('../models/AdminUser');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const {
  generateReceiptNumber
} = require('../utils/generateIds');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/sendEmail');
const { feeAssignedEmail, statusUpdateEmail, adminMessageEmail, paymentConfirmationEmail } = require('../utils/emailTemplates');
const { ALL_PROGRAM_NAMES } = require('../utils/immigrationPrograms');

const getApplicants = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.applicationStatus = status;
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { fullName: regex },
        { email: regex },
        { ucinNumber: regex },
        { gcReferenceNumber: regex },
        { passportNumber: regex }
      ];
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [applicants, total] = await Promise.all([
      User.find(query).select('-documents').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      User.countDocuments(query)
    ]);
    res.json({
      success: true,
      data: {
        applicants,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getApplicantDetail = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Applicant not found.' });
    const application = await Application.findOne({ user: user._id }).populate('assignedOfficer', 'fullName email role');
    const documents = await DocumentRecord.find({ user: user._id }).sort({ createdAt: -1 });
    const payments = await Payment.find({ user: user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { user: user.toSafeObject(), application, documents, payments } });
  } catch (error) {
    next(error);
  }
};

const assignOfficer = async (req, res, next) => {
  try {
    const { officerId } = req.body;
    const officer = await AdminUser.findById(officerId);
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found.' });
    const application = await Application.findOneAndUpdate({ user: req.params.id }, { assignedOfficer: officerId }, { new: true });
    if (!application) return res.status(404).json({ success: false, message: 'Application not found.' });
    await User.findByIdAndUpdate(req.params.id, { assignedOfficer: officerId });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'OFFICER_ASSIGNED', targetType: 'Application', targetId: application._id, details: { officerId }, req });
    res.json({ success: true, message: 'Officer assigned successfully.', data: { application } });
  } catch (error) {
    next(error);
  }
};

const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['Draft', 'Submitted', 'Under Review', 'Additional Documents Required', 'Approved', 'Refused', 'Completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value.' });
    const application = await Application.findOne({ user: req.params.id });
    if (!application) return res.status(404).json({ success: false, message: 'Application not found.' });
    application.status = status;
    application.statusHistory.push({ status, changedBy: req.admin._id, note: note || '' });
    if (status === 'Approved' || status === 'Refused') { application.decisionAt = new Date(); application.decisionNote = note || ''; }
    await application.save();
    await User.findByIdAndUpdate(req.params.id, { applicationStatus: status });
    if (status === 'Additional Documents Required') {
      await createNotification(req.params.id, 'additional_documents_requested', { message: note ? `Additional documents requested: ${note}` : 'Additional documents are required for your application.' });
    } else if (status === 'Approved' || status === 'Refused') {
      await createNotification(req.params.id, 'application_decision', { message: `Your application has been ${status.toLowerCase()}.${note ? ` Note: ${note}` : ''}` });
    } else {
      await createNotification(req.params.id, 'status_update', { message: `Your application status has been updated to: ${status}.` });
    }
    const statusUser = await User.findById(req.params.id);
    if (statusUser) {
      await sendEmail({ to: statusUser.email, subject: 'Your application status has been updated', html: statusUpdateEmail({ fullName: statusUser.fullName, status, note }) });
    }
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'STATUS_UPDATED', targetType: 'Application', targetId: application._id, details: { status, note }, req });
    res.json({ success: true, message: 'Application status updated.', data: { application } });
  } catch (error) {
    next(error);
  }
};

const getDocuments = async (req, res, next) => {
  try {
    const { status, userId, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (userId) query.user = userId;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [documents, total] = await Promise.all([
      DocumentRecord.find(query).populate('user', 'fullName email ucinNumber gcReferenceNumber').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      DocumentRecord.countDocuments(query)
    ]);
    res.json({ success: true, data: { documents, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) } } });
  } catch (error) {
    next(error);
  }
};

const reviewDocument = async (req, res, next) => {
  try {
    const { decision, comment } = req.body;
    if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ success: false, message: 'Decision must be Approved or Rejected.' });
    const document = await DocumentRecord.findById(req.params.id);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found.' });
    document.status = decision;
    document.adminComment = comment || '';
    document.reviewedAt = new Date();
    document.reviewedBy = req.admin._id;
    await document.save();
    await User.updateOne({ _id: document.user, 'documents.storedFileName': document.storedFileName }, { $set: { 'documents.$.status': decision, 'documents.$.adminComment': comment || '', 'documents.$.reviewedAt': new Date(), 'documents.$.reviewedBy': req.admin._id } });
    await createNotification(document.user, decision === 'Approved' ? 'document_approved' : 'document_rejected', { message: comment ? `Document "${document.originalName}" was ${decision.toLowerCase()}. Comment: ${comment}` : `Document "${document.originalName}" was ${decision.toLowerCase()}.` });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'DOCUMENT_REVIEWED', targetType: 'DocumentRecord', targetId: document._id, details: { decision, comment }, req });
    res.json({ success: true, message: `Document ${decision.toLowerCase()}.`, data: { document } });
  } catch (error) {
    next(error);
  }
};

const requestNewDocument = async (req, res, next) => {
  try {
    const { documentType, note } = req.body;
    await createNotification(req.params.userId, 'additional_documents_requested', { title: 'New Document Requested', message: `Please upload a new ${documentType || 'document'}.${note ? ` Note: ${note}` : ''}` });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'DOCUMENT_REQUESTED', targetType: 'User', targetId: req.params.userId, details: { documentType, note }, req });
    res.json({ success: true, message: 'Document request sent to applicant.' });
  } catch (error) {
    next(error);
  }
};

const getPayments = async (req, res, next) => {
  try {
    const { status, paymentMethod, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [payments, total] = await Promise.all([
      Payment.find(query).populate('user', 'fullName email ucinNumber gcReferenceNumber').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      Payment.countDocuments(query)
    ]);
    res.json({ success: true, data: { payments, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) } } });
  } catch (error) {
    next(error);
  }
};

const markPaymentReceived = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.status === 'Completed') return res.status(400).json({ success: false, message: 'Payment is already marked as completed.' });
    payment.status = 'Completed';
    payment.receiptNumber = generateReceiptNumber();
    payment.markedReceivedBy = req.admin._id;
    payment.markedReceivedAt = new Date();
    await payment.save();
    if (payment.paymentRequest) {
      const linkedRequest = await PaymentRequest.findOne({ _id: payment.paymentRequest, status: 'Pending' });
      if (linkedRequest) { linkedRequest.status = 'Paid'; linkedRequest.payment = payment._id; linkedRequest.paidAt = new Date(); await linkedRequest.save(); }
    }
    await createNotification(payment.user, 'payment_received');
    const payingUser = await User.findById(payment.user);
    if (payingUser) {
      await sendEmail({ to: payingUser.email, subject: 'Payment received', html: paymentConfirmationEmail({ fullName: payingUser.fullName, amount: payment.amount, currency: payment.currency, receiptNumber: payment.receiptNumber }) });
    }
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'PAYMENT_MARKED_RECEIVED', targetType: 'Payment', targetId: payment._id, req });
    res.json({ success: true, message: 'Payment marked as received.', data: { payment } });
  } catch (error) {
    next(error);
  }
};

const sendNotification = async (req, res, next) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Title and message are required.' });
    const notification = await Notification.create({ user: req.params.userId, type: 'message', title, message });
    res.status(201).json({ success: true, message: 'Notification sent.', data: { notification } });
  } catch (error) {
    next(error);
  }
};

const getReportSummary = async (req, res, next) => {
  try {
    const totalApplicants = await User.countDocuments();
    const statusCounts = await Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const paymentStats = await Payment.aggregate([{ $match: { status: 'Completed' } }, { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
    const totalRevenue = await Payment.aggregate([{ $match: { status: 'Completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const documentStats = await DocumentRecord.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const recentRegistrations = await User.find().select('fullName email ucinNumber gcReferenceNumber applicationStatus createdAt').sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, data: { totalApplicants, statusCounts, paymentStats, totalRevenue: totalRevenue[0]?.total || 0, documentStats, recentRegistrations, generatedAt: new Date() } });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    const query = {};
    if (action) query.action = action;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [logs, total] = await Promise.all([AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)), AuditLog.countDocuments(query)]);
    res.json({ success: true, data: { logs, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / parseInt(limit, 10)) } } });
  } catch (error) {
    next(error);
  }
};

const getOfficers = async (req, res, next) => {
  try {
    const officers = await AdminUser.find({ isActive: true }).select('fullName email role');
    res.json({ success: true, data: { officers } });
  } catch (error) {
    next(error);
  }
};

const createPaymentRequest = async (req, res, next) => {
  try {
    const { title, description, amount, currency } = req.body;
    if (!title || !amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ success: false, message: 'A title and a valid amount are required.' });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Applicant not found.' });
    const paymentRequest = await PaymentRequest.create({ user: user._id, createdBy: req.admin._id, title, description: description || '', amount, currency: currency || 'CAD' });
    await createNotification(user._id, 'payment_request', { title: 'New Payment Requested', message: `A payment of ${paymentRequest.currency} ${paymentRequest.amount} has been requested: ${title}` });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'PAYMENT_REQUEST_CREATED', targetType: 'User', targetId: user._id, details: { title, amount, currency: paymentRequest.currency }, req });
    res.status(201).json({ success: true, message: 'Payment request sent to applicant.', data: { paymentRequest } });
  } catch (error) {
    next(error);
  }
};

const getPaymentRequestsForUser = async (req, res, next) => {
  try {
    const paymentRequests = await PaymentRequest.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: { paymentRequests } });
  } catch (error) {
    next(error);
  }
};

const cancelPaymentRequest = async (req, res, next) => {
  try {
    const paymentRequest = await PaymentRequest.findById(req.params.id);
    if (!paymentRequest) return res.status(404).json({ success: false, message: 'Payment request not found.' });
    if (paymentRequest.status !== 'Pending') return res.status(400).json({ success: false, message: 'Only pending payment requests can be cancelled.' });
    paymentRequest.status = 'Cancelled';
    paymentRequest.cancelledBy = req.admin._id;
    paymentRequest.cancelledAt = new Date();
    await paymentRequest.save();
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'PAYMENT_REQUEST_CANCELLED', targetType: 'PaymentRequest', targetId: paymentRequest._id, req });
    res.json({ success: true, message: 'Payment request cancelled.', data: { paymentRequest } });
  } catch (error) {
    next(error);
  }
};

const assignFee = async (req, res, next) => {
  try {
    const { applicationFee } = req.body;
    if (applicationFee === undefined || isNaN(applicationFee) || Number(applicationFee) < 0) return res.status(400).json({ success: false, message: 'A valid application fee is required.' });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Applicant not found.' });
    user.applicationFee = applicationFee;
    user.paymentStatus = Number(applicationFee) === 0 ? 'Not Set' : 'Pending';
    await user.save();
    await createNotification(user._id, 'payment_request', { title: 'Application Fee Assigned', message: `An application fee of CAD ${applicationFee} has been assigned to your ${user.programName || 'application'}.` });
    await sendEmail({ to: user.email, subject: 'Application fee assigned', html: feeAssignedEmail({ fullName: user.fullName, programName: user.programName || 'your application', applicationFee, currency: 'CAD' }) });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'FEE_ASSIGNED', targetType: 'User', targetId: user._id, details: { applicationFee }, req });
    res.json({ success: true, message: 'Application fee assigned.', data: { user: user.toSafeObject() } });
  } catch (error) {
    next(error);
  }
};

const adminResendVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Applicant not found.' });
    if (user.isEmailVerified) return res.status(400).json({ success: false, message: 'This applicant has already verified their email.' });
    const { generate6DigitCode } = require('../utils/generateIds');
    const { verificationCodeEmail } = require('../utils/emailTemplates');
    const verificationCode = generate6DigitCode();
    user.verificationCode = verificationCode;
    user.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.verificationAttempts = 0;
    await user.save();
    await sendEmail({ to: user.email, subject: 'Your new verification code', html: verificationCodeEmail({ fullName: user.fullName, code: verificationCode }) });
    await recordAuditLog({ actorType: 'AdminUser', actorId: req.admin._id, actorEmail: req.admin.email, action: 'VERIFICATION_CODE_RESENT', targetType: 'User', targetId: user._id, req });
    res.json({ success: true, message: 'A new verification code has been sent to the applicant.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getApplicants,
  getApplicantDetail,
  assignOfficer,
  updateApplicationStatus,
  getDocuments,
  reviewDocument,
  requestNewDocument,
  getPayments,
  markPaymentReceived,
  sendNotification,
  getReportSummary,
  getAuditLogs,
  getOfficers,
  createPaymentRequest,
  getPaymentRequestsForUser,
  cancelPaymentRequest,
  assignFee,
  adminResendVerification
};

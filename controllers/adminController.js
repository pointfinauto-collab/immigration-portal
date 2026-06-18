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

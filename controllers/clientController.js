const User = require('../models/User');
const Application = require('../models/Application');
const DocumentRecord = require('../models/Document');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { createNotification } = require('../utils/notifications');
const { recordAuditLog } = require('../utils/auditLogger');

/**
 * @route GET /api/client/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const application = await Application.findOne({ user: req.user._id });
    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
        application
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/client/profile
 * @desc  Update editable profile fields (not email/passport number which require admin review)
 */
const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['phoneNumber', 'countryOfResidence'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true
    });

    await recordAuditLog({
      actorType: 'User',
      actorId: user._id,
      actorEmail: user.email,
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetId: user._id,
      details: updates,
      req
    });

    res.json({ success: true, message: 'Profile updated successfully.', data: { user: user.toSafeObject() } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/client/dashboard
 * @desc  Aggregated dashboard summary: application status, payments, notifications
 */
const getDashboardSummary = async (req, res, next) => {
  try {
    const application = await Application.findOne({ user: req.user._id });
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 });
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10);
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
        application,
        payments,
        notifications,
        unreadNotificationCount: unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/client/documents
 * @desc  Upload additional documents
 */
const uploadDocuments = async (req, res, next) => {
  try {
    const files = req.files || {};
    const fileList = files.additionalDocument || [];

    if (fileList.length === 0) {
      return res.status(400).json({ success: false, message: 'No document file was provided.' });
    }

    const createdDocs = [];

    for (const file of fileList) {
      const docData = {
        documentType: 'additionalDocument',
        originalName: file.originalname,
        storedFileName: file.filename,
        filePath: file.path.replace(/\\/g, '/'),
        mimeType: file.mimetype,
        size: file.size
      };

      req.user.documents.push(docData);

      // eslint-disable-next-line no-await-in-loop
      const record = await DocumentRecord.create({ user: req.user._id, ...docData });
      createdDocs.push(record);
    }

    await req.user.save();
    await createNotification(req.user._id, 'document_uploaded');

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_UPLOADED',
      targetType: 'DocumentRecord',
      details: { count: createdDocs.length },
      req
    });

    res.status(201).json({ success: true, message: 'Document(s) uploaded successfully.', data: { documents: createdDocs } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/client/documents/:documentId/replace
 * @desc  Replace an existing document with a new upload
 */
const replaceDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const files = req.files || {};
    const newFile = (files.additionalDocument && files.additionalDocument[0]) || null;

    if (!newFile) {
      return res.status(400).json({ success: false, message: 'A replacement file is required.' });
    }

    const oldRecord = await DocumentRecord.findOne({ _id: documentId, user: req.user._id });
    if (!oldRecord) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    oldRecord.status = 'Replaced';
    await oldRecord.save();

    const newRecord = await DocumentRecord.create({
      user: req.user._id,
      documentType: oldRecord.documentType,
      originalName: newFile.originalname,
      storedFileName: newFile.filename,
      filePath: newFile.path.replace(/\\/g, '/'),
      mimeType: newFile.mimetype,
      size: newFile.size,
      status: 'Pending'
    });

    oldRecord.replacedBy = newRecord._id;
    await oldRecord.save();

    // Update embedded copy on user
    req.user.documents.push({
      documentType: newRecord.documentType,
      originalName: newRecord.originalName,
      storedFileName: newRecord.storedFileName,
      filePath: newRecord.filePath,
      mimeType: newRecord.mimeType,
      size: newRecord.size
    });
    await req.user.save();

    await createNotification(req.user._id, 'document_uploaded', {
      title: 'Document Replaced',
      message: 'Your document has been replaced and is pending review.'
    });

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_REPLACED',
      targetType: 'DocumentRecord',
      targetId: newRecord._id,
      details: { oldDocumentId: oldRecord._id },
      req
    });

    res.json({ success: true, message: 'Document replaced successfully.', data: { document: newRecord } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/client/documents
 * @desc  View upload history
 */
const getDocuments = async (req, res, next) => {
  try {
    const documents = await DocumentRecord.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { documents } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/client/application
 * @desc  Track application status
 */
const getApplicationStatus = async (req, res, next) => {
  try {
    const application = await Application.findOne({ user: req.user._id }).populate(
      'assignedOfficer',
      'fullName email role'
    );
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application record not found.' });
    }
    res.json({ success: true, data: { application } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/client/application/submit
 * @desc  Submit the application (Draft -> Submitted)
 */
const submitApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ user: req.user._id });
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application record not found.' });
    }

    if (application.status !== 'Draft' && application.status !== 'Additional Documents Required') {
      return res.status(400).json({ success: false, message: `Application cannot be submitted from status: ${application.status}` });
    }

    application.status = 'Submitted';
    application.submittedAt = new Date();
    application.statusHistory.push({ status: 'Submitted', note: 'Submitted by applicant.' });
    await application.save();

    req.user.applicationStatus = 'Submitted';
    await req.user.save();

    await createNotification(req.user._id, 'status_update', {
      title: 'Application Submitted',
      message: 'Your application has been submitted successfully and is awaiting review.'
    });

    await recordAuditLog({
      actorType: 'User',
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'APPLICATION_SUBMITTED',
      targetType: 'Application',
      targetId: application._id,
      req
    });

    res.json({ success: true, message: 'Application submitted successfully.', data: { application } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/client/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/client/notifications/:id/read
 */
const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    res.json({ success: true, data: { notification } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/client/notifications/read-all
 */
const markAllNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/client/application-summary
 * @desc  Returns a JSON summary suitable for client-side PDF generation
 */
const getApplicationSummary = async (req, res, next) => {
  try {
    const application = await Application.findOne({ user: req.user._id });
    const documents = await DocumentRecord.find({ user: req.user._id }).sort({ createdAt: -1 });
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
        application,
        documents,
        payments,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getDashboardSummary,
  uploadDocuments,
  replaceDocument,
  getDocuments,
  getApplicationStatus,
  submitApplication,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getApplicationSummary
};

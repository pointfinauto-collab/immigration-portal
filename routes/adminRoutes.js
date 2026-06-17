const express = require('express');
const router = express.Router();

const {
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
  cancelPaymentRequest
} = require('../controllers/adminController');

const { sendMessageAsAdmin, getClientMessages } = require('../controllers/messageController');

const { protect, requireAdmin } = require('../middleware/auth');
const { validate, messageValidation } = require('../middleware/validators');

// All routes below require a valid admin token
router.use(protect(), requireAdmin);

// Applicants
router.get('/applicants', getApplicants);
router.get('/applicants/:id', getApplicantDetail);
router.put('/applicants/:id/assign-officer', assignOfficer);
router.put('/applicants/:id/status', updateApplicationStatus);

// Documents
router.get('/documents', getDocuments);
router.put('/documents/:id/review', reviewDocument);
router.post('/documents/:userId/request', requestNewDocument);

// Payments
router.get('/payments', getPayments);
router.put('/payments/:id/mark-received', markPaymentReceived);

// Payment Requests (custom fees set by admin for a specific client)
router.post('/payment-requests/:userId', createPaymentRequest);
router.get('/payment-requests/:userId', getPaymentRequestsForUser);
router.put('/payment-requests/:id/cancel', cancelPaymentRequest);

// Notifications
router.post('/notifications/:userId', sendNotification);

// Messages
router.get('/messages/:userId', getClientMessages);
router.post('/messages/:userId', messageValidation, validate, sendMessageAsAdmin);

// Reports & officers
router.get('/reports/summary', getReportSummary);
router.get('/audit-logs', getAuditLogs);
router.get('/officers', getOfficers);

module.exports = router;

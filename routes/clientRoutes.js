const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/clientController');

const { protect, requireClient } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const upload = require('../config/upload');

// All routes below require a valid client token
router.use(protect(), requireClient);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.get('/dashboard', getDashboardSummary);

router.get('/documents', getDocuments);
router.post(
  '/documents',
  uploadLimiter,
  upload.fields([{ name: 'additionalDocument', maxCount: 5 }]),
  uploadDocuments
);
router.put(
  '/documents/:documentId/replace',
  uploadLimiter,
  upload.fields([{ name: 'additionalDocument', maxCount: 1 }]),
  replaceDocument
);

router.get('/application', getApplicationStatus);
router.post('/application/submit', submitApplication);
router.get('/application-summary', getApplicationSummary);

router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);
router.put('/notifications/read-all', markAllNotificationsRead);

module.exports = router;

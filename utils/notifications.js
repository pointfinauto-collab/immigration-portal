const Notification = require('../models/Notification');

const NOTIFICATION_TEMPLATES = {
  registration_successful: {
    title: 'Registration Successful',
    message: 'Welcome to the Canadian Immigration Client Portal. Your account has been created successfully.'
  },
  uci_generated: {
    title: 'Client Identifiers Generated',
    message: 'Your Unique Client Identifier (UCI) and GC Reference Number have been generated and are available in your dashboard.'
  },
  document_uploaded: {
    title: 'Document Uploaded',
    message: 'Your document has been uploaded successfully and is pending review.'
  },
  document_approved: {
    title: 'Document Approved',
    message: 'One of your submitted documents has been reviewed and approved.'
  },
  document_rejected: {
    title: 'Document Rejected',
    message: 'One of your submitted documents has been rejected. Please review the comments and re-upload.'
  },
  additional_documents_requested: {
    title: 'Additional Documents Required',
    message: 'Our team has requested additional documents for your application. Please check the document section.'
  },
  payment_received: {
    title: 'Payment Received',
    message: 'Your payment has been received and recorded. A receipt is now available for download.'
  },
  application_decision: {
    title: 'Application Decision Issued',
    message: 'A decision has been issued on your application. Please log in to view the details.'
  },
  status_update: {
    title: 'Application Status Updated',
    message: 'The status of your application has been updated.'
  },
  message: {
    title: 'New Message',
    message: 'You have received a new message from support.'
  }
};

/**
 * Creates and stores a notification for a user. Optionally overrides
 * the default title/message text.
 */
const createNotification = async (userId, type, overrides = {}) => {
  const template = NOTIFICATION_TEMPLATES[type] || {
    title: 'Notification',
    message: 'You have a new notification.'
  };

  try {
    const notification = await Notification.create({
      user: userId,
      type,
      title: overrides.title || template.title,
      message: overrides.message || template.message,
      link: overrides.link
    });
    return notification;
  } catch (err) {
    console.error('Notification creation error:', err.message);
    return null;
  }
};

module.exports = { createNotification, NOTIFICATION_TEMPLATES };

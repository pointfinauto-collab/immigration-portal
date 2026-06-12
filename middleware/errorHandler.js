const multer = require('multer');

/**
 * Centralized error handling middleware.
 * Catches Mongoose, Multer, JWT, and generic errors and returns
 * consistent JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  console.error(err);

  // Multer file upload errors
  if (err instanceof multer.MulterError) {
    let message = 'File upload error.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 5}MB.`;
    }
    return res.status(400).json({ success: false, message });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      message: `An account or record with this ${field} already exists.`
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid identifier provided.' });
  }

  // CSRF errors
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token.' });
  }

  // Custom file validation error from upload config
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error.';

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Catches requests to undefined routes.
 */
const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

module.exports = { errorHandler, notFound };

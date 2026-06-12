const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const DocumentRecord = require('../models/Document');
const { protect } = require('../middleware/auth');

/**
 * @route GET /api/files/:documentId
 * @desc  Securely serve an uploaded document.
 *        Clients may only access their own documents; admins may access any.
 */
router.get('/:documentId', protect(), async (req, res, next) => {
  try {
    const document = await DocumentRecord.findById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (req.userType === 'client' && document.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You do not have permission to access this document.' });
    }

    const absolutePath = path.resolve(document.filePath);

    // Ensure the resolved path is within the uploads directory (prevent path traversal)
    const uploadsRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads');
    if (!absolutePath.startsWith(uploadsRoot)) {
      return res.status(400).json({ success: false, message: 'Invalid file path.' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server.' });
    }

    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

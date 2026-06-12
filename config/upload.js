const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const MAX_SIZE = (parseFloat(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

// Ensure upload directories exist
const dirs = [
  UPLOAD_DIR,
  path.join(UPLOAD_DIR, 'passports'),
  path.join(UPLOAD_DIR, 'national-ids'),
  path.join(UPLOAD_DIR, 'photos'),
  path.join(UPLOAD_DIR, 'supporting-documents'),
  path.join(UPLOAD_DIR, 'additional-documents')
];
dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png'
};

const folderMap = {
  passport: 'passports',
  nationalId: 'national-ids',
  passportPhoto: 'photos',
  supportingDocuments: 'supporting-documents',
  additionalDocument: 'additional-documents'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = folderMap[file.fieldname] || 'additional-documents';
    cb(null, path.join(UPLOAD_DIR, folder));
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_TYPES[file.mimetype] || path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

module.exports = upload;

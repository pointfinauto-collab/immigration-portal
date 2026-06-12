const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');

/**
 * Verifies a JWT access token from the Authorization header.
 * Attaches `req.user` (for clients) or `req.admin` (for admin users).
 */
const protect = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      let token;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized. No token provided.' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.userType === 'client') {
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
          return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
        }
        req.user = user;
        req.userType = 'client';
      } else if (decoded.userType === 'admin') {
        const admin = await AdminUser.findById(decoded.id);
        if (!admin || !admin.isActive) {
          return res.status(401).json({ success: false, message: 'Admin account not found or deactivated.' });
        }
        req.admin = admin;
        req.userType = 'admin';

        if (allowedRoles.length > 0 && !allowedRoles.includes(admin.role)) {
          return res.status(403).json({ success: false, message: 'Insufficient permissions for this action.' });
        }
      } else {
        return res.status(401).json({ success: false, message: 'Invalid token type.' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Not authorized. Invalid or expired token.' });
    }
  };
};

/**
 * Middleware that requires the request to be from a client (registered applicant).
 */
const requireClient = (req, res, next) => {
  if (req.userType !== 'client') {
    return res.status(403).json({ success: false, message: 'This endpoint is for client accounts only.' });
  }
  next();
};

/**
 * Middleware that requires the request to be from an admin/officer.
 */
const requireAdmin = (req, res, next) => {
  if (req.userType !== 'admin') {
    return res.status(403).json({ success: false, message: 'This endpoint is for admin accounts only.' });
  }
  next();
};

module.exports = { protect, requireClient, requireAdmin };

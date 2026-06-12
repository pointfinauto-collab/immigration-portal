const AuditLog = require('../models/AuditLog');

/**
 * Records an entry in the audit log. Failures are logged but never thrown,
 * so audit logging never breaks the primary request flow.
 */
const recordAuditLog = async ({
  actorType,
  actorId,
  actorEmail,
  action,
  targetType,
  targetId,
  details,
  req
}) => {
  try {
    await AuditLog.create({
      actorType,
      actorId,
      actorEmail,
      action,
      targetType,
      targetId,
      details,
      ipAddress: req ? req.ip : undefined,
      userAgent: req ? req.headers['user-agent'] : undefined
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { recordAuditLog };

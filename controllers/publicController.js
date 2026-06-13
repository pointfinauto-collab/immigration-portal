const User = require('../models/User');
const Application = require('../models/Application');

/**
 * @route GET /api/public/status?ref=<GC Reference Number or UCI Number>
 * @desc  Public lookup of application status by GC Reference Number or UCI Number.
 *        Returns only minimal, non-sensitive information.
 */
const checkStatus = async (req, res, next) => {
  try {
    const { ref } = req.query;

    if (!ref || typeof ref !== 'string' || ref.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid GC Reference Number or UCI Number.'
      });
    }

    const value = ref.trim().toUpperCase();

    const user = await User.findOne({
      $or: [{ gcReferenceNumber: value }, { ucinNumber: value }]
    }).select('fullName gcReferenceNumber ucinNumber applicationStatus createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No application found for the provided reference number. Please check the number and try again.'
      });
    }

    const application = await Application.findOne({ user: user._id }).select('status statusHistory submittedAt decisionAt');

    res.json({
      success: true,
      data: {
        fullName: maskName(user.fullName),
        gcReferenceNumber: user.gcReferenceNumber,
        ucinNumber: user.ucinNumber,
        status: application ? application.status : user.applicationStatus,
        submittedAt: application ? application.submittedAt : null,
        decisionAt: application ? application.decisionAt : null,
        registeredAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Masks a full name for privacy on the public status page,
 * e.g. "John Smith" -> "John S."
 */
function maskName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

module.exports = { checkStatus };

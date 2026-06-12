const { validationResult, body } = require('express-validator');

/**
 * Runs after express-validator chains; returns 400 with all
 * validation errors if any failed.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Validation chains for client registration
const registerValidation = [
  body('fullName').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 150 }),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required.').isISO8601().withMessage('Invalid date format.'),
  body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other.'),
  body('nationality').trim().notEmpty().withMessage('Nationality is required.'),
  body('passportNumber').trim().notEmpty().withMessage('Passport number is required.').isLength({ max: 50 }),
  body('countryOfResidence').trim().notEmpty().withMessage('Country of residence is required.'),
  body('phoneNumber').trim().notEmpty().withMessage('Phone number is required.').isLength({ max: 30 }),
  body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.')
    .matches(/\d/)
    .withMessage('Password must contain at least one number.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match.');
    }
    return true;
  })
];

// Validation chains for login
const loginValidation = [
  body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.')
];

// Validation for payment initiation
const paymentValidation = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('paymentMethod')
    .isIn(['Visa', 'Mastercard', 'American Express', 'Bank Transfer', 'Representative Payment'])
    .withMessage('Invalid payment method.')
];

// Validation for messages
const messageValidation = [
  body('subject').trim().notEmpty().withMessage('Subject is required.').isLength({ max: 200 }),
  body('body').trim().notEmpty().withMessage('Message body is required.').isLength({ max: 5000 })
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  paymentValidation,
  messageValidation
};

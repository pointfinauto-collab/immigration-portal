const paymentValidation = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('paymentMethod')
    .isIn(['Visa', 'Mastercard', 'American Express', 'Bank Transfer', 'Representative Payment'])
    .withMessage('Invalid payment method.')
];

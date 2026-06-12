const crypto = require('crypto');
const User = require('../models/User');

/**
 * Generates a random N-digit numeric string.
 */
const randomDigits = (length) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += crypto.randomInt(0, 10);
  }
  return result;
};

/**
 * Generates a unique GC Reference Number in the format GC-YYYY-XXXXXX
 * and a unique UCI Number in the format UCI-XXXX-XXXX.
 * Ensures uniqueness by checking against the database and retrying on collision.
 */
const generateClientIdentifiers = async () => {
  const year = new Date().getFullYear();
  let gcReferenceNumber;
  let ucinNumber;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    gcReferenceNumber = `GC-${year}-${randomDigits(6)}`;
    ucinNumber = `UCI-${randomDigits(4)}-${randomDigits(4)}`;

    // eslint-disable-next-line no-await-in-loop
    const existing = await User.findOne({
      $or: [{ gcReferenceNumber }, { ucinNumber }]
    });

    if (!existing) {
      isUnique = true;
    }
    attempts += 1;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique client identifiers after multiple attempts');
  }

  return { gcReferenceNumber, ucinNumber };
};

/**
 * Generates a unique transaction ID for payments.
 */
const generateTransactionId = () => {
  return `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

/**
 * Generates a unique receipt number.
 */
const generateReceiptNumber = () => {
  const year = new Date().getFullYear();
  return `RCT-${year}-${randomDigits(8)}`;
};

/**
 * Generates a unique payment reference number (for representative payments).
 */
const generatePaymentReference = () => {
  const year = new Date().getFullYear();
  return `PAY-REF-${year}-${randomDigits(6)}`;
};

module.exports = {
  generateClientIdentifiers,
  generateTransactionId,
  generateReceiptNumber,
  generatePaymentReference
};

/**
 * Paystack API helper (Transactions).
 * Uses PAYSTACK_SECRET_KEY from environment.
 * Works automatically with test (sk_test_...) or live (sk_live_...) keys.
 */

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Paystack is not configured on the server (missing PAYSTACK_SECRET_KEY).');
  }
  return secretKey;
}

/**
 * Initializes a Paystack transaction.
 * @param {Object} opts
 * @param {number} opts.amount - amount in major currency units (e.g. KES, NGN, USD)
 * @param {string} opts.currency - ISO currency code, e.g. 'KES', 'NGN', 'USD', 'ZAR', 'GHS'
 * @param {string} opts.email - payer's email (required by Paystack)
 * @param {string} opts.callbackUrl - URL Paystack redirects back to after payment
 * @param {Object} opts.metadata - arbitrary metadata to attach
 */
async function initializeTransaction({ amount, currency, email, callbackUrl, metadata }) {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Math.round(Number(amount) * 100), // Paystack uses the smallest currency unit (e.g. kobo, cents)
      currency,
      email,
      callback_url: callbackUrl,
      metadata
    })
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(`Failed to initialize Paystack transaction: ${data.message || 'Unknown error'}`);
  }

  return data.data; // { authorization_url, access_code, reference }
}

/**
 * Verifies a Paystack transaction by reference.
 * Returns the transaction data, including status ('success', 'failed', 'abandoned').
 */
async function verifyTransaction(reference) {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`
    }
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(`Failed to verify Paystack transaction: ${data.message || 'Unknown error'}`);
  }

  return data.data; // { status, amount, currency, reference, customer, ... }
}

module.exports = { initializeTransaction, verifyTransaction };

/**
 * PayPal REST API helper (Orders v2).
 * Uses PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_MODE from environment.
 * PAYPAL_MODE = 'sandbox' | 'live' (defaults to 'sandbox')
 */

const PAYPAL_MODE = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';

const PAYPAL_BASE_URL =
  PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

/**
 * Get an OAuth2 access token from PayPal using client credentials.
 */
async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured on the server.');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to authenticate with PayPal: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create a PayPal order for the given amount (CAD).
 * Returns the PayPal order object (includes id used by the client-side buttons).
 */
async function createOrder(amount, currency = 'CAD') {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2)
          },
          description: 'Immigration Client Portal - Application Fee'
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create PayPal order: ${text}`);
  }

  return response.json();
}

/**
 * Capture a previously approved PayPal order.
 * Returns the capture result, including status (e.g. 'COMPLETED') and payer info.
 */
async function captureOrder(orderId) {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to capture PayPal order: ${text}`);
  }

  return response.json();
}

module.exports = { createOrder, captureOrder, PAYPAL_MODE };

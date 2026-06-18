/**
 * Email sending utility using Nodemailer.
 * Configured for Gmail (canadaimgov@gmail.com) via an App Password, but works
 * with any SMTP provider if SMTP_HOST/PORT/USER/PASS are set instead.
 *
 * Required environment variables (Gmail):
 *   EMAIL_USER=canadaimgov@gmail.com
 *   EMAIL_PASS=<16-character Gmail App Password>
 *   EMAIL_FROM="Immigration Client Portal <canadaimgov@gmail.com>"
 *
 * If EMAIL_USER/EMAIL_PASS are not set, falls back to generic SMTP_* vars.
 * If neither is configured, email sending is skipped (logged only) so the
 * rest of the app continues to function in development.
 */

const nodemailer = require('nodemailer');

let transporter = null;
let transporterChecked = false;

function getTransporter() {
  if (transporterChecked) return transporter;
  transporterChecked = true;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    transporter = null;
  }

  return transporter;
}

/**
 * Sends an email. If no transporter is configured, logs to console instead
 * of throwing, so registration/login flows are never blocked by missing
 * email configuration during development.
 */
async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@immigration-portal.example';

  if (!t) {
    console.log(`[sendEmail] No email transporter configured. Would have sent to ${to}: "${subject}"`);
    return { skipped: true };
  }

  try {
    const info = await t.sendMail({ from, to, subject, html, text });
    return { skipped: false, info };
  } catch (error) {
    console.error('[sendEmail] Failed to send email:', error.message);
    // Do not throw - email failures should not block registration/login flows.
    return { skipped: true, error: error.message };
  }
}

module.exports = { sendEmail };

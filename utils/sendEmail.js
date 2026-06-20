/**
 * Email sending utility using Nodemailer.
 * Configured for Gmail (canadaimgov@gmail.com) via an App Password.
 *
 * Required environment variables:
 *   EMAIL_USER=canadaimgov@gmail.com
 *   EMAIL_PASS=<16-character Gmail App Password, no spaces>
 *   EMAIL_FROM="Immigration Client Portal <canadaimgov@gmail.com>"
 *
 * NOTE: Transporter is created fresh on every call (no caching) so that
 * env var changes take effect immediately without a server restart.
 */

const nodemailer = require('nodemailer');

function getTransporter() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return null;
}

async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@immigration-portal.example';

  if (!t) {
    console.log(`[sendEmail] No transporter configured (EMAIL_USER/EMAIL_PASS missing). Skipping email to ${to}: "${subject}"`);
    return { skipped: true };
  }

  try {
    const info = await t.sendMail({ from, to, subject, html, text });
    console.log(`[sendEmail] Sent to ${to}: "${subject}" — messageId: ${info.messageId}`);
    return { skipped: false, info };
  } catch (error) {
    console.error(`[sendEmail] FAILED to send to ${to}: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

module.exports = { sendEmail };

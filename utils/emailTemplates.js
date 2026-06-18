/**
 * HTML email templates for the Immigration Client Portal.
 * Kept simple and inline-styled for maximum email client compatibility.
 */

const wrapper = (innerHtml) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
    <div style="text-align:center; margin-bottom: 24px;">
      <span style="font-size: 1.25rem; font-weight: 700; color: #1F4E79;">Immigration Client Portal</span>
    </div>
    ${innerHtml}
    <hr style="margin-top: 32px; border: none; border-top: 1px solid #e0e0e0;" />
    <p style="font-size: 0.75rem; color: #888; text-align:center; margin-top: 16px;">
      This is a demonstration application and is not affiliated with the Government of Canada.<br/>
      If you did not request this, you can safely ignore this email.
    </p>
  </div>
`;

const codeBox = (code) => `
  <div style="text-align:center; margin: 24px 0;">
    <span style="display:inline-block; font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; background:#f0f4f8; color:#1F4E79; padding: 12px 24px; border-radius: 8px;">
      ${code}
    </span>
  </div>
`;

const registrationConfirmationEmail = ({ fullName, gcReferenceNumber, ucinNumber }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Welcome, ${fullName}!</h2>
    <p>Thank you for registering with the Immigration Client Portal. Your account has been created successfully.</p>
    <p><strong>GC Reference Number:</strong> ${gcReferenceNumber}<br/>
       <strong>UCI Number:</strong> ${ucinNumber}</p>
    <p>Before you can sign in, please verify your email address using the verification code we've sent in a separate email.</p>
  `);

const verificationCodeEmail = ({ fullName, code }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Verify your email address</h2>
    <p>Hi ${fullName},</p>
    <p>Please use the following 6-digit code to verify your email address. This code will expire in <strong>10 minutes</strong>.</p>
    ${codeBox(code)}
    <p>If you did not create an account, please ignore this email.</p>
  `);

const passwordResetCodeEmail = ({ fullName, code }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Password reset request</h2>
    <p>Hi ${fullName},</p>
    <p>We received a request to reset your password. Use the following 6-digit code to continue. This code will expire in <strong>10 minutes</strong>.</p>
    ${codeBox(code)}
    <p>If you did not request a password reset, please ignore this email or contact support.</p>
  `);

const feeAssignedEmail = ({ fullName, programName, applicationFee, currency }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Application fee assigned</h2>
    <p>Hi ${fullName},</p>
    <p>An application fee has been assigned to your file for <strong>${programName}</strong>:</p>
    <p style="font-size:1.5rem; font-weight:700; color:#1F4E79; text-align:center; margin: 16px 0;">
      ${currency} ${applicationFee}
    </p>
    <p>Please log in to your dashboard to view payment options.</p>
  `);

const paymentConfirmationEmail = ({ fullName, amount, currency, receiptNumber }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Payment received</h2>
    <p>Hi ${fullName},</p>
    <p>We've successfully received your payment of <strong>${currency} ${amount}</strong>.</p>
    <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
    <p>You can view and download your receipt from your dashboard at any time.</p>
  `);

const statusUpdateEmail = ({ fullName, status, note }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">Application status update</h2>
    <p>Hi ${fullName},</p>
    <p>Your application status has been updated to:</p>
    <p style="font-size:1.25rem; font-weight:700; color:#1F4E79; text-align:center; margin: 16px 0;">${status}</p>
    ${note ? `<p><strong>Note from our team:</strong> ${note}</p>` : ''}
    <p>Log in to your dashboard for full details.</p>
  `);

const adminMessageEmail = ({ fullName, subject, body }) =>
  wrapper(`
    <h2 style="color:#1F4E79;">New message from our team</h2>
    <p>Hi ${fullName},</p>
    <p><strong>${subject}</strong></p>
    <p>${body}</p>
    <p>Log in to your dashboard to reply.</p>
  `);

module.exports = {
  registrationConfirmationEmail,
  verificationCodeEmail,
  passwordResetCodeEmail,
  feeAssignedEmail,
  paymentConfirmationEmail,
  statusUpdateEmail,
  adminMessageEmail
};

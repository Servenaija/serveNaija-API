// services/email.service.js

const { mailtrapClient, sender } = require('./mailtrap');

const sendEmail = async (to, subject, html) => {
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  const recipient = [{ email: to }];

  if (!process.env.MAILTRAP_TOKEN) {
    // Keep backend operational in local/dev even when Mailtrap is not configured.
    return { skipped: true };
  }

  const response = await mailtrapClient.send({
    from: sender,
    to: recipient,
    subject,
    html,
    category: subject,
  });

  return response;
};

const sendVerificationCodeEmail = async (to, options = {}) => {
  const subject = 'ServeNaija - Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2>ServeNaija Password Reset</h2>
      <p>Hello ${options.name || 'there'},</p>
      <p>Use this verification code to reset your password:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 6px;">${options.verificationCode || ''}</p>
      <p>This code expires in ${options.expiryMinutes || 20} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
};

const sendMagicLinkEmail = async (to, options = {}) => {
  const subject = 'ServeNaija - Magic Link Login';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2>ServeNaija Magic Link</h2>
      <p>Hello ${options.name || 'there'},</p>
      <p>Click the link below to log in to your account:</p>
      <p style="margin: 20px 0;">
        <a href="${options.magicLink}" style="background-color: #165B43; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Log In to ServeNaija
        </a>
      </p>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px;">
        ${options.magicLink}
      </p>
      <p>This link expires in ${options.expiryMinutes || 15} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
};

const sendPasswordResetSuccessEmail = async (to, options = {}) => {
  const subject = 'ServeNaija - Password Reset Successful';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2>Password Updated</h2>
      <p>Hello ${options.name || 'there'}, your password was changed successfully.</p>
      <p>If you did not perform this change, please contact support immediately.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
};



module.exports = {
  sendEmail,
  sendVerificationCodeEmail,
  sendMagicLinkEmail,
  sendPasswordResetSuccessEmail,
 
};
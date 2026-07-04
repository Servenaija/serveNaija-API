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

const sendPasswordResetSuccessEmail = async (to, options = {}) => {
  const subject = 'ServeNaija - Password Reset Successful';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2>Password updated</h2>
      <p>Hello ${options.name || 'there'}, your password was changed successfully.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
};

const sendRiderApprovalEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Application Approved',
    `<p>Hello ${options.name || 'there'}, your application has been approved.</p>`
  );

const sendRiderDenialEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Application Update',
    `<p>Hello ${options.name || 'there'}, your application was not approved.</p>`
  );

const sendRiderUnderReviewEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Application Under Review',
    `<p>Hello ${options.name || 'there'}, your application is under review.</p>`
  );

const sendTransactionPinEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Verify PIN',
    `<p>Hello ${options.name || 'there'}, your verification code is ${options.verificationCode || ''}.</p>`
  );

const sendWithdrawalPendingEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Withdrawal Pending',
    `<p>Hello ${options.name || 'there'}, your withdrawal request is pending.</p>`
  );

const sendWithdrawalApprovedEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Withdrawal Approved',
    `<p>Hello ${options.name || 'there'}, your withdrawal request has been approved.</p>`
  );

const sendWithdrawalRejectedEmail = async (to, options = {}) =>
  sendEmail(
    to,
    'ServeNaija - Withdrawal Rejected',
    `<p>Hello ${options.name || 'there'}, your withdrawal request was rejected.</p>`
  );

module.exports = {
  sendEmail,
  sendVerificationCodeEmail,
  sendPasswordResetSuccessEmail,
  sendRiderApprovalEmail,
  sendRiderDenialEmail,
  sendRiderUnderReviewEmail,
  sendTransactionPinEmail,
  sendWithdrawalPendingEmail,
  sendWithdrawalApprovedEmail,
  sendWithdrawalRejectedEmail,
};

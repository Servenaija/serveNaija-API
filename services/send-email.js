// utils/send-email.js
const { mailtrapClient, sender } = require('./mailtrap.js');

const sendEmails = async (to, subject, html) => {
  if (!to) throw new Error("Recipient email is required.");
  const recipient = [{ email: to }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject,
      html,
      category: subject,
    });
    console.log(`Email sent successfully to ${to}`, response);
    return { success: true, response };
  } catch (error) {
    console.error(`Error sending email to ${to}`, error);
    throw new Error(`Error sending email: ${error}`);
  }
};

module.exports = { sendEmails };
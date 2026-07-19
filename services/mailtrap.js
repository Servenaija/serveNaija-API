const { MailtrapClient } = require('mailtrap');

const mailtrapClient = new MailtrapClient({
  token: process.env.MAILTRAP_TOKEN || '',
});

const sender = {
  email: process.env.EMAIL_FROM || 'noreply@servenaija.com',
  name: 'ServeNaija',
};

module.exports = {
  mailtrapClient,
  sender,
};

/**
 * Paystack Payment Service
 * Handles wallet funding verification, transfer initiation, and webhook event validation.
 */

const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Verify a Paystack transaction by reference.
 * @returns {{ status, amount, email, reference, channel, currency, metadata }}
 */
async function verifyTransaction(reference) {
  const { data } = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!data.status) {
    throw new Error(data.message || 'Paystack verification failed.');
  }
  const tx = data.data;
  return {
    status: tx.status, // 'success' | 'failed'
    amount: tx.amount / 100, // Paystack returns kobo
    email: tx.customer?.email,
    reference: tx.reference,
    channel: tx.channel,
    currency: tx.currency,
    metadata: tx.metadata,
    paidAt: tx.paid_at,
  };
}

/**
 * Initiate a transfer to a bank account via Paystack Transfers.
 * Requires that the Paystack account has transfers enabled.
 */
async function initiateTransfer({ amount, bankCode, accountNumber, accountName, reason, reference }) {
  // Step 1: Create transfer recipient
  const recipientRes = await paystackClient.post('/transferrecipient', {
    type: 'nuban',
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });

  if (!recipientRes.data.status) {
    throw new Error(recipientRes.data.message || 'Failed to create transfer recipient.');
  }

  const recipientCode = recipientRes.data.data.recipient_code;

  // Step 2: Initiate transfer
  const transferRes = await paystackClient.post('/transfer', {
    source: 'balance',
    amount: amount * 100, // convert to kobo
    recipient: recipientCode,
    reason,
    reference,
  });

  if (!transferRes.data.status) {
    throw new Error(transferRes.data.message || 'Failed to initiate transfer.');
  }

  return transferRes.data.data;
}

/**
 * Resolve a bank account number (verify account name before withdrawal).
 */
async function resolveBankAccount(accountNumber, bankCode) {
  const { data } = await paystackClient.get(
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );
  if (!data.status) {
    throw new Error(data.message || 'Could not resolve bank account.');
  }
  return { accountName: data.data.account_name, accountNumber: data.data.account_number };
}

/**
 * Get list of supported banks from Paystack.
 */
async function getBankList() {
  const { data } = await paystackClient.get('/bank?country=nigeria&perPage=100');
  return data.data || [];
}

/**
 * Validate Paystack webhook signature.
 * @param {string} rawBody  — raw request body as string
 * @param {string} signature  — value of X-Paystack-Signature header
 * @returns {boolean}
 */
function validateWebhookSignature(rawBody, signature) {
  if (!PAYSTACK_SECRET) return false;
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  return hash === signature;
}

module.exports = {
  verifyTransaction,
  initiateTransfer,
  resolveBankAccount,
  getBankList,
  validateWebhookSignature,
};

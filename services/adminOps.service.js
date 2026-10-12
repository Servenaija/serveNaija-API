/**
 * adminOps.service.js — isolated helpers for the separate /admin-ops route.
 * Does NOT modify services/payment.service.js.
 */
const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

function paystackHeaders() {
  return { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' };
}

/**
 * Live Paystack ledger balance. Returns { available, raw }.
 * available = sum of NGN balances (kobo -> naira).
 */
async function getPaystackAvailableBalance() {
  if (!PAYSTACK_SECRET) {
    return { available: 0, raw: [], unavailable: true };
  }
  try {
    const { data } = await axios.get(`${PAYSTACK_BASE}/balance`, {
      headers: paystackHeaders(),
      timeout: 15000,
    });
    const balances = data?.data || [];
    const ngn = balances.filter((b) => (b.currency || 'NGN') === 'NGN');
    const available = ngn.reduce((sum, b) => sum + (Number(b.balance) || 0) / 100, 0);
    return { available, raw: balances, unavailable: false };
  } catch (err) {
    return { available: 0, raw: [], unavailable: true, error: err?.response?.data?.message || err.message };
  }
}

/**
 * Payout a provider's wallet balance to their bank via Paystack Transfers.
 * Creates a transfer recipient + initiates the transfer. Amount in naira.
 */
async function transferToProviderBank({ amount, bankCode, accountNumber, accountName, reason, reference }) {
  const recipientRes = await axios.post(
    `${PAYSTACK_BASE}/transferrecipient`,
    { type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' },
    { headers: paystackHeaders(), timeout: 20000 }
  );
  if (!recipientRes.data?.status) {
    throw new Error(recipientRes.data?.message || 'Failed to create transfer recipient.');
  }
  const recipientCode = recipientRes.data.data.recipient_code;

  const transferRes = await axios.post(
    `${PAYSTACK_BASE}/transfer`,
    { source: 'balance', amount: Math.round(amount * 100), recipient: recipientCode, reason, reference },
    { headers: paystackHeaders(), timeout: 20000 }
  );
  if (!transferRes.data?.status) {
    throw new Error(transferRes.data?.message || 'Failed to initiate transfer.');
  }
  return transferRes.data.data;
}

module.exports = { getPaystackAvailableBalance, transferToProviderBank };


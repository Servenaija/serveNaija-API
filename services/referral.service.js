/**
 * Referral Service
 *
 * Pays the referring agent a bonus when a referred customer places their
 * FIRST order (booking or marketplace order — whichever comes first, exactly
 * once per customer).
 *
 * The bonus is deposited straight into the agent's AGENT wallet
 * (models/agent.js `wallet` sub-document) — NOT the agent's normal
 * customer/provider wallet (models/wallet.js). The referral entry on the
 * agent document (commission, isPaid, paidAt) acts as the audit ledger.
 */

const { dB } = require('../models');
const notificationService = require('./notification.service');

const REFERRAL_FIRST_ORDER_BONUS = 1500;

/**
 * Was this the customer's first order ever?
 * Counts bookings + marketplace orders; called AFTER the new order is
 * created, so "first" means the combined total is exactly 1.
 */
async function isFirstOrder(customerId) {
  const [bookingCount, orderCount] = await Promise.all([
    dB.bookings.countDocuments({ customer: customerId }),
    dB.orders.countDocuments({ buyer: customerId }),
  ]);
  return bookingCount + orderCount === 1;
}

/**
 * Deposit the first-order referral bonus into the referring agent's wallet.
 * Safe to call on every order — it pays at most once per referred customer.
 *
 * @param {string} customerId
 * @returns {Promise<{paid: boolean, reason?: string, amount?: number, agentCode?: string}>}
 */
async function payFirstOrderReferralBonus(customerId) {
  const customer = await dB.customers.findById(customerId).select('agentCode fullName firstName').lean();
  if (!customer || !customer.agentCode) {
    return { paid: false, reason: 'not-referred' };
  }

  const agent = await dB.agents.findOne({
    agentCode: String(customer.agentCode).toUpperCase(),
    isActive: true,
  });
  if (!agent) {
    return { paid: false, reason: 'agent-not-found' };
  }

  if (!(await isFirstOrder(customerId))) {
    return { paid: false, reason: 'not-first-order' };
  }

  const bonus = REFERRAL_FIRST_ORDER_BONUS;
  const now = new Date();

  // ── Double-pay guard (atomic) ──
  // Claim only if the agent has NO referral entry at all for this customer.
  // If two orders race, exactly one claim matches and the other returns null.
  const claimed = await dB.agents.findOneAndUpdate(
    {
      _id: agent._id,
      referrals: {
        $not: {
          $elemMatch: {
            referredUserId: customerId,
            referredUserType: 'customer',
          },
        },
      },
    },
    {
      $push: {
        referrals: {
          referredUserId: customerId,
          referredUserType: 'customer',
          commission: bonus,
          isPaid: true,
          paidAt: now,
        },
      },
      $inc: {
        totalCustomerReferrals: 1,
        'wallet.balance': bonus,
        'wallet.totalEarned': bonus,
        earnings: bonus, // legacy field
      },
    },
    { new: true }
  );

  if (claimed) {
    await notifyAgent(agent, customer, bonus);
    console.log(`[Referral] ₦${bonus} deposited into agent ${agent.agentCode} wallet (first order by customer ${customerId}).`);
    return { paid: true, amount: bonus, agentCode: agent.agentCode };
  }

  // ── Entry exists ──
  // Reload and settle: if it was already paid → nothing to do. If it was
  // sitting in pendingPayout (added earlier but never paid) → move it to
  // the wallet balance now (this flow pays instantly, no pending step).
  const freshAgent = await dB.agents.findById(agent._id);
  if (!freshAgent) return { paid: false, reason: 'agent-not-found' };

  const entry = (freshAgent.referrals || []).find(
    (r) => r.referredUserId === customerId && r.referredUserType === 'customer'
  );

  if (!entry) return { paid: false, reason: 'claim-lost' };
  if (entry.isPaid) return { paid: false, reason: 'already-paid' };

  entry.commission = bonus;
  entry.isPaid = true;
  entry.paidAt = now;
  freshAgent.wallet.pendingPayout = Math.max(0, (freshAgent.wallet.pendingPayout || 0) - bonus);
  freshAgent.wallet.balance = (freshAgent.wallet.balance || 0) + bonus;
  await freshAgent.save();

  await notifyAgent(freshAgent, customer, bonus);
  console.log(`[Referral] ₦${bonus} deposited into agent ${freshAgent.agentCode} wallet (settled pending referral for customer ${customerId}).`);
  return { paid: true, amount: bonus, agentCode: freshAgent.agentCode };
}

async function notifyAgent(agent, customer, amount) {
  const customerName = customer?.fullName || customer?.firstName || 'A customer you referred';
  notificationService.sendPushNotification({
    userId: agent.userId,
    actorType: agent.userType || 'customer',
    title: 'Referral Bonus! 🎉',
    body: `₦${amount.toLocaleString()} has been deposited into your agent wallet — ${customerName} just placed their first order.`,
    type: 'payment',
    data: { screen: 'agent', bonus: amount },
  }).catch(() => {});
}

module.exports = {
  REFERRAL_FIRST_ORDER_BONUS,
  isFirstOrder,
  payFirstOrderReferralBonus,
};

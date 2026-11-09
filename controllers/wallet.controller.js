const httpStatus = require('http-status');
const { v4: uuidv4 } = require('uuid');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const paymentService = require('../services/payment.service');
const notificationService = require('../services/notification.service');

function actorType(user) {
  return user.constructor.modelName === 'Provider' ? 'provider' : 'customer';
}

async function getOrCreateWallet(user) {
  const actor = actorType(user);
  let wallet = await dB.wallets.findOne({ owner: user._id.toString() });
  if (!wallet) {
    wallet = await dB.wallets.create({ owner: user._id.toString(), ownerType: actor });
  }
  return wallet;
}

// GET /wallet
const getWallet = catchAsync(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user);
  const { page = 0, limit = 20 } = req.query;
  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const transactions = await dB.transactions
    .find({ owner: req.user._id.toString() })
    .sort({ createdAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);

  res.json({ wallet, transactions, page: safePage, limit: safeLimit });
});

// GET /wallet/transactions
const listTransactions = catchAsync(async (req, res) => {
  const { page = 0, limit = 20, type } = req.query;
  const query = { owner: req.user._id.toString() };
  if (type) query.type = type;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const [transactions, total] = await Promise.all([
    dB.transactions.find(query).sort({ createdAt: -1 }).skip(safePage * safeLimit).limit(safeLimit),
    dB.transactions.countDocuments(query),
  ]);

  res.json({ transactions, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) });
});

// POST /wallet/fund  — verify Paystack payment and credit wallet
const fundWallet = catchAsync(async (req, res) => {
  const { amount, paystackReference } = req.body;

  // Check reference not already used
  const existing = await dB.transactions.findOne({ reference: paystackReference });
  if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been processed.');

  // Verify with Paystack
  const verification = await paymentService.verifyTransaction(paystackReference);
  if (verification.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed. Transaction was not successful.');
  }
  if (Math.abs(verification.amount - amount) > 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount does not match.');
  }

  const { wallet, transaction } = await getOrCreateWallet(req.user).then(w => w.updateWalletBalance(
    verification.amount, 'credit', 'Wallet top-up via Paystack.',
    paystackReference, { paymentMethod: 'paystack', ...verification.metadata }));

  notificationService.sendPushNotification({
    userId: req.user._id.toString(),
    actorType: actorType(req.user),
    title: 'Wallet Funded!',
    body: `₦${verification.amount.toLocaleString()} has been added to your wallet.`,
    type: 'payment',
    data: { screen: 'wallet' },
  }).catch(() => {});

  res.json({ message: 'Wallet funded successfully.', balance: wallet.balance, amount: verification.amount });
});

// POST /wallet/withdraw
const withdrawFunds = catchAsync(async (req, res) => {
  const { amount, bankName, accountNumber, accountName, bankCode } = req.body;

  const wallet = await getOrCreateWallet(req.user);
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance.');
  }

  const reference = `SN-WD-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

  // Initiate Paystack transfer
  let transferResult;
  try {
    transferResult = await paymentService.initiateTransfer({
      amount,
      bankCode: bankCode || '',
      accountNumber,
      accountName,
      reason: 'ServeNaija wallet withdrawal',
      reference,
    });
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Transfer failed: ${err.message}`);
  }

  const balanceBefore = wallet.balance;
  wallet.balance -= amount;
  await wallet.save();

  await dB.transactions.create({
    wallet: wallet._id,
    owner: req.user._id.toString(),
    type: 'withdrawal',
    amount,
    balanceBefore,
    balanceAfter: wallet.balance,
    description: `Withdrawal to ${bankName} ${accountNumber}`,
    reference,
    status: 'success',
    metadata: transferResult,
  });

  notificationService.sendPushNotification({
    userId: req.user._id.toString(),
    actorType: actorType(req.user),
    title: 'Withdrawal Initiated',
    body: `₦${amount.toLocaleString()} withdrawal to your bank account has been initiated.`,
    type: 'payment',
    data: { screen: 'wallet' },
  }).catch(() => {});

  res.json({ message: 'Withdrawal initiated successfully.', balance: wallet.balance, reference });
});

// GET /wallet/banks — Paystack bank list
const getBanks = catchAsync(async (req, res) => {
  const banks = await paymentService.getBankList();
  res.json({ banks });
});

// POST /webhooks/paystack — Paystack webhook handler
const paystackWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = JSON.stringify(req.body);

  if (!paymentService.validateWebhookSignature(rawBody, signature)) {
    return res.status(httpStatus.UNAUTHORIZED).json({ message: 'Invalid signature.' });
  }

  const event = req.body;

  // ─── Handle Paystack TRANSFER events (payouts to providers/agents) ───
  if (event.event === 'transfer.success' || event.event === 'transfer.failed') {
    const tx = event.data;
    const reference = tx.reference;

    const Withdrawal = dB.Withdrawal || require('../models/Withdrawal');
    const withdrawal = await Withdrawal.findOne({ transferReference: reference }).lean();

    if (!withdrawal) {
      return res.sendStatus(200);
    }

    // Idempotency: skip if already processed
    if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
      return res.sendStatus(200);
    }

    if (event.event === 'transfer.success') {
      const provider = await dB.providers.findById(withdrawal.provider);
      const wallet = await dB.wallets.findOne({ owner: withdrawal.provider, ownerType: 'provider', isActive: true });

      if (wallet) {
        const balanceBefore = Number(wallet.balance) || 0;
        wallet.balance = 0;
        await wallet.save();

        await dB.transactions.create({
          wallet: wallet._id,
          owner: withdrawal.provider,
          ownerType: 'provider',
          type: 'withdrawal',
          amount: withdrawal.amount,
          balanceBefore,
          balanceAfter: 0,
          currency: wallet.currency || 'NGN',
          description: `Admin payout to ${withdrawal.accountName || ''} ${withdrawal.accountNumber || ''} (reference: ${reference})`,
          reference,
          status: 'success',
          metadata: {
            bankDetails: {
              bankName: withdrawal.bankName,
              bankCode: withdrawal.bankCode,
              accountNumber: withdrawal.accountNumber,
              accountName: withdrawal.accountName,
            },
            transfer: tx,
            breakdown: withdrawal.metadata?.breakdown || {},
            bookingIds: withdrawal.metadata?.bookingIds || [],
            orderIds: withdrawal.metadata?.orderIds || [],
            releasedBy: withdrawal.metadata?.releasedBy || null,
            note: withdrawal.metadata?.note || null,
          },
        });
      }

      const bookingIds = (withdrawal.metadata?.bookingIds || []).filter(Boolean);
      if (bookingIds.length) {
        await dB.bookings.updateMany(
          { _id: { $in: bookingIds }, paymentStatus: 'held' },
          { $set: { paymentStatus: 'released' } }
        );
      }

      const orderIds = (withdrawal.metadata?.orderIds || []).filter(Boolean);
      if (orderIds.length) {
        await dB.orders.updateMany(
          { _id: { $in: orderIds }, paymentStatus: 'held' },
          { $set: { paymentStatus: 'released', escrowReleasedAt: new Date() } }
        );
      }

      // ── Agent payout: zero agent wallet/earnings ──
      if (withdrawal.agent) {
        try {
          const Agent = dB.Agent || require('../models/Agent');
          const agent = await Agent.findById(withdrawal.agent);
          if (agent) {
            agent.wallet.pendingPayout = 0;
            agent.wallet.balance = 0;
            agent.wallet.totalPaidOut = Number(agent.wallet.totalPaidOut || 0) + withdrawal.amount;
            agent.pendingEarnings = 0;
            agent.earnings = Number(agent.earnings || 0) + withdrawal.amount;
            if (agent.referrals) {
              for (const ref of agent.referrals) {
                if (!ref.isPaid) {
                  ref.isPaid = true;
                  ref.paidAt = new Date();
                }
              }
            }
            await agent.save();
          }
        } catch (_) { /* non-fatal */ }
      }

      await Withdrawal.findByIdAndUpdate(withdrawal._id, {
        status: 'completed',
        moneySent: true,
        transferStatus: 'success',
        processedAt: new Date(),
      });

      if (provider) {
        try {
          const io = require('../utils/io').getIo();
          if (io) {
            io.to(`user_${withdrawal.provider}`).emit('payout_released', {
              providerId: withdrawal.provider,
              amount: withdrawal.amount,
              reference,
              at: new Date(),
            });
          }
          const notificationService = require('../services/notification.service');
          notificationService.sendPushNotification({
            userId: withdrawal.provider,
            actorType: 'provider',
            title: 'Payout Released',
            body: `₦${withdrawal.amount.toLocaleString()} has been transferred to your bank account ${withdrawal.accountNumber}.`,
            type: 'payment',
            data: { amount: withdrawal.amount, reference, transfer: tx },
          }).catch(() => {});
        } catch (_) { /* non-fatal */ }
      }
      return res.sendStatus(200);
    } else if (event.event === 'transfer.failed') {
      await Withdrawal.findByIdAndUpdate(withdrawal._id, {
        status: 'failed',
        moneySent: false,
        transferStatus: 'failed',
        lastError: tx?.gateway_response || 'Transfer failed',
        processedAt: new Date(),
      });

      try {
        const io = require('../utils/io').getIo();
        if (io) {
          io.to(`user_${withdrawal.provider}`).emit('payout_failed', {
            providerId: withdrawal.provider,
            amount: withdrawal.amount,
            reference,
            error: tx?.gateway_response || 'Transfer failed',
            at: new Date(),
          });
        }
        const notificationService = require('../services/notification.service');
        notificationService.sendPushNotification({
          userId: withdrawal.provider,
          actorType: 'provider',
          title: 'Payout Failed',
          body: `Your payout of ₦${withdrawal.amount.toLocaleString()} could not be completed. Please contact support.`,
          type: 'payment',
          data: { amount: withdrawal.amount, reference },
        }).catch(() => {});
      } catch (_) { /* non-fatal */ }
      return res.sendStatus(200);
    }
  }

  // Handle charge.success for wallet funding
  if (event.event === 'charge.success') {
    const tx = event.data;
    const metadata = tx.metadata || {};
    const userId = metadata.userId || metadata.customer_id;
    const purpose = metadata.purpose; // 'wallet_fund' | 'agent_registration' | 'subscription'

    if (purpose === 'wallet_fund' && userId) {
      const existing = await dB.transactions.findOne({ reference: tx.reference });
      if (existing) {
        // Already credited; skip to avoid duplicate
        return;
      }
      const { wallet, transaction } = await dB.wallets.findOne({ owner: userId }).then(w => w.updateWalletBalance(
        tx.amount / 100, 'credit', 'Wallet top-up via Paystack (webhook).',
        tx.reference, { paymentMethod: 'paystack', event: event.event, ...tx.metadata }));
    }
  }

  res.sendStatus(200);
});

const getTodayEarnings = catchAsync(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const result = await Transaction.aggregate([
    {
      $match: {
        owner: req.user._id.toString(),
        ownerType: 'provider',
        type: 'credit',
        status: 'completed',
        createdAt: { $gte: startOfDay, $end: endOfDay },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const earnings = result[0]?.total || 0;
  const transactionCount = result[0]?.count || 0;

  res.json({
    success: true,
    todayEarnings: earnings,
    transactionCount,
  });
});

module.exports = {
  getWallet,
  listTransactions,
  fundWallet,
  withdrawFunds,
  getBanks,
  paystackWebhook,
  getTodayEarnings
};

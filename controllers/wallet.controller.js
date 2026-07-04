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

  const wallet = await getOrCreateWallet(req.user);
  const balanceBefore = wallet.balance;
  wallet.balance += verification.amount;
  await wallet.save();

  await dB.transactions.create({
    wallet: wallet._id,
    owner: req.user._id.toString(),
    type: 'credit',
    amount: verification.amount,
    balanceBefore,
    balanceAfter: wallet.balance,
    description: 'Wallet top-up via Paystack.',
    reference: paystackReference,
    status: 'success',
    metadata: verification,
  });

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
  // Handle charge.success for wallet funding
  if (event.event === 'charge.success') {
    const tx = event.data;
    const metadata = tx.metadata || {};
    const userId = metadata.userId || metadata.customer_id;
    const purpose = metadata.purpose; // 'wallet_fund' | 'agent_registration' | 'subscription'

    if (purpose === 'wallet_fund' && userId) {
      const existing = await dB.transactions.findOne({ reference: tx.reference });
      if (!existing) {
        const wallet = await dB.wallets.findOne({ owner: userId });
        if (wallet) {
          wallet.balance += tx.amount / 100;
          await wallet.save();

          await dB.transactions.create({
            wallet: wallet._id,
            owner: userId,
            type: 'credit',
            amount: tx.amount / 100,
            description: 'Wallet top-up via Paystack (webhook).',
            reference: tx.reference,
            status: 'success',
            metadata: tx,
          });
        }
      }
    }
  }

  res.sendStatus(200);
});

module.exports = {
  getWallet,
  listTransactions,
  fundWallet,
  withdrawFunds,
  getBanks,
  paystackWebhook,
};

// controllers/customer.controller.js
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const Customer = require('../models/customer');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const axios = require('axios');
// ============================================
// GET WALLET BALANCE
// ============================================
const getWalletBalance = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const balance = await customer.getBalance();
  
  res.json({
    success: true,
    data: {
      balance: balance,
      currency: 'NGN'
    }
  });
});

// ============================================
// GET FULL WALLET INFO
// ============================================
const getWallet = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const wallet = await customer.getWallet();
  
  res.json({
    success: true,
    data: {
      wallet: {
        balance: wallet.balance,
        escrowBalance: wallet.escrowBalance,
        currency: wallet.currency,
        isActive: wallet.isActive,
        bankDetails: wallet.bankDetails,
      }
    }
  });
});

// ============================================
// GET TRANSACTIONS WITH PAGINATION
// ============================================
const getTransactions = catchAsync(async (req, res) => {
  const { page = 0, limit = 20, type } = req.query;
  const customer = await Customer.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  
  // Build filter
  const filter = { owner: customer._id.toString() };
  if (type) {
    filter.type = type;
  }
  
  // Get transactions with pagination
  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit)
      .lean(),
    Transaction.countDocuments(filter)
  ]);
  
  // Format transactions for frontend
  const formattedTransactions = transactions.map(tx => ({
    id: tx._id,
    type: tx.type,
    amount: tx.amount,
    balanceBefore: tx.balanceBefore,
    balanceAfter: tx.balanceAfter,
    description: tx.description,
    status: tx.status,
    reference: tx.reference,
    createdAt: tx.createdAt,
    metadata: tx.metadata,
  }));
  
  res.json({
    success: true,
    data: {
      transactions: formattedTransactions,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: total,
        pages: Math.ceil(total / safeLimit),
      }
    }
  });
});

// ============================================
// GET WALLET WITH BALANCE AND RECENT TRANSACTIONS
// ============================================
const getWalletWithTransactions = catchAsync(async (req, res) => {
  const { limit = 10 } = req.query;
  const customer = await Customer.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const safeLimit = Math.min(20, Math.max(1, Number(limit)));
  
  // Get wallet
  const wallet = await customer.getWallet();
  
  // Get recent transactions
  const transactions = await Transaction.find({ owner: customer._id.toString() })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
  
  // Calculate summary
  const totalCredits = await Transaction.aggregate([
    { $match: { owner: customer._id.toString(), type: 'credit', status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const totalDebits = await Transaction.aggregate([
    { $match: { owner: customer._id.toString(), type: { $in: ['debit', 'withdrawal'] }, status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  // Get pending transactions
  const pendingTransactions = await Transaction.countDocuments({
    owner: customer._id.toString(),
    status: 'pending'
  });
  
  res.json({
    success: true,
    data: {
      wallet: {
        balance: wallet.balance,
        escrowBalance: wallet.escrowBalance,
        currency: wallet.currency,
        isActive: wallet.isActive,
      },
      summary: {
        totalEarned: totalCredits[0]?.total || 0,
        totalSpent: totalDebits[0]?.total || 0,
        pendingCount: pendingTransactions,
      },
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        status: tx.status,
        createdAt: tx.createdAt,
      })),
    }
  });
});

// ============================================
// FUND WALLET (via Paystack)
// ============================================
const fundWallet = catchAsync(async (req, res) => {
  const { amount, paystackReference } = req.body;
  
  console.log('Fund wallet request:', { amount, paystackReference, userId: req.user._id });
  
  // 1. VALIDATE INPUT
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid amount is required');
  }
  
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required');
  }
  
  // 2. GET CUSTOMER WITH WALLET
  const customer = await Customer.findById(req.user._id).populate('walletId');
  
  if (!customer) {
    console.log('Customer not found:', req.user._id);
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  console.log('Customer found:', customer._id);
  console.log('Wallet ID from customer:', customer.walletId);
  
  // 3. CHECK IF REFERENCE ALREADY USED
  const existing = await Transaction.findOne({ reference: paystackReference });
  if (existing) {
    console.log('Duplicate reference:', paystackReference);
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been processed');
  }
  
  // 4. VERIFY WITH PAYSTACK
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  console.log('Paystack secret key present:', !!paystackSecretKey);
  
  if (!paystackSecretKey) {
    console.log('PAYSTACK_SECRET_KEY not set in environment');
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Paystack secret key not configured');
  }
  
  try {
    console.log('Verifying Paystack payment:', paystackReference);
    
    const verification = await axios.get(
      `https://api.paystack.co/transaction/verify/${paystackReference}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
        timeout: 10000,
      }
    );
    
    console.log('Paystack verification response:', {
      status: verification.data.status,
      dataStatus: verification.data.data?.status,
      amount: verification.data.data?.amount,
    });
    
    if (!verification.data.status || verification.data.data.status !== 'success') {
      console.log('Paystack verification failed:', verification.data);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
    }
    
    const paystackAmount = verification.data.data.amount / 100;
    console.log('Amount comparison:', { expected: amount, got: paystackAmount });
    
    if (paystackAmount !== amount) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Amount mismatch. Expected: ${amount}, Got: ${paystackAmount}`
      );
    }
    
  } catch (error) {
    console.log('Paystack verification error:', error.message);
    if (error.response) {
      console.log('Paystack error response:', error.response.data);
    }
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error.response?.data?.message || 'Paystack verification failed'
    );
  }
  
  // 5. GET OR CREATE WALLET
  let wallet = customer.walletId;
  
  if (!wallet) {
    console.log('Creating new wallet for customer:', customer._id);
    wallet = new Wallet({
      owner: customer._id,
      ownerType: 'Customer',
      balance: 0,
      escrowBalance: 0,
      currency: 'NGN',
      isActive: true,
    });
    await wallet.save();
    
    customer.walletId = wallet._id;
    await customer.save();
  }
  
  console.log('Current wallet balance:', wallet.balance);
  
  // 6. UPDATE WALLET BALANCE
  const oldBalance = wallet.balance;
  wallet.balance += amount;
  await wallet.save();
  
  console.log('Balance updated:', { oldBalance, newBalance: wallet.balance });
  
  // 7. CREATE TRANSACTION - FIXED to match your model
  try {
    const transaction = new Transaction({
      wallet: wallet._id,           // FIXED: was walletId
      owner: customer._id.toString(), // FIXED: owner is required
      type: 'credit',
      amount: amount,
      balanceBefore: oldBalance,
      balanceAfter: wallet.balance,
      currency: 'NGN',
      description: `Wallet funding via Paystack (${paystackReference})`,
      reference: paystackReference,
      status: 'success',
      metadata: { 
        paymentMethod: 'paystack',
      },
    });
    
    console.log('Transaction object created:', transaction);
    
    await transaction.save();
    console.log('Transaction saved successfully:', transaction._id);
    
    res.json({
      success: true,
      message: 'Wallet funded successfully',
      data: {
        balance: wallet.balance,
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          status: transaction.status,
        }
      }
    });
    
  } catch (transactionError) {
    // Rollback wallet balance if transaction fails
    console.log('Transaction creation failed:', transactionError.message);
    console.log('Transaction error details:', transactionError);
    
    // Revert wallet balance
    wallet.balance = oldBalance;
    await wallet.save();
    console.log('Wallet balance reverted to:', wallet.balance);
    
    // Check for duplicate key error
    if (transactionError.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate transaction reference');
    }
    
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create transaction record: ' + transactionError.message
    );
  }
});

// ============================================
// WITHDRAW FROM WALLET
// ============================================
const withdrawFromWallet = catchAsync(async (req, res) => {
  const { amount, bankName, accountNumber, accountName } = req.body;
  
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid amount is required');
  }
  
  if (!bankName || !accountNumber || !accountName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bank details are required');
  }
  
  const customer = await Customer.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const wallet = await customer.getWallet();
  
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient balance');
  }
  
  const reference = `WD-${Date.now()}`;
  
  // Update wallet (debit)
  const result = await customer.updateWalletBalance(
    amount,
    'withdrawal',
    `Withdrawal to ${bankName} (${accountNumber})`,
    reference,
    { bankName, accountNumber, accountName }
  );
  
  res.json({
    success: true,
    message: 'Withdrawal initiated successfully',
    data: {
      balance: result.wallet.balance,
      transaction: result.transaction,
    }
  });
});

module.exports = {
  getWalletBalance,
  getWallet,
  getTransactions,
  getWalletWithTransactions,
  fundWallet,
  withdrawFromWallet,
};
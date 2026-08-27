// controllers/customer.controller.js
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const Customer = require('../models/customer');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const axios = require('axios');
const mongoose = require('mongoose');
const { getBankCodeFromAccount } = require('../utils/paystack');
  const Withdrawal = require('../models/Withdrawal');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');


  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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
  
  // Determine user type (customer or provider)
  const Customer = mongoose.model('Customer');
  const Provider = mongoose.model('Provider');
  
  let user = null;
  let userType = null;
  
  // Check if user is a customer
  const customer = await Customer.findById(req.user._id);
  if (customer) {
    user = customer;
    userType = 'customer';
  }
  
  // If not customer, check if provider
  if (!user) {
    const provider = await Provider.findById(req.user._id);
    if (provider) {
      user = provider;
      userType = 'provider';
    }
  }
  
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  const wallet = await user.getWallet();
  
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient balance');
  }
  
  const reference = `WD-${Date.now()}`;
  
  console.log('=== WITHDRAWAL REQUEST ===');
  console.log('User:', user.email);
  console.log('User Type:', userType);
  console.log('Amount:', amount);
  console.log('Bank:', bankName);
  console.log('Account:', accountNumber);
  console.log('Account Name:', accountName);
  
  // Step 1: Get bank code from Paystack
  let bankCode = null;
  let verifiedAccountName = accountName;
  
  try {
    const resolveResult = await getBankCodeFromAccount(
      accountNumber,
      accountName,
      bankName
    );
    
    if (!resolveResult.success) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        resolveResult.error || 'Could not resolve bank account'
      );
    }
    
    bankCode = resolveResult.bankCode;
    verifiedAccountName = resolveResult.accountName || accountName;
    
    console.log('Bank resolved:', resolveResult.bankName, 'Code:', bankCode);
    console.log('Verified Account Name:', verifiedAccountName);
    
  } catch (error) {
    console.error('Bank resolution error:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error.message || 'Could not verify bank account. Please check your bank details.'
    );
  }
  
  // Step 2: Create withdrawal record in database (PENDING)
  const withdrawal = await Withdrawal.create({
    [userType]: user._id,
    amount: amount,
    amountToSend: amount,
    serviceCharge: 0,
    bankName: bankName,
    bankCode: bankCode,
    accountNumber: accountNumber,
    accountName: verifiedAccountName,
    reference: reference,
    status: 'pending',
    approved: 'pending',
    moneySent: false,
    requestedAt: new Date(),
  });
  
  console.log('Withdrawal record created:', withdrawal._id);
  
  // Step 3: Try to send money immediately
  let moneySent = false;
  
  try {
    const headers = {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
    
    // 3a. Create recipient
    console.log('Creating recipient...');
    const recipientResponse = await axios.post(
      'https://api.paystack.co/transferrecipient',
      {
        type: 'nuban',
        name: verifiedAccountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      },
      {
        headers,
        timeout: 10000,
      }
    );
    
    if (!recipientResponse.data.status) {
      throw new Error(recipientResponse.data.message || 'Failed to create recipient');
    }
    
    const recipientCode = recipientResponse.data.data.recipient_code;
    console.log('Recipient created:', recipientCode);
    
    const transferReference = `WD_${withdrawal._id}_${Date.now()}`;
    
    // 3b. Send transfer (full amount, no service charge)
    console.log(`Sending ₦${amount}...`);
    const transferResponse = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: Math.round(amount * 100), // Convert to kobo
        recipient: recipientCode,
        reason: `Withdrawal ${reference}`,
        reference: transferReference,
      },
      {
        headers,
        timeout: 15000,
      }
    );
    
    if (!transferResponse.data.status) {
      throw new Error(transferResponse.data.message || 'Transfer failed');
    }
    
    const transferData = transferResponse.data.data;
    console.log('Transfer initiated:', transferData.reference);
    console.log('Transfer status:', transferData.status);
    
    // Step 4: Money sent successfully - NOW deduct from wallet
    const result = await user.updateWalletBalance(
      amount,
      'withdrawal',
      `Withdrawal to ${bankName} (${accountNumber}) - Ref: ${reference}`,
      reference,
      {
        bankName: bankName,
        accountNumber: accountNumber,
        accountName: verifiedAccountName,
        transferReference: transferData.reference,
        transferId: transferData.id,
      }
    );
    
    // Step 5: Update withdrawal record
    withdrawal.moneySent = true;
    withdrawal.transferId = transferData.id;
    withdrawal.transferReference = transferData.reference;
    withdrawal.transferStatus = transferData.status;
    withdrawal.approved = 'completed';
    withdrawal.status = 'completed';
    withdrawal.processedAt = new Date();
    await withdrawal.save();
    
    moneySent = true;
    
    console.log('Wallet updated. New balance:', result.wallet.balance);
    console.log('Withdrawal completed successfully!');
    
    // Send success notification
    notificationService.sendPushNotification({
      userId: req.user._id.toString(),
      actorType: userType,
      title: 'Withdrawal Successful',
      body: `₦${amount.toLocaleString()} has been sent to your bank account.`,
      type: 'payment',
      data: {
        withdrawalId: withdrawal._id.toString(),
        amount: amount,
        reference: reference,
      },
    }).catch(() => {});
    
    res.json({
      success: true,
      message: 'Withdrawal successful',
      data: {
        balance: result.wallet.balance,
        transaction: result.transaction,
        withdrawal: {
          id: withdrawal._id,
          amount: amount,
          bankName: bankName,
          accountNumber: accountNumber,
          reference: reference,
          status: 'completed',
        },
      },
    });
    
  } catch (error) {
    console.error('Transfer failed:', error.response?.data || error.message);
    
    // Step 6: Transfer failed - mark withdrawal as failed, DON'T deduct wallet
    withdrawal.status = 'failed';
    withdrawal.approved = 'failed';
    withdrawal.failedAttempts = 1;
    withdrawal.lastError = error.response?.data?.message || error.message;
    withdrawal.lastAttemptAt = new Date();
    await withdrawal.save();
    
    // Send failure notification
    notificationService.sendPushNotification({
      userId: req.user._id.toString(),
      actorType: userType,
      title: 'Withdrawal Failed',
      body: `Your withdrawal of ₦${amount.toLocaleString()} failed. Please try again or contact support.`,
      type: 'payment',
      data: {
        withdrawalId: withdrawal._id.toString(),
        error: error.response?.data?.message || error.message,
      },
    }).catch(() => {});
    
    // Return error but wallet was NOT deducted
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error.response?.data?.message || 'Transfer failed. Please try again.'
    );
  }
});

const initializeMembership = catchAsync(async (req, res) => {
  const { plan, paystackReference } = req.body;
  
  if (!plan || !['free', 'premium'].includes(plan)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid plan selected. Choose free or premium.');
  }
  
  const customer = await dB.customers.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  // If free plan, just update membership
  if (plan === 'free') {
    customer.membership = {
      plan: 'free',
      amountPaid: 0,
      paidAt: new Date(),
      expiresAt: null,
      isActive: true,
      paystackReference: null,
    };
    
    await customer.save();
    
    return res.json({
      success: true,
      message: 'Free membership activated successfully',
      membership: customer.membership,
    });
  }
  
  // Premium plan - requires payment verification
  if (plan === 'premium') {
    if (!paystackReference) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required for premium membership');
    }
    
    try {
      // Verify payment with Paystack
      const verifyResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${paystackReference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          },
        }
      );
      
      const verificationData = verifyResponse.data;
      
      if (!verificationData.status || verificationData.data.status !== 'success') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
      }
      
      // Check amount (₦2,000 = 200000 kobo)
      if (Number(verificationData.data.amount) / 100 !== 2000) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment amount. Expected ₦2,000');
      }
      
      // Calculate expiry date (1 year from now)
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      
      // Update customer membership
      customer.membership = {
        plan: 'premium',
        amountPaid: 2000,
        paidAt: new Date(),
        expiresAt: expiresAt,
        isActive: true,
        paystackReference: paystackReference,
      };
      
      await customer.save();
      
      // Send notification
      notificationService.sendPushNotification({
        userId: customer._id.toString(),
        actorType: 'customer',
        title: 'Premium Membership Activated',
        body: 'Your premium membership has been activated successfully. Enjoy priority benefits!',
        type: 'membership',
        data: {
          plan: 'premium',
          expiresAt: expiresAt,
        },
      }).catch(() => {});
      
      return res.json({
        success: true,
        message: 'Premium membership activated successfully',
        membership: customer.membership,
      });
      
    } catch (error) {
      console.error('Paystack verification error:', error);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        error?.response?.data?.message || 'Payment verification failed'
      );
    }
  }
});

// Get membership status
const getMembership = catchAsync(async (req, res) => {
  const customer = await dB.customers.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  // Check if premium membership is still valid
  let membership = customer.membership;
  
  if (membership.plan === 'premium' && membership.expiresAt) {
    const now = new Date();
    if (now > membership.expiresAt) {
      membership.isActive = false;
      await customer.save();
    }
  }
  
  res.json({
    success: true,
    membership: membership,
  });
});

// Upgrade to premium (for existing free users)
const upgradeToPremium = catchAsync(async (req, res) => {
  const { paystackReference } = req.body;
  
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required');
  }
  
  const customer = await dB.customers.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  try {
    // Verify payment with Paystack
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${paystackReference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );
    
    const verificationData = verifyResponse.data;
    
    if (!verificationData.status || verificationData.data.status !== 'success') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
    }
    
    if (Number(verificationData.data.amount) / 100 !== 2000) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment amount. Expected ₦2,000');
    }
    
    // Calculate expiry date (1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    // Update customer membership
    customer.membership = {
      plan: 'premium',
      amountPaid: 2000,
      paidAt: new Date(),
      expiresAt: expiresAt,
      isActive: true,
      paystackReference: paystackReference,
    };
    
    await customer.save();
    
    notificationService.sendPushNotification({
      userId: customer._id.toString(),
      actorType: 'customer',
      title: 'Premium Membership Activated',
      body: 'Your premium membership has been activated successfully!',
      type: 'membership',
      data: {
        plan: 'premium',
        expiresAt: expiresAt,
      },
    }).catch(() => {});
    
    res.json({
      success: true,
      message: 'Successfully upgraded to premium membership',
      membership: customer.membership,
    });
    
  } catch (error) {
    console.error('Paystack verification error:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error?.response?.data?.message || 'Payment verification failed'
    );
  }
});

// Check if user has membership
const hasMembership = catchAsync(async (req, res) => {
  const customer = await dB.customers.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  const membership = customer.membership;
  
  // Check if premium membership is still valid
  if (membership.plan === 'premium' && membership.expiresAt) {
    const now = new Date();
    if (now > membership.expiresAt) {
      membership.isActive = false;
      await customer.save();
    }
  }
  
  res.json({
    success: true,
    hasMembership: membership.plan === 'free' || membership.isActive,
    membership: membership,
  });
});

// Get customer profile
const getProfile = catchAsync(async (req, res) => {
  const customer = await dB.customers.findById(req.user._id)
    .populate('wallet');
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  res.json({
    success: true,
    customer: customer,
  });
});

// Update customer profile
const updateProfile = catchAsync(async (req, res) => {
  const updates = req.body;
  const customer = await dB.customers.findById(req.user._id);
  
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  
  // Update allowed fields
  const allowedFields = ['firstName', 'lastName', 'fullName', 'phoneNumber', 'profilePhoto', 'location'];
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      customer[field] = updates[field];
    }
  }
  
  await customer.save();
  
  res.json({
    success: true,
    message: 'Profile updated successfully',
    customer: customer,
  });
});

const deactivateAccount = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const customer = await dB.customers.findById(userId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }

  // Check if already deactivated
  if (customer.isDeactivated) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account is already deactivated');
  }

  // Set deactivation date
  customer.deactivatedAt = new Date();
  customer.isDeactivated = true;
  customer.isActive = false;

  await customer.save();

  // Send notification
  notificationService.sendPushNotification({
    userId: userId.toString(),
    actorType: 'customer',
    title: 'Account Deactivated',
    body: 'Your account has been deactivated. You can reactivate by logging in within 6 months.',
    type: 'system',
    data: { screen: 'login' },
  }).catch(() => {});

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Account deactivated successfully. You can reactivate by logging in within 6 months.',
    data: {
      deactivatedAt: customer.deactivatedAt,
      reactivationDeadline: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // 6 months from now
    },
  });
});

// ============================================
// REACTIVATE ACCOUNT
// ============================================
const reactivateAccount = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const customer = await dB.customers.findOne({ email }).select('+password');
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Check if account was deactivated
  if (!customer.isDeactivated) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account is already active');
  }

  // Check if 6 months have passed
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  if (customer.deactivatedAt < sixMonthsAgo) {
    throw new ApiError(httpStatus.GONE, 'Account has been permanently deleted. Please create a new account.');
  }

  // Verify password
  const isPasswordMatch = await bcrypt.compare(password, customer.password);
  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
  }

  // Reactivate account
  customer.isDeactivated = false;
  customer.deactivatedAt = null;
  customer.lastLogin = new Date();

  await customer.save();

  // Generate tokens
  const id = customer._id.toString();
  const tokens = await tokenService.generateAuthTokens({ id, actor: 'customer' });

  const sanitizedUser = sanitizeUser(customer);

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Account reactivated successfully. You can now log in.',
    data: {
      user: sanitizedUser,
      tokens,
    },
  });
});

// ============================================
// PERMANENT DELETE DEACTIVATED ACCOUNTS (Cron Job)
// ============================================
const permanentDeleteDeactivatedAccounts = catchAsync(async (req, res) => {
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

  const result = await dB.customers.deleteMany({
    isDeactivated: true,
    deactivatedAt: { $lt: sixMonthsAgo },
  });

  res.status(httpStatus.OK).json({
    success: true,
    message: `Permanently deleted ${result.deletedCount} accounts`,
    data: {
      deletedCount: result.deletedCount,
    },
  });
});


module.exports = {
  getWalletBalance,
  getWallet,
  getTransactions,
  getWalletWithTransactions,
  fundWallet,
  withdrawFromWallet,
  initializeMembership,
  getMembership,
  upgradeToPremium,
  hasMembership,
  getProfile,
  updateProfile,
  deactivateAccount,
  reactivateAccount,
  permanentDeleteDeactivatedAccounts
};
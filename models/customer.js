// models/customerModel.js

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
	{
		firstName: {
			type: String,
			trim: true,
			default: '',
		},
		lastName: {
			type: String,
			trim: true,
			default: '',
		},
		fullName: {
			type: String,
			trim: true,
			required: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
			index: true,
		},
		phoneNumber: {
			type: String,
			required: true,
			trim: true,
			index: true,
		},
		password: {
			type: String,
			required: true,
			minlength: 8,
		},
		birthday: {
			type: Date,
			default: null,
		},
		profilePhoto: {
			type: String,
			trim: true,
			default: null,
		},
		agentCode: {
			type: String,
			trim: true,
			default: null,
		},
		membership: {
			type: {
				plan: {
					type: String,
					enum: ['free', 'premium'],
					default: 'free',
				},
				amountPaid: {
					type: Number,
					default: 0,
				},
				paidAt: {
					type: Date,
					default: null,
				},
				expiresAt: {
					type: Date,
					default: null,
				},
				isActive: {
					type: Boolean,
					default: true,
				},
				paystackReference: {
					type: String,
					trim: true,
					default: null,
				},
			},
			default: {
				plan: 'free',
				amountPaid: 0,
				paidAt: null,
				expiresAt: null,
				isActive: true,
				paystackReference: null,
			},
		},
		location: {
			state: {
				type: String,
				trim: true,
				default: '',
			},
			city: {
				type: String,
				trim: true,
				default: '',
			},
			address: {
				type: String,
				trim: true,
				default: '',
			},
			landmark: {
				type: String,
				trim: true,
				default: '',
			},
			coordinates: {
				latitude: {
					type: Number,
					default: null,
				},
				longitude: {
					type: Number,
					default: null,
				},
			},
		},
		walletId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Wallet',
			default: null,
		},
		expoPushToken: {
			type: String,
			trim: true,
			default: null,
		},
		isEmailVerified: {
			type: Boolean,
			default: false,
		},
		isPhoneVerified: {
			type: Boolean,
			default: false,
		},
		isAgent: {
			type: Boolean,
			default: false,
		},
		isBanned: {
			type: Boolean,
			default: false,
		},
		verificationToken: {
			type: String,
			default: null,
		},
		verificationTokenExpiresAt: {
			type: Date,
			default: null,
		},
		lastLogin: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
	}
);

// Basic indexes
customerSchema.index({ createdAt: -1 });
customerSchema.index({ isBanned: 1, createdAt: -1 });
customerSchema.index({ isEmailVerified: 1, createdAt: -1 });
customerSchema.index({ 'location.state': 1, 'location.city': 1 });
customerSchema.index({ agentCode: 1 }, { sparse: true });
customerSchema.index({ walletId: 1 }, { sparse: true });

//  Membership indexes
customerSchema.index({ 'membership.plan': 1 });
customerSchema.index({ 'membership.expiresAt': 1 });
customerSchema.index({ 'membership.isActive': 1 });

// Virtual to get wallet data when populated
customerSchema.virtual('wallet', {
	ref: 'Wallet',
	localField: 'walletId',
	foreignField: '_id',
	justOne: true,
});

// Pre-save middleware to auto-create wallet on first save
customerSchema.pre('save', async function(next) {
	if (this.isNew) {
		const Wallet = mongoose.model('Wallet');
		
		const existingWallet = await Wallet.findOne({ owner: this._id.toString() });
		if (!existingWallet) {
			const wallet = await Wallet.create({
				owner: this._id.toString(),
				ownerType: 'customer',
				balance: 0,
				escrowBalance: 0,
				currency: 'NGN',
				isActive: true,
			});
			this.walletId = wallet._id;
			console.log(`[Customer] Wallet created for customer ${this.email}`);
		}
	}
	next();
});

// Method to get wallet
customerSchema.methods.getWallet = async function() {
	const Wallet = mongoose.model('Wallet');
	
	if (this.walletId) {
		const wallet = await Wallet.findById(this.walletId);
		if (wallet) return wallet;
	}
	
	const wallet = await Wallet.create({
		owner: this._id.toString(),
		ownerType: 'customer',
	});
	this.walletId = wallet._id;
	await this.save();
	
	return wallet;
};

// Method to get wallet with virtual
customerSchema.methods.getWalletWithData = async function() {
	await this.populate('wallet');
	return this.wallet;
};

// Method to update wallet balance
customerSchema.methods.updateWalletBalance = async function(amount, type, description, reference, metadata = {}) {
	const wallet = await this.getWallet();
	const Transaction = mongoose.model('Transaction');
	
	const balanceBefore = wallet.balance;
	let balanceAfter = balanceBefore;
	
	if (type === 'credit') {
		balanceAfter = balanceBefore + amount;
	} else if (type === 'debit' || type === 'withdrawal') {
		balanceAfter = balanceBefore - amount;
	}
	
	wallet.balance = balanceAfter;
	await wallet.save();
	
	const transaction = await Transaction.create({
		wallet: wallet._id,
		owner: this._id.toString(),
		type: type,
		amount: amount,
		balanceBefore: balanceBefore,
		balanceAfter: balanceAfter,
		currency: wallet.currency,
		description: description,
		reference: reference,
		status: 'success',
		metadata: metadata,
	});
	
	return { wallet, transaction };
};

// Method to get transaction history
customerSchema.methods.getTransactions = async function(limit = 20, skip = 0) {
	const Transaction = mongoose.model('Transaction');
	
	return await Transaction.find({ owner: this._id.toString() })
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);
};

// Method to get wallet balance
customerSchema.methods.getBalance = async function() {
	const wallet = await this.getWallet();
	return wallet.balance;
};

module.exports = mongoose.model('Customer', customerSchema);
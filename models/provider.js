const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema(
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
		accountType: {
			type: String,
			enum: ['provider', 'business'],
			default: 'provider',
			index: true,
		},
		referralCode: {
			type: String,
			trim: true,
			default: null,
		},
		service: {
			category: {
				type: String,
				trim: true,
				default: '',
			},
			experience: {
				type: String,
				trim: true,
				default: '',
			},
			businessName: {
				type: String,
				trim: true,
				default: '',
			},
			description: {
				type: String,
				trim: true,
				default: '',
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
			area: {
				type: String,
				trim: true,
				default: '',
			},
			address: {
				type: String,
				trim: true,
				default: '',
			},
			radius: {
				type: String,
				default: '10KM',
			},
			travelOutsideArea: {
				type: Boolean,
				default: true,
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
		profile: {
			photo: {
				type: String,
				trim: true,
				default: null,
			},
			bio: {
				type: String,
				trim: true,
				default: '',
			},
		},
		business: {
			registrationNumber: {
				type: String,
				trim: true,
				default: '',
			},
			ownerFullName: {
				type: String,
				trim: true,
				default: '',
			},
			businessEmail: {
				type: String,
				trim: true,
				lowercase: true,
				default: '',
			},
			contactPhone: {
				type: String,
				trim: true,
				default: '',
			},
			businessDescription: {
				type: String,
				trim: true,
				default: '',
			},
			staffSize: {
				type: String,
				trim: true,
				default: '',
			},
			landmark: {
				type: String,
				trim: true,
				default: '',
			},
		},
		bankDetails: {
			accountName: {
				type: String,
				trim: true,
				default: '',
			},
			bankName: {
				type: String,
				trim: true,
				default: '',
			},
			accountNumber: {
				type: String,
				trim: true,
				default: '',
			},
			isVerified: {
				type: Boolean,
				default: false,
			},
		},
		kyc: {
			status: {
				type: String,
				enum: ['not_started', 'pending', 'approved', 'rejected'],
				default: 'not_started',
			},
			documentUrl: {
				type: String,
				trim: true,
				default: null,
			},
			selfieUrl: {
				type: String,
				trim: true,
				default: null,
			},
			reviewedAt: {
				type: Date,
				default: null,
			},
			rejectionReason: {
				type: String,
				trim: true,
				default: null,
			},
		},
		subscription: {
			selectedPlan: {
				type: String,
				enum: ['standard', 'verified', 'starter', 'growth', 'premium', 'enterprise'],
				default: 'verified',
			},
			amountPaid: {
				type: Number,
				default: 0,
			},
			currency: {
				type: String,
				default: 'NGN',
			},
			paidAt: {
				type: Date,
				default: null,
			},
			renewalDate: {
				type: Date,
				default: null,
			},
			isActive: {
				type: Boolean,
				default: false,
			},
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

providerSchema.index({ createdAt: -1 });
// Compound indexes for high-volume queries
providerSchema.index({ accountType: 1, createdAt: -1 });             // filter by type
providerSchema.index({ 'service.category': 1, createdAt: -1 });      // category search
providerSchema.index({ 'location.state': 1, 'location.city': 1 });   // geo filtering
providerSchema.index({ isBanned: 1, accountType: 1, createdAt: -1 }); // admin listing
providerSchema.index({ 'kyc.status': 1, createdAt: -1 });             // KYC review queue
providerSchema.index({ 'subscription.isActive': 1, accountType: 1 }); // active subscriptions

module.exports = mongoose.model('Provider', providerSchema);

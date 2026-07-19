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
		referralCode: {
			type: String,
			trim: true,
			default: null,
		},
		agentCode: {
			type: String,
			trim: true,
			default: null,
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

customerSchema.index({ createdAt: -1 });
// Compound indexes for high-volume queries
customerSchema.index({ isBanned: 1, createdAt: -1 });      // admin: list active/banned users
customerSchema.index({ isEmailVerified: 1, createdAt: -1 }); // admin: unverified users
customerSchema.index({ 'location.state': 1, 'location.city': 1 }); // geo filtering
customerSchema.index({ agentCode: 1 }, { sparse: true });  // agent lookups

module.exports = mongoose.model('Customer', customerSchema);

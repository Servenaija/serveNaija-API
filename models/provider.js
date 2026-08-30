// models/providerModel.js
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
      index: true,
    },
    agentCode: {
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
      coordinates: {
        latitude: {
          type: Number,
          default: ''
        },
        longitude: {
          type: Number,
          default: ''
        },
      },
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
        enum: ['5KM', '10KM', '15KM', '20KM', 'Anywhere in my city'],
        default: '10KM',
      },
      travelOutsideArea: {
        type: Boolean,
        default: true,
      },
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
    coordinates: {

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
      coverImage: {
        type: String,
        trim: true,
        default: null,
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
    kycStatus: {
      type: String,
      enum: ['idle', 'pending', 'approved', 'failed'],
      default: 'idle',
      index: true,
    },
    subscription: {
      selectedPlan: {
        type: String,
        enum: ['standard', 'verified', 'starter', 'growth', 'premium', 'enterprise', ''],
        default: '',
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
    featuredUntil: {
      type: Date,
      default: null,
      index: true,
    },
    isVerifiedPro: {
      type: Boolean,
      default: false,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
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

// ============================================
// INDEXES
// ============================================

// Basic indexes
providerSchema.index({ createdAt: -1 });
providerSchema.index({ accountType: 1, createdAt: -1 });
providerSchema.index({ 'service.category': 1, createdAt: -1 });
providerSchema.index({ 'location.state': 1, 'location.city': 1 });
providerSchema.index({ isBanned: 1, accountType: 1, createdAt: -1 });
providerSchema.index({ kycStatus: 1, createdAt: -1 }); // Fixed: was kycVerified
providerSchema.index({ 'subscription.isActive': 1, accountType: 1 });
providerSchema.index({ email: 1, kycStatus: 1 }); // Fixed: was kycVerified

// ============================================
// GEOSPATIAL INDEX - CRITICAL FOR NEAR-ME QUERIES
// ============================================
// This enables $geoNear aggregation for location-based queries
providerSchema.index({ geoLocation: '2dsphere' });

// Additional index for location coordinates fallback queries
providerSchema.index({
  'location.coordinates.latitude': 1,
  'location.coordinates.longitude': 1
});

// ============================================
// COMPOUND INDEXES FOR COMMON QUERIES
// ============================================

// For finding active providers by category with location
providerSchema.index({
  'service.category': 1,
  'subscription.isActive': 1,
  isBanned: 1,
  isDeactivated: 1,
});

// For finding verified providers
providerSchema.index({
  isVerifiedPro: 1,
  'subscription.isActive': 1,
  avgRating: -1, // If you add avgRating field
});

// For featured providers
providerSchema.index({
  featuredUntil: 1,
  'subscription.isActive': 1,
});

// Name lookups and admin dashboards
providerSchema.index({ fullName: 1 });
providerSchema.index({ isDeleted: 1, isDeactivated: 1, createdAt: -1 });
providerSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Provider', providerSchema);
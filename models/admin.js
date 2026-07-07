const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// All permission keys that can be assigned to an admin.
// Superadmins always have ALL permissions regardless of this array.
const ALL_PERMISSIONS = [
  'dashboard',
  'customers',
  'providers',
  'bookings',
  'kyc',
  'transactions',
  'notifications',
  'agents',
  'services',
  'marketplace',
  'chat',
  'calls',
  'settings',
  'manage_admins', // list/create/edit/deactivate other admins — superadmin only by default
];

const adminSchema = new mongoose.Schema(
  {
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
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    role: {
      type: String,
      enum: ['admin', 'superadmin'],
      default: 'admin',
    },
    // Explicit page/feature permissions. For superadmins this is ignored —
    // they always have access to everything.
    permissions: {
      type: [String],
      enum: ALL_PERMISSIONS,
      default: ['dashboard', 'customers', 'providers', 'bookings', 'kyc'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Hash password before save
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = bcrypt.hashSync(this.password, 12);
  next();
});

adminSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

/**
 * Returns true if this admin has the given permission.
 * Superadmins always pass.
 */
adminSchema.methods.hasPermission = function (permission) {
  if (this.role === 'superadmin') return true;
  return this.permissions.includes(permission);
};

module.exports = mongoose.model('Admin', adminSchema);
module.exports.ALL_PERMISSIONS = ALL_PERMISSIONS;


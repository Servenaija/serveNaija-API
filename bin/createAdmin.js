/**
 * Seed script — create a ServeNaija admin account.
 *
 * Usage:
 *   node bin/createAdmin.js
 *
 * Or with env overrides:
 *   ADMIN_EMAIL=ceo@servenaija.ng ADMIN_PASSWORD=Secret123! ADMIN_ROLE=superadmin node bin/createAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { mongooseP } = require('../config/auth');
const Admin = require('../models/admin');

const fullName = process.env.ADMIN_NAME     || 'Super Admin';
const email    = process.env.ADMIN_EMAIL    || 'admin@servenaija.ng';
const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
const role     = process.env.ADMIN_ROLE     || 'superadmin';
const phone    = process.env.ADMIN_PHONE    || '';

(async () => {
  try {
    await mongoose.connect(mongooseP.url);
    console.log('✓ Connected to database');

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log(`⚠  Admin with email "${email}" already exists (role: ${existing.role}). Skipping.`);
      process.exit(0);
    }

    const admin = await Admin.create({ fullName, email, password, phone, role });
    console.log(`✓ Admin created successfully:`);
    console.log(`   Name : ${admin.fullName}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role : ${admin.role}`);
    console.log(`   ID   : ${admin._id}`);
    process.exit(0);
  } catch (err) {
    console.error('✗ Error creating admin:', err.message);
    process.exit(1);
  }
})();

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const AdminUser = require('../models/AdminUser');

/**
 * Seeds an initial superadmin account using credentials from environment variables.
 * Run with: npm run seed
 */
const seedAdmin = async () => {
  await connectDB();

  const email = (process.env.ADMIN_EMAIL || 'admin@portal.gc-ca.example').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const fullName = process.env.ADMIN_NAME || 'System Administrator';

  const existing = await AdminUser.findOne({ email });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    await mongoose.connection.close();
    return;
  }

  const admin = await AdminUser.create({
    fullName,
    email,
    password,
    role: 'superadmin'
  });

  console.log('Superadmin account created successfully:');
  console.log(`  Email: ${admin.email}`);
  console.log('  Password: (as set in .env ADMIN_PASSWORD)');
  console.log('IMPORTANT: Change this password after first login.');

  await mongoose.connection.close();
};

seedAdmin().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});

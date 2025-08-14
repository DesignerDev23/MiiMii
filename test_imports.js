#!/usr/bin/env node

// Test script to verify imports are working correctly
console.log('🧪 Testing imports...');

try {
  // Test ActivityLog import from models
  console.log('📦 Testing ActivityLog import from models...');
  const { ActivityLog } = require('./src/models');
  console.log('✅ ActivityLog imported successfully from models');
  
  // Test wallet service import
  console.log('💰 Testing wallet service import...');
  const walletService = require('./src/services/wallet');
  console.log('✅ Wallet service imported successfully');
  
  // Test maintenance worker import
  console.log('🔧 Testing maintenance worker import...');
  const maintenanceWorker = require('./src/workers/maintenance');
  console.log('✅ Maintenance worker imported successfully');
  
  // Test BellBank service import
  console.log('🏦 Testing BellBank service import...');
  const bellBankService = require('./src/services/bellbank');
  console.log('✅ BellBank service imported successfully');
  
  // Test admin routes import
  console.log('👨‍💼 Testing admin routes import...');
  const adminRoutes = require('./src/routes/admin');
  console.log('✅ Admin routes imported successfully');
  
  console.log('🎉 All imports successful!');
  process.exit(0);
  
} catch (error) {
  console.error('❌ Import test failed:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

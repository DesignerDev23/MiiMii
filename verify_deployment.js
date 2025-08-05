#!/usr/bin/env node

/**
 * Deployment Verification Script for MiiMii Fintech Platform
 * This script helps verify that the logging and environment variable fixes work
 */

const logger = require('./src/utils/logger');

console.log('🔍 MiiMii Deployment Verification Script');
console.log('========================================\n');

// Test 1: Logger Console Output
console.log('1️⃣ Testing Logger Console Output...');
logger.info('✅ Logger console output is working');
logger.warn('⚠️ Logger warning output is working');
logger.error('❌ Logger error output is working');

// Test 2: Environment Variables Check
console.log('\n2️⃣ Checking Environment Variables...');

const requiredVars = {
  'PORT': process.env.PORT || '3000',
  'NODE_ENV': process.env.NODE_ENV || 'development',
  'APP_SECRET': process.env.APP_SECRET ? '✅ SET' : '❌ MISSING',
  'DB_CONNECTION_URL': process.env.DB_CONNECTION_URL ? '✅ SET' : '❌ MISSING',
  'DB_HOST': process.env.DB_HOST ? '✅ SET' : '❌ MISSING',
  'BOT_ACCESS_TOKEN': process.env.BOT_ACCESS_TOKEN ? '✅ SET' : '❌ MISSING',
  'BOT_PHONE_NUMBER_ID': process.env.BOT_PHONE_NUMBER_ID ? '✅ SET' : '❌ MISSING',
  'BANK_CONSUMER_KEY': process.env.BANK_CONSUMER_KEY ? '✅ SET' : '❌ MISSING',
  'AI_API_KEY': process.env.AI_API_KEY ? '✅ SET' : '❌ MISSING',
};

console.log('Environment Variables Status:');
for (const [key, value] of Object.entries(requiredVars)) {
  console.log(`  ${key}: ${value}`);
}

// Test 3: Database Configuration Check
console.log('\n3️⃣ Database Configuration Check...');
const hasDbUrl = !!process.env.DB_CONNECTION_URL;
const hasDbHost = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);

if (hasDbUrl) {
  console.log('  ✅ Database URL configured');
} else if (hasDbHost) {
  console.log('  ✅ Database individual parameters configured');
} else {
  console.log('  ❌ No database configuration found');
}

// Test 4: WhatsApp Configuration Check
console.log('\n4️⃣ WhatsApp Configuration Check...');
const whatsAppVars = ['BOT_ACCESS_TOKEN', 'BOT_PHONE_NUMBER_ID', 'BOT_BUSINESS_ACCOUNT_ID', 'BOT_WEBHOOK_VERIFY_TOKEN'];
const missingWhatsApp = whatsAppVars.filter(var_ => !process.env[var_]);

if (missingWhatsApp.length === 0) {
  console.log('  ✅ All WhatsApp variables configured');
} else {
  console.log(`  ❌ Missing WhatsApp variables: ${missingWhatsApp.join(', ')}`);
}

// Test 5: Banking Configuration Check
console.log('\n5️⃣ Banking Configuration Check...');
const bankingVars = ['BANK_CONSUMER_KEY', 'BANK_CONSUMER_SECRET', 'PROVIDER_USERNAME', 'BILAL_API_KEY'];
const missingBanking = bankingVars.filter(var_ => !process.env[var_]);

if (missingBanking.length === 0) {
  console.log('  ✅ All banking variables configured');
} else {
  console.log(`  ❌ Missing banking variables: ${missingBanking.join(', ')}`);
}

// Test 6: Port Configuration
console.log('\n6️⃣ Port Configuration Check...');
const port = parseInt(process.env.PORT) || 3000;
if (port === 3000) {
  console.log('  ✅ Port configured correctly (3000)');
} else {
  console.log(`  ⚠️ Port set to ${port} (should be 3000 for DigitalOcean)`);
}

// Test 7: Critical Missing Variables
console.log('\n7️⃣ Critical Variables Summary...');
const criticalVars = ['APP_SECRET'];
const criticalMissing = criticalVars.filter(var_ => !process.env[var_]);

if (criticalMissing.length === 0) {
  console.log('  ✅ All critical variables present');
} else {
  console.log(`  🚨 CRITICAL: Missing variables: ${criticalMissing.join(', ')}`);
  console.log('     App will NOT start without these!');
}

// Summary
console.log('\n📊 VERIFICATION SUMMARY');
console.log('======================');

if (criticalMissing.length > 0) {
  console.log('🚨 STATUS: CRITICAL ISSUES - App will not start');
  console.log('   Action: Set missing critical variables in DigitalOcean UI');
} else if (missingWhatsApp.length > 0 || missingBanking.length > 0) {
  console.log('⚠️  STATUS: PARTIAL CONFIGURATION - App will start but features limited');
  console.log('   Action: Set missing feature variables for full functionality');
} else {
  console.log('✅ STATUS: FULLY CONFIGURED - App should work perfectly');
  console.log('   Action: Deploy and monitor runtime logs');
}

console.log('\n🔗 Next Steps:');
console.log('1. Set missing variables in DigitalOcean App Platform UI');
console.log('2. Deploy your application');
console.log('3. Check Runtime Logs tab for startup messages');
console.log('4. Verify health check at: https://api.chatmiimii.com/healthz');

console.log('\n📚 For detailed setup instructions, see: DIGITALOCEAN_ENV_SETUP.md');
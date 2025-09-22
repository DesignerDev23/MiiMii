#!/usr/bin/env node

/**
 * Test script to verify Rubies wallet migration
 * Run this script to test the migration manually
 */

const databaseMigration = require('./src/services/databaseMigration');
const logger = require('./src/utils/logger');

async function testMigration() {
  try {
    console.log('🧪 Testing Rubies wallet migration...');
    
    // Check if columns exist before migration
    console.log('📋 Checking columns before migration...');
    const columns = [
      'rubiesAccountNumber',
      'rubiesCustomerId', 
      'rubiesWalletStatus',
      'lastSyncAt'
    ];
    
    for (const column of columns) {
      const exists = await databaseMigration.columnExists('Wallets', column);
      console.log(`  ${column}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }
    
    // Run the migration
    console.log('🚀 Running Rubies wallet migration...');
    await databaseMigration.ensureRubiesWalletColumns();
    
    // Check if columns exist after migration
    console.log('📋 Checking columns after migration...');
    for (const column of columns) {
      const exists = await databaseMigration.columnExists('Wallets', column);
      console.log(`  ${column}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }
    
    console.log('✅ Migration test completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMigration();

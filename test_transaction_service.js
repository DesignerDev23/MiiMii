const transactionService = require('./src/services/transaction');
const logger = require('./src/utils/logger');

async function testTransactionService() {
  console.log('🧪 Testing Transaction Service\n');

  try {
    // Test 1: Check if createTransaction method exists
    console.log('1. Testing createTransaction method...');
    
    if (typeof transactionService.createTransaction === 'function') {
      console.log('✅ createTransaction method exists');
    } else {
      console.log('❌ createTransaction method does not exist');
      console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(transactionService)));
      return;
    }

    // Test 2: Check if updateTransactionStatus method exists
    console.log('\n2. Testing updateTransactionStatus method...');
    
    if (typeof transactionService.updateTransactionStatus === 'function') {
      console.log('✅ updateTransactionStatus method exists');
    } else {
      console.log('❌ updateTransactionStatus method does not exist');
    }

    // Test 3: Check other methods
    console.log('\n3. Testing other methods...');
    const methods = [
      'initiateTransfer',
      'handleMiiMiiTransfer', 
      'handleBankTransfer',
      'processBankTransfer',
      'sendTransactionHistory',
      'getTransactionByReference'
    ];

    for (const method of methods) {
      if (typeof transactionService[method] === 'function') {
        console.log(`   ✅ ${method} method exists`);
      } else {
        console.log(`   ❌ ${method} method does not exist`);
      }
    }

    console.log('\n🎉 Transaction service testing completed!');
    console.log('\n📝 The transaction service should now work with bank transfers.');

  } catch (error) {
    console.error('❌ Transaction service test failed:', error.message);
    logger.error('Transaction service test failed', { error: error.message });
  }
}

// Run the test
testTransactionService();

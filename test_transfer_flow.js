// Test script to verify the complete transfer flow
const bankTransferService = require('./src/services/bankTransfer');
const logger = require('./src/utils/logger');

async function testTransferFlow() {
  console.log('🧪 Testing Transfer Flow with BellBank Test Credentials\n');

  try {
    // Test 1: Validate test account
    console.log('1. Testing account validation...');
    const validation = await bankTransferService.validateBankAccount('1001011000', '010');
    console.log('✅ Account validation result:', validation);

    // Test 2: Calculate fees
    console.log('\n2. Testing fee calculation...');
    const feeInfo = bankTransferService.calculateTransferFee(5000, bankTransferService.transferTypes.WALLET_TO_BANK);
    console.log('✅ Fee calculation result:', feeInfo);

    // Test 3: Test with different amounts
    console.log('\n3. Testing different amounts...');
    const amounts = [100, 1000, 5000, 10000, 50000];
    
    for (const amount of amounts) {
      const fees = bankTransferService.calculateTransferFee(amount, bankTransferService.transferTypes.WALLET_TO_BANK);
      console.log(`   ₦${amount.toLocaleString()}: Fee ₦${fees.totalFee}, Total ₦${fees.totalAmount.toLocaleString()}`);
    }

    // Test 4: Test bank name mapping
    console.log('\n4. Testing bank name mapping...');
    const testBanks = ['test', 'testbank', 'keystone', 'gtb', 'access'];
    
    for (const bank of testBanks) {
      const bankCode = bankTransferService.getBankNameByCode(bank);
      console.log(`   ${bank}: ${bankCode}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📝 Test Instructions:');
    console.log('   - Use "Send 5k to 1001011000 test bank" to test the transfer flow');
    console.log('   - The system should validate the account and show confirmation');
    console.log('   - This uses official BellBank test credentials');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logger.error('Transfer flow test failed', { error: error.message });
  }
}

// Run the test
testTransferFlow();

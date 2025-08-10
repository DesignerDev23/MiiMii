const bankTransferService = require('./src/services/bankTransfer');
const logger = require('./src/utils/logger');

async function testSandboxTransfer() {
  console.log('🧪 Testing Sandbox Transfer Flow\n');

  try {
    // Test 1: Validate official BellBank test account
    console.log('1. Testing official BellBank test account...');
    const validation = await bankTransferService.validateBankAccount('1001011000', '010');
    console.log('✅ Test account validation:', {
      valid: validation.valid,
      accountName: validation.accountName,
      bank: validation.bank,
      test: validation.test
    });

    // Test 2: Test bank name mapping
    console.log('\n2. Testing bank name mapping...');
    const testCases = [
      { input: 'test bank', expected: '010' },
      { input: 'testbank', expected: '010' },
      { input: 'test', expected: '010' },
      { input: 'keystone', expected: '082' },
      { input: 'gtb', expected: '058' }
    ];

    for (const testCase of testCases) {
      const bankCode = bankTransferService.getBankNameByCode(testCase.input);
      console.log(`   "${testCase.input}" -> ${bankCode} (expected: ${testCase.expected})`);
    }

    // Test 3: Calculate fees for test transfer
    console.log('\n3. Testing fee calculation...');
    const amounts = [100, 1000, 5000, 10000];
    
    for (const amount of amounts) {
      const fees = bankTransferService.calculateTransferFee(amount, bankTransferService.transferTypes.WALLET_TO_BANK);
      console.log(`   ₦${amount.toLocaleString()}: Fee ₦${fees.totalFee}, Total ₦${fees.totalAmount.toLocaleString()}`);
    }

    console.log('\n🎉 Sandbox testing completed successfully!');
    console.log('\n📝 Test Instructions for WhatsApp:');
    console.log('   ✅ "Send 5k to 1001011000 test bank" - Should work with official test credentials');
    console.log('   ✅ "Send 5k to Abdulkadir Musa 6035745691 keystone bank" - Should work with real bank');
    console.log('   ✅ The system should now properly recognize "test bank" and use bank code 010');

  } catch (error) {
    console.error('❌ Sandbox test failed:', error.message);
    logger.error('Sandbox transfer test failed', { error: error.message });
  }
}

// Run the test
testSandboxTransfer();

const fincraService = require('./src/services/fincra');
const bellbankService = require('./src/services/bellbank');
const bilalService = require('./src/services/bilal');
const logger = require('./src/utils/logger');

async function testFincraBVN() {
  console.log('\n🧪 Testing Fincra BVN Resolution...');
  
  try {
    const testBVN = '12345678901'; // Test BVN
    const result = await fincraService.validateBVN({
      bvn: testBVN,
      userId: 1
    });
    
    console.log('✅ Fincra BVN Test Result:', {
      success: result.success,
      status: result.verificationStatus,
      hasData: !!result.data
    });
    
    return result.success;
  } catch (error) {
    console.log('❌ Fincra BVN Test Failed:', error.message);
    return false;
  }
}

async function testBellBankVirtualAccount() {
  console.log('\n🏦 Testing BellBank Virtual Account Creation...');
  
  try {
    const testUserData = {
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Test',
      phoneNumber: '08012345678',
      bvn: '12345678901',
      gender: 'male',
      dateOfBirth: '1990-01-01',
      address: 'Lagos, Nigeria',
      userId: 1
    };
    
    const result = await bellbankService.createVirtualAccount(testUserData);
    
    console.log('✅ BellBank Virtual Account Test Result:', {
      success: result.success,
      accountNumber: result.accountNumber,
      accountName: result.accountName,
      bankName: result.bankName
    });
    
    return result.success;
  } catch (error) {
    console.log('❌ BellBank Virtual Account Test Failed:', error.message);
    return false;
  }
}

async function testBilalAirtime() {
  console.log('\n📱 Testing Bilal Airtime Purchase...');
  
  try {
    const testUser = { id: 1 };
    const testPurchaseData = {
      network: 'MTN',
      phone: '08012345678',
      amount: 100
    };
    
    const result = await bilalService.purchaseAirtime(testUser, testPurchaseData);
    
    console.log('✅ Bilal Airtime Test Result:', {
      success: result.success,
      amount: result.amount,
      phoneNumber: result.phoneNumber,
      message: result.message
    });
    
    return result.success;
  } catch (error) {
    console.log('❌ Bilal Airtime Test Failed:', error.message);
    return false;
  }
}

async function testBilalData() {
  console.log('\n📊 Testing Bilal Data Purchase...');
  
  try {
    const testUser = { id: 1 };
    const testPurchaseData = {
      network: 'MTN',
      phone: '08012345678',
      dataPlan: 1 // 500MB plan
    };
    
    const result = await bilalService.purchaseData(testUser, testPurchaseData);
    
    console.log('✅ Bilal Data Test Result:', {
      success: result.success,
      amount: result.amount,
      dataplan: result.dataplan,
      phoneNumber: result.phoneNumber,
      message: result.message
    });
    
    return result.success;
  } catch (error) {
    console.log('❌ Bilal Data Test Failed:', error.message);
    return false;
  }
}

async function testBilalBalance() {
  console.log('\n💰 Testing Bilal Balance Check...');
  
  try {
    const result = await bilalService.getBalance();
    
    console.log('✅ Bilal Balance Test Result:', {
      balance: result.balance,
      currency: result.currency
    });
    
    return true;
  } catch (error) {
    console.log('❌ Bilal Balance Test Failed:', error.message);
    return false;
  }
}

async function testAllImplementations() {
  console.log('🚀 Starting API Implementation Tests...\n');
  
  const results = {
    fincra: await testFincraBVN(),
    bellbank: await testBellBankVirtualAccount(),
    bilalAirtime: await testBilalAirtime(),
    bilalData: await testBilalData(),
    bilalBalance: await testBilalBalance()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test}`);
  });
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  console.log(`\n📈 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All implementations are working correctly!');
  } else {
    console.log('⚠️  Some implementations need attention. Check the logs above.');
  }
  
  return results;
}

// Run tests if this file is executed directly
if (require.main === module) {
  testAllImplementations()
    .then(() => {
      console.log('\n✅ Test suite completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testFincraBVN,
  testBellBankVirtualAccount,
  testBilalAirtime,
  testBilalData,
  testBilalBalance,
  testAllImplementations
};


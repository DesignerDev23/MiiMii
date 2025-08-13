const aiAssistant = require('./src/services/aiAssistant');
const bilalService = require('./src/services/bilal');
const walletService = require('./src/services/wallet');

async function testAirtimeComplete() {
  console.log('🧪 Testing complete airtime purchase flow...\n');

  try {
    // Test 1: Check extraction methods
    console.log('1. Testing extraction methods...');
    const testMessage = 'Buy 100 airtime for 07035437910';
    
    const amount = aiAssistant.extractAmount(testMessage);
    const phoneNumber = aiAssistant.extractPhoneNumber(testMessage);
    const network = phoneNumber ? aiAssistant.detectNetwork(phoneNumber) : null;
    
    console.log(`   Message: "${testMessage}"`);
    console.log(`   Amount: ${amount}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Network: ${network}`);
    
    if (!amount || !phoneNumber) {
      console.log('❌ Extraction failed');
      return;
    }
    console.log('✅ Extraction successful');

    // Test 2: Check BILALSADASUB credentials
    console.log('\n2. Checking BILALSADASUB credentials...');
    if (!bilalService.username || !bilalService.password) {
      console.log('❌ BILALSADASUB credentials not configured');
      console.log('   Please set BILAL_USERNAME and BILAL_PASSWORD environment variables');
      return;
    }
    console.log('✅ BILALSADASUB credentials configured');

    // Test 3: Check network mapping
    console.log('\n3. Checking network mapping...');
    const networkId = bilalService.networkMapping[network.toUpperCase()];
    if (!networkId) {
      console.log(`❌ Network "${network}" not found in mapping`);
      console.log(`   Available networks: ${Object.keys(bilalService.networkMapping).join(', ')}`);
      return;
    }
    console.log(`✅ Network "${network}" mapped to ID: ${networkId}`);

    // Test 4: Check wallet service
    console.log('\n4. Checking wallet service...');
    if (typeof walletService.getUserWallet !== 'function') {
      console.log('❌ Wallet service getUserWallet method not found');
      return;
    }
    if (typeof walletService.debitWallet !== 'function') {
      console.log('❌ Wallet service debitWallet method not found');
      return;
    }
    console.log('✅ Wallet service methods available');

    console.log('\n🎉 All components are ready for airtime purchase!');
    console.log('\n📝 Summary:');
    console.log('   ✅ Extraction methods working');
    console.log('   ✅ BILALSADASUB credentials configured');
    console.log('   ✅ Network mapping working');
    console.log('   ✅ Wallet service available');
    console.log('\n💡 The airtime purchase should now work correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testAirtimeComplete();

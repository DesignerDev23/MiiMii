const bilalService = require('./src/services/bilal');

async function testBilalConnection() {
  console.log('🧪 Testing BILALSADASUB connection...\n');

  try {
    // Test 1: Check if credentials are configured
    console.log('1. Checking credentials...');
    if (!bilalService.username || !bilalService.password) {
      console.log('❌ BILALSADASUB credentials not configured');
      console.log('   Please set BILAL_USERNAME and BILAL_PASSWORD environment variables');
      return;
    }
    console.log('✅ Credentials configured');

    // Test 2: Try to generate token
    console.log('2. Testing token generation...');
    const tokenData = await bilalService.generateToken();
    console.log('✅ Token generated successfully');
    console.log(`   Username: ${tokenData.username}`);
    console.log(`   Balance: ₦${tokenData.balance}`);

    // Test 3: Test connection
    console.log('3. Testing connection...');
    const connectionTest = await bilalService.testConnection();
    console.log('✅ Connection test successful');
    console.log(`   Message: ${connectionTest.message}`);

    console.log('\n🎉 BILALSADASUB connection is working!');

  } catch (error) {
    console.error('❌ BILALSADASUB connection failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testBilalConnection();

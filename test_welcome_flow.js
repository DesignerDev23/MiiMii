const whatsappService = require('./src/services/whatsapp');

async function testWelcomeFlow() {
  try {
    console.log('🧪 Testing Welcome Flow...');
    
    // Test phone number (replace with your test number)
    const testPhoneNumber = '+2348012345678'; // Replace with actual test number
    const testUserName = 'Test User';
    
    console.log(`📱 Testing with phone: ${testPhoneNumber}`);
    console.log(`👤 Test user name: ${testUserName}`);
    
    // Test the welcome flow message
    const result = await whatsappService.sendWelcomeFlowMessage(
      testPhoneNumber, 
      testUserName, 
      null // No messageId for this test
    );
    
    console.log('✅ Welcome flow test completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Welcome flow test failed:', error.message);
    console.error('🔍 Error details:', error);
  }
}

// Run the test
testWelcomeFlow();

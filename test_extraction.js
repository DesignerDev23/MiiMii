const aiAssistant = require('./src/services/aiAssistant');

function testExtraction() {
  console.log('🧪 Testing extraction methods...\n');

  const testMessages = [
    'Buy 100 airtime for 07035437910',
    'Buy 1k airtime for 08012345678',
    'Buy 2.5k data for 09087654321',
    'Pay 5000 electricity Ikeja 12345678901',
    'Send 10k to 08123456789'
  ];

  testMessages.forEach((message, index) => {
    console.log(`Test ${index + 1}: "${message}"`);
    
    const amount = aiAssistant.extractAmount(message);
    const phoneNumber = aiAssistant.extractPhoneNumber(message);
    const network = phoneNumber ? aiAssistant.detectNetwork(phoneNumber) : null;
    
    console.log(`   Amount: ${amount}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Network: ${network}`);
    console.log('');
  });

  console.log('✅ Extraction test completed!');
}

testExtraction();

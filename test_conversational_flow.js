const aiAssistant = require('./src/services/aiAssistant');

async function testConversationalFlow() {
  console.log('🧪 Testing Conversational AI Flow\n');

  try {
    // Create a mock user for testing
    const mockUser = {
      id: 'test-user-id',
      whatsappNumber: '+2349072874728',
      firstName: 'Designer',
      onboardingStep: 'completed',
      canPerformTransactions: () => true
    };

    // Test cases
    const testCases = [
      {
        message: "Send 5k to Abdulkadir Musa 6035745691 keystone bank",
        expectedIntent: "bank_transfer",
        expectedResponse: "PIN"
      },
      {
        message: "Send 5k to 1001011000 test bank",
        expectedIntent: "bank_transfer",
        expectedResponse: "PIN"
      },
      {
        message: "Send 10k to John 1234567890 GTBank",
        expectedIntent: "bank_transfer",
        expectedResponse: "PIN"
      }
    ];

    for (const testCase of testCases) {
      console.log(`📝 Testing: "${testCase.message}"\n`);
      
      try {
        // Test AI Analysis
        const aiAnalysis = await aiAssistant.analyzeUserIntent(testCase.message, mockUser);
        
        console.log('✅ AI Analysis Result:');
        console.log(`   Intent: ${aiAnalysis.intent}`);
        console.log(`   Confidence: ${aiAnalysis.confidence}`);
        console.log(`   Extracted Data:`, aiAnalysis.extractedData || 'None');
        console.log(`   Response: ${aiAnalysis.response?.substring(0, 100)}...`);
        
        // Validate intent
        if (aiAnalysis.intent === testCase.expectedIntent) {
          console.log(`   ✅ Intent matches expected: ${testCase.expectedIntent}`);
        } else {
          console.log(`   ❌ Intent mismatch. Expected: ${testCase.expectedIntent}, Got: ${aiAnalysis.intent}`);
        }
        
        // Validate response contains PIN request
        if (aiAnalysis.response && aiAnalysis.response.toLowerCase().includes('pin')) {
          console.log(`   ✅ Response includes PIN request`);
        } else {
          console.log(`   ❌ Response missing PIN request`);
        }
        
        // Validate extracted data
        if (aiAnalysis.extractedData) {
          console.log(`   ✅ Extracted Data:`);
          console.log(`      Amount: ${aiAnalysis.extractedData.amount}`);
          console.log(`      Account: ${aiAnalysis.extractedData.accountNumber}`);
          console.log(`      Bank: ${aiAnalysis.extractedData.bankName}`);
          console.log(`      Recipient: ${aiAnalysis.extractedData.recipientName || 'None'}`);
        }
        
      } catch (error) {
        console.error(`   ❌ Test failed:`, error.message);
      }
      
      console.log('\n' + '='.repeat(60) + '\n');
    }

    console.log('🎉 Conversational flow testing completed!');
    console.log('\n📝 Expected WhatsApp Flow:');
    console.log('   1. User: "Send 5k to Abdulkadir Musa 6035745691 keystone bank"');
    console.log('   2. AI: "Nice! Are you sure you want to send ₦5,000 to Abdulkadir Musa at Keystone Bank? That\'s amazing! Let me help you out - just give me your PIN to authorize your transfer. 🔐"');
    console.log('   3. User: "1234" (PIN)');
    console.log('   4. System: Processes transfer and shows success message');

  } catch (error) {
    console.error('❌ Conversational flow test failed:', error.message);
  }
}

// Run the test
testConversationalFlow();

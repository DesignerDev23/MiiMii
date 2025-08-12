const aiAssistant = require('./src/services/aiAssistant');

// Test the fixes
async function testFixes() {
  console.log('🧪 Testing AI Intent Analysis Fixes\n');

  const testCases = [
    {
      name: "Balance Query Fix",
      message: "What's my current balance",
      expectedIntent: "balance"
    },
    {
      name: "P2P Transfer",
      message: "Send 100 to 9072874728 Musa Abdulkadir opay",
      expectedIntent: "transfer"
    },
    {
      name: "Bank Transfer",
      message: "Send 5k to Abdulkadir Musa 6035745691 keystone bank",
      expectedIntent: "bank_transfer"
    },
    {
      name: "Simple Balance",
      message: "Balance",
      expectedIntent: "balance"
    }
  ];

  const mockUser = {
    id: 1,
    whatsappNumber: '2349072874728',
    firstName: 'John',
    lastName: 'Doe',
    onboardingStep: 'completed'
  };

  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);
      console.log(`Message: "${testCase.message}"`);
      console.log(`Expected Intent: ${testCase.expectedIntent}`);
      
      const result = await aiAssistant.analyzeUserIntent(testCase.message, mockUser);
      
      console.log(`Actual Intent: ${result.intent}`);
      console.log(`Confidence: ${result.confidence}`);
      console.log(`Extracted Data:`, result.extractedData || 'None');
      console.log(`Response: ${result.response || 'None'}`);
      
      if (result.intent === testCase.expectedIntent) {
        console.log('✅ PASS\n');
      } else {
        console.log('❌ FAIL\n');
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}\n`);
    }
  }

  console.log('🎉 Test completed!');
}

// Run the test
testFixes().catch(console.error);

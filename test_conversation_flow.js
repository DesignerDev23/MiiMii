const messageProcessor = require('./src/services/messageProcessor');
const aiAssistant = require('./src/services/aiAssistant');

// Test improved conversation flow
async function testConversationFlow() {
  console.log('🧪 Testing Improved Conversation Flow\n');

  // Test cases for different transfer scenarios
  const testCases = [
    {
      name: "Complete Bank Transfer",
      message: "Send 1000 to 1001011000 test bank John Doe",
      expectedBehavior: "Should process bank transfer and ask for PIN"
    },
    {
      name: "P2P Transfer with Phone Number",
      message: "Send 100 to 9072874728 Musa Abdulkadir opay",
      expectedBehavior: "Should guide user to provide bank details"
    },
    {
      name: "Incomplete Transfer Request",
      message: "Send money to John",
      expectedBehavior: "Should ask for more details with examples"
    },
    {
      name: "Transfer with Just Phone Number",
      message: "9072874728\nOpay",
      expectedBehavior: "Should ask for amount and bank details"
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n--- Testing: ${testCase.name} ---`);
      console.log(`Message: "${testCase.message}"`);
      console.log(`Expected: ${testCase.expectedBehavior}`);
      
      // Test AI intent analysis
      const aiAnalysis = await aiAssistant.analyzeUserIntent(testCase.message);
      console.log(`AI Intent: ${aiAnalysis.intent} (confidence: ${aiAnalysis.confidence})`);
      console.log(`Extracted Data:`, aiAnalysis.extractedData);
      
      if (aiAnalysis.response) {
        console.log(`AI Response: ${aiAnalysis.response}`);
      }
      
      console.log('✅ Test completed successfully');
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }

  // Test conversation flow with mock user
  console.log('\n--- Testing Conversation Flow with Mock User ---');
  
  const mockUser = {
    id: 'f011426a-0a1a-4910-a784-238313321d34',
    whatsappNumber: '2349072874728',
    firstName: 'John',
    lastName: 'Doe',
    onboardingStep: 'completed',
    conversationState: null,
    updateConversationState: async (state) => {
      console.log('✅ updateConversationState called with:', state);
    },
    clearConversationState: async () => {
      console.log('✅ clearConversationState called');
    }
  };

  const testMessages = [
    "Send 100 to 9072874728 Musa Abdulkadir opay",
    "Send 1000 to 1001011000 test bank John Doe"
  ];

  for (const message of testMessages) {
    try {
      console.log(`\nTesting message: "${message}"`);
      const mockMessage = { text: message };
      
      // Test transfer intent handling
      await messageProcessor.handleTransferIntent(mockUser, mockMessage, 'text');
      
      console.log('✅ Transfer intent handled successfully');
    } catch (error) {
      console.log(`❌ Transfer intent failed: ${error.message}`);
    }
  }

  console.log('\n🎉 Conversation flow test completed!');
}

// Run the test
testConversationFlow().catch(console.error);

const aiAssistantService = require('./src/services/aiAssistant');
const userService = require('./src/services/user');

async function testBankTransfer() {
  try {
    console.log('🧪 Testing Simplified Bank Transfer Functionality\n');

    // Test messages
    const testMessages = [
      'send 4k to 9072874728 Opay Bank',
      'send 4000 to 9072874728 Opay',
      'transfer 5k to 1001011000 test bank',
      'send 10k to 0123456789 GTBank',
      'transfer 2000 to 9876543210 Access Bank'
    ];

    // Create a test user
    const testUser = {
      id: 'test-user-123',
      whatsappNumber: '08123456789',
      firstName: 'Test',
      lastName: 'User',
      onboardingStep: 'completed',
      canPerformTransactions: () => true,
      updateConversationState: async (state) => {
        console.log('📝 Conversation state updated:', JSON.stringify(state, null, 2));
      },
      clearConversationState: async () => {
        console.log('🗑️ Conversation state cleared');
      }
    };

    for (const message of testMessages) {
      console.log(`\n📨 Testing message: "${message}"`);
      console.log('─'.repeat(50));

      try {
        // Test intent analysis
        console.log('🔍 Analyzing intent...');
        const intentAnalysis = await aiAssistantService.analyzeUserIntent(message, testUser);
        console.log('✅ Intent Analysis Result:');
        console.log(`   Intent: ${intentAnalysis.intent}`);
        console.log(`   Confidence: ${intentAnalysis.confidence}`);
        console.log(`   Extracted Data:`, intentAnalysis.extractedData || 'None');

        // Test intent processing
        if (intentAnalysis.intent === 'bank_transfer') {
          console.log('\n💳 Processing bank transfer...');
          const result = await aiAssistantService.processIntent(intentAnalysis, testUser, message);
          console.log('✅ Bank Transfer Result:');
          console.log(`   Intent: ${result.intent}`);
          console.log(`   Message: ${result.message}`);
          console.log(`   Awaiting Input: ${result.awaitingInput || 'None'}`);
          if (result.transactionDetails) {
            console.log(`   Transaction Details:`, result.transactionDetails);
          }
        }

      } catch (error) {
        console.error('❌ Error processing message:', error.message);
      }
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testBankTransfer();

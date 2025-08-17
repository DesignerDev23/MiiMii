const aiAssistantService = require('./src/services/aiAssistant');

async function testAIExtraction() {
  try {
    console.log('🧪 Testing AI Extraction for Bank Transfer\n');

    // Test message
    const testMessage = 'Send 100 naira to 6035745691 keystone bank';
    
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

    console.log(`📨 Testing message: "${testMessage}"`);
    console.log('─'.repeat(50));

    // Test intent analysis
    console.log('🔍 Analyzing intent...');
    const intentAnalysis = await aiAssistantService.analyzeUserIntent(testMessage, testUser);
    console.log('✅ Intent Analysis Result:');
    console.log(JSON.stringify(intentAnalysis, null, 2));

    // Test intent processing
    if (intentAnalysis.intent === 'bank_transfer') {
      console.log('\n💳 Processing bank transfer...');
      const result = await aiAssistantService.processIntent(intentAnalysis, testUser, testMessage);
      console.log('✅ Bank Transfer Result:');
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testAIExtraction();

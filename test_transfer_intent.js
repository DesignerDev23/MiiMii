// Test script to verify AI transfer intent detection
const aiAssistant = require('./src/services/aiAssistant');

async function testTransferIntent() {
  console.log('🧪 Testing AI Transfer Intent Detection...\n');
  
  const testMessage = "Send 5k to Abdulkadir Musa 6035745691 keystone bank";
  console.log(`📝 Test Message: "${testMessage}"\n`);
  
  try {
    // Create a mock user for testing
    const mockUser = {
      id: 'test-user-id',
      whatsappNumber: '+2349072874728',
      firstName: 'Designer',
      onboardingStep: 'completed',
      canPerformTransactions: () => true
    };
    
    console.log('🔍 Analyzing intent with AI...');
    const intentAnalysis = await aiAssistant.analyzeUserIntent(testMessage, mockUser);
    
    console.log('📊 AI Analysis Result:');
    console.log(`  Intent: ${intentAnalysis.intent}`);
    console.log(`  Confidence: ${intentAnalysis.confidence}`);
    console.log(`  Suggested Action: ${intentAnalysis.suggestedAction}`);
    console.log(`  Reasoning: ${intentAnalysis.reasoning || 'N/A'}`);
    
    // Test the full processing
    console.log('\n🔄 Testing full message processing...');
    const processingResult = await aiAssistant.processUserMessage(
      mockUser.whatsappNumber,
      testMessage,
      'text'
    );
    
    console.log('📋 Processing Result:');
    console.log(`  Success: ${processingResult.success}`);
    if (processingResult.success) {
      console.log(`  Intent: ${processingResult.result.intent}`);
      console.log(`  Message: ${processingResult.result.message?.substring(0, 100)}...`);
      console.log(`  Requires Action: ${processingResult.result.requiresAction}`);
      console.log(`  Awaiting Input: ${processingResult.result.awaitingInput || 'N/A'}`);
    } else {
      console.log(`  Error: ${processingResult.error}`);
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTransferIntent().catch(console.error);

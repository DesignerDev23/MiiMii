const messageProcessor = require('./src/services/messageProcessor');

// Test the PIN verification fix
async function testPinFix() {
  console.log('🧪 Testing PIN Verification Fix\n');

  // Mock user with conversation state
  const mockUser = {
    id: 'f011426a-0a1a-4910-a784-238313321d34',
    whatsappNumber: '2349072874728',
    firstName: 'John',
    lastName: 'Doe',
    onboardingStep: 'completed',
    conversationState: {
      intent: 'bank_transfer',
      awaitingInput: 'pin_for_transfer',
      context: 'bank_transfer_pin',
      step: 1,
      data: {
        accountNumber: '1001011000',
        bankCode: '010',
        bankName: 'test bank',
        amount: 5000,
        recipientName: 'TEST ACCOUNT HOLDER',
        narration: 'Wallet transfer',
        reference: 'TXN1234567890'
      }
    },
    updateConversationState: async (state) => {
      console.log('✅ updateConversationState called with:', state);
    },
    clearConversationState: async () => {
      console.log('✅ clearConversationState called');
    }
  };

  // Mock message
  const mockMessage = {
    text: '0550'
  };

  try {
    console.log('Testing PIN verification with conversation state...');
    console.log('User conversation state:', mockUser.conversationState);
    console.log('Message:', mockMessage.text);
    
    // This should trigger PIN verification
    await messageProcessor.handleCompletedUserMessage(mockUser, mockMessage, 'text');
    
    console.log('✅ PIN verification test completed successfully');
  } catch (error) {
    console.log('❌ PIN verification test failed:', error.message);
  }

  console.log('\n🎉 Test completed!');
}

// Run the test
testPinFix().catch(console.error);

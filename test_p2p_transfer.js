const messageProcessor = require('./src/services/messageProcessor');

// Test P2P transfer PIN verification
async function testP2PTransfer() {
  console.log('🧪 Testing P2P Transfer PIN Verification\n');

  // Mock user with P2P transfer conversation state
  const mockUser = {
    id: 'f011426a-0a1a-4910-a784-238313321d34',
    whatsappNumber: '2349072874728',
    firstName: 'John',
    lastName: 'Doe',
    onboardingStep: 'completed',
    conversationState: {
      intent: 'transfer',
      awaitingInput: 'pin_for_transfer',
      context: 'transfer_pin',
      step: 1,
      data: {
        phoneNumber: '9072874728',
        amount: 100,
        recipientName: 'Musa Abdulkadir',
        narration: 'P2P transfer',
        reference: 'TXN1755010365921'
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
    console.log('Testing P2P transfer PIN verification...');
    console.log('User conversation state:', mockUser.conversationState);
    console.log('Message:', mockMessage.text);
    
    // Test PIN verification detection
    const hasValidTransferData = mockUser.conversationState?.data?.amount && 
      (mockUser.conversationState?.data?.accountNumber || mockUser.conversationState?.data?.phoneNumber);
    
    console.log('Has valid transfer data?', hasValidTransferData);
    console.log('Has amount?', !!mockUser.conversationState?.data?.amount);
    console.log('Has phone number?', !!mockUser.conversationState?.data?.phoneNumber);
    console.log('Has account number?', !!mockUser.conversationState?.data?.accountNumber);
    
    // This should trigger PIN verification
    await messageProcessor.handleCompletedUserMessage(mockUser, mockMessage, 'text');
    
    console.log('✅ P2P transfer PIN verification test completed successfully');
  } catch (error) {
    console.log('❌ P2P transfer PIN verification test failed:', error.message);
  }

  console.log('\n🎉 Test completed!');
}

// Run the test
testP2PTransfer().catch(console.error);

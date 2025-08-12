// Test conversation state storage and retrieval
async function testConversationState() {
  console.log('🧪 Testing Conversation State\n');

  // Mock user with updateConversationState method
  const mockUser = {
    id: 'f011426a-0a1a-4910-a784-238313321d34',
    whatsappNumber: '2349072874728',
    firstName: 'John',
    lastName: 'Doe',
    onboardingStep: 'completed',
    conversationState: null,
    updateConversationState: async function(state) {
      this.conversationState = state;
      console.log('✅ Conversation state updated:', state);
    },
    clearConversationState: async function() {
      this.conversationState = null;
      console.log('✅ Conversation state cleared');
    }
  };

  // Test storing conversation state
  console.log('1. Testing conversation state storage...');
  const testState = {
    intent: 'transfer',
    awaitingInput: 'pin_for_transfer',
    context: 'transfer_pin',
    step: 1,
    data: {
      phoneNumber: '9072874728',
      amount: 100,
      recipientName: 'Musa Abdulkadir',
      narration: 'P2P transfer',
      reference: 'TXN1234567890'
    }
  };

  await mockUser.updateConversationState(testState);
  console.log('Current conversation state:', mockUser.conversationState);

  // Test PIN verification detection
  console.log('\n2. Testing PIN verification detection...');
  const isPinVerification = mockUser.conversationState?.awaitingInput === 'pin_verification' || 
                           mockUser.conversationState?.awaitingInput === 'pin_for_transfer';
  
  console.log('Is PIN verification?', isPinVerification);
  console.log('Awaiting input:', mockUser.conversationState?.awaitingInput);
  console.log('Has data?', !!mockUser.conversationState?.data);
  console.log('Has amount?', !!mockUser.conversationState?.data?.amount);
  console.log('Has account number?', !!mockUser.conversationState?.data?.accountNumber);

  // Test clearing conversation state
  console.log('\n3. Testing conversation state clearing...');
  await mockUser.clearConversationState();
  console.log('Conversation state after clearing:', mockUser.conversationState);

  console.log('\n🎉 Conversation state test completed!');
}

// Run the test
testConversationState().catch(console.error);

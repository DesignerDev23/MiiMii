const messageProcessor = require('./src/services/messageProcessor');
const bankTransferService = require('./src/services/bankTransfer');

// Test real money transfer flow
async function testRealTransfer() {
  console.log('🧪 Testing Real Money Transfer Flow\n');

  // Mock user with sufficient wallet balance
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

  // Test cases
  const testCases = [
    {
      name: "Bank Transfer with Complete Details",
      message: "Send 1000 to 1001011000 test bank John Doe",
      expectedBehavior: "Should process bank transfer via BellBank API"
    },
    {
      name: "P2P Transfer without Bank Details",
      message: "Send 100 to 9072874728 Musa Abdulkadir opay",
      expectedBehavior: "Should ask for bank details"
    },
    {
      name: "Bank Transfer with Real Bank",
      message: "Send 500 to 1234567890 GTBank Jane Smith",
      expectedBehavior: "Should process bank transfer via BellBank API"
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n--- Testing: ${testCase.name} ---`);
      console.log(`Message: "${testCase.message}"`);
      console.log(`Expected: ${testCase.expectedBehavior}`);
      
      const mockMessage = { text: testCase.message };
      
      // Test the transfer intent handling
      await messageProcessor.handleTransferIntent(mockUser, mockMessage, 'text');
      
      console.log('✅ Test completed successfully');
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }

  // Test PIN verification with bank transfer data
  console.log('\n--- Testing PIN Verification with Bank Transfer ---');
  
  const mockUserWithTransferState = {
    ...mockUser,
    conversationState: {
      intent: 'bank_transfer',
      awaitingInput: 'pin_for_transfer',
      context: 'bank_transfer_pin',
      step: 1,
      data: {
        accountNumber: '1001011000',
        bankCode: '010',
        bankName: 'test bank',
        amount: 1000,
        recipientName: 'John Doe',
        narration: 'Wallet transfer',
        reference: 'TXN1234567890'
      }
    }
  };

  const pinMessage = { text: '0550' };

  try {
    console.log('Testing PIN verification with bank transfer data...');
    await messageProcessor.handlePinVerification(mockUserWithTransferState, pinMessage, 'text');
    console.log('✅ PIN verification test completed');
  } catch (error) {
    console.log(`❌ PIN verification test failed: ${error.message}`);
  }

  console.log('\n🎉 Real money transfer flow test completed!');
}

// Run the test
testRealTransfer().catch(console.error);

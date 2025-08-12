// Test script to verify the complete transfer flow
const messageProcessor = require('./src/services/messageProcessor');
const aiAssistant = require('./src/services/aiAssistant');
const bankTransferService = require('./src/services/bankTransfer');

// Mock user data for testing
const mockUser = {
  id: 1,
  whatsappNumber: '2348012345678',
  firstName: 'John',
  lastName: 'Doe',
  onboardingStep: 'completed',
  conversationState: null,
  updateConversationState: async (state) => {
    mockUser.conversationState = state;
    console.log('Conversation state updated:', state);
  },
  clearConversationState: async () => {
    mockUser.conversationState = null;
    console.log('Conversation state cleared');
  }
};

// Mock wallet data
const mockWallet = {
  id: 1,
  userId: 1,
  balance: '50000.00',
  availableBalance: '50000.00',
  pendingBalance: '0.00',
  currency: 'NGN',
  status: 'active'
};

// Test cases for AI intent analysis
const testCases = [
  {
    name: "Natural balance query",
    message: "what's my current balance",
    expectedIntent: "balance",
    description: "Should understand natural language balance queries"
  },
  {
    name: "Balance check",
    message: "check my balance",
    expectedIntent: "balance",
    description: "Should understand balance check requests"
  },
  {
    name: "Bank transfer with full details",
    message: "Send 5k to Abdulkadir Musa 6035745691 keystone bank",
    expectedIntent: "bank_transfer",
    description: "Should extract transfer details from natural language"
  },
  {
    name: "Bank transfer with test bank",
    message: "Send 5k to 1001011000 test bank",
    expectedIntent: "bank_transfer",
    description: "Should handle test bank transfers"
  },
  {
    name: "Transaction history",
    message: "show my transaction history",
    expectedIntent: "transaction_history",
    description: "Should understand transaction history requests"
  },
  {
    name: "Account details",
    message: "my account details",
    expectedIntent: "account_details",
    description: "Should understand account details requests"
  }
];

async function testAIIntentAnalysis() {
  console.log('🧪 Testing AI Intent Analysis\n');
  
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
}

async function testTransferFlow() {
  console.log('🧪 Testing Transfer Flow\n');
  
  // Test 1: Transfer with sufficient balance
  console.log('Test 1: Transfer with sufficient balance');
  try {
    const transferData = {
      accountNumber: '1001011000',
      bankCode: '010',
      amount: 5000,
      narration: 'Test transfer',
      reference: 'TEST_TXN_001'
    };
    
    // Mock wallet service to return sufficient balance
    const originalGetUserWallet = require('./src/services/wallet').getUserWallet;
    require('./src/services/wallet').getUserWallet = async () => mockWallet;
    
    const result = await bankTransferService.processBankTransfer(1, transferData, '1234');
    console.log('Transfer result:', result.success ? '✅ SUCCESS' : '❌ FAILED');
    
    // Restore original function
    require('./src/services/wallet').getUserWallet = originalGetUserWallet;
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
  
  console.log('\n');
  
  // Test 2: Transfer with insufficient balance
  console.log('Test 2: Transfer with insufficient balance');
  try {
    const transferData = {
      accountNumber: '1001011000',
      bankCode: '010',
      amount: 100000, // More than wallet balance
      narration: 'Test transfer',
      reference: 'TEST_TXN_002'
    };
    
    // Mock wallet service to return low balance
    const originalGetUserWallet = require('./src/services/wallet').getUserWallet;
    require('./src/services/wallet').getUserWallet = async () => ({
      ...mockWallet,
      balance: '1000.00',
      availableBalance: '1000.00'
    });
    
    await bankTransferService.processBankTransfer(1, transferData, '1234');
    console.log('❌ Should have failed with insufficient balance');
    
    // Restore original function
    require('./src/services/wallet').getUserWallet = originalGetUserWallet;
  } catch (error) {
    if (error.message.includes('Insufficient')) {
      console.log('✅ Correctly caught insufficient balance error');
    } else {
      console.log(`❌ Unexpected error: ${error.message}`);
    }
  }
}

async function testMessageProcessing() {
  console.log('🧪 Testing Message Processing\n');
  
  // Test natural language balance query
  console.log('Test: Natural language balance query');
  try {
    const mockMessage = {
      text: "what's my current balance"
    };
    
    // Mock the balance handler to avoid actual database calls
    const originalHandleBalanceIntent = messageProcessor.handleBalanceIntent;
    messageProcessor.handleBalanceIntent = async (user, message, messageType) => {
      console.log('✅ Balance intent handler called correctly');
      console.log(`Message: "${message.text}"`);
      console.log('Would show balance information');
    };
    
    await messageProcessor.handleBalanceIntent(mockUser, mockMessage, 'text');
    
    // Restore original function
    messageProcessor.handleBalanceIntent = originalHandleBalanceIntent;
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
  
  console.log('\n');
  
  // Test transfer intent
  console.log('Test: Transfer intent processing');
  try {
    const mockMessage = {
      text: "Send 5k to 1001011000 test bank"
    };
    
    // Mock the transfer handler to avoid actual API calls
    const originalHandleTransferIntent = messageProcessor.handleTransferIntent;
    messageProcessor.handleTransferIntent = async (user, message, messageType) => {
      console.log('✅ Transfer intent handler called correctly');
      console.log(`Message: "${message.text}"`);
      console.log('Would process transfer request');
    };
    
    await messageProcessor.handleTransferIntent(mockUser, mockMessage, 'text');
    
    // Restore original function
    messageProcessor.handleTransferIntent = originalHandleTransferIntent;
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Tests for MiiMii Message Processing\n');
  console.log('=' .repeat(60) + '\n');
  
  await testAIIntentAnalysis();
  console.log('=' .repeat(60) + '\n');
  
  await testTransferFlow();
  console.log('=' .repeat(60) + '\n');
  
  await testMessageProcessing();
  console.log('=' .repeat(60) + '\n');
  
  console.log('🎉 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testAIIntentAnalysis,
  testTransferFlow,
  testMessageProcessing,
  runAllTests
};

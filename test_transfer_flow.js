// Test script to verify the complete transfer flow
const aiAssistant = require('./src/services/aiAssistant');
const bankTransferService = require('./src/services/bankTransfer');

async function testTransferFlow() {
  console.log('🧪 Testing Complete Transfer Flow...\n');
  
  const testMessages = [
    "Send 5k to Abdulkadir Musa 6035745691 keystone bank",
    "Send 5k to John doe 1000006362 test bank",
    "Transfer 10000 to 1234567890 GTBank"
  ];
  
  for (const testMessage of testMessages) {
    console.log(`📝 Testing: "${testMessage}"\n`);
    
    try {
      // Create a mock user for testing
      const mockUser = {
        id: 'test-user-id',
        whatsappNumber: '+2349072874728',
        firstName: 'Designer',
        onboardingStep: 'completed',
        canPerformTransactions: () => true,
        updateConversationState: async (state) => {
          console.log('  💾 Conversation state updated:', state);
        }
      };
      
      // Test AI Analysis
      console.log('🔍 Step 1: AI Intent Analysis');
      const intentAnalysis = await aiAssistant.analyzeUserIntent(testMessage, mockUser);
      
      console.log('  AI Result:');
      console.log(`    Intent: ${intentAnalysis.intent}`);
      console.log(`    Confidence: ${intentAnalysis.confidence}`);
      console.log(`    Extracted Data:`, intentAnalysis.extractedData || 'None');
      
      // Test Account Validation
      if (intentAnalysis.intent === 'bank_transfer' && intentAnalysis.extractedData) {
        console.log('\n🔍 Step 2: Account Validation');
        const { accountNumber, bankName } = intentAnalysis.extractedData;
        
        if (accountNumber && bankName) {
          // Map bank name to code
          const bankMap = {
            'keystone': '082', 'gtb': '058', 'gtbank': '058', 'access': '044', 'uba': '033', 
            'fidelity': '070', 'wema': '035', 'union': '032', 'fcmb': '214', 'first': '011', 
            'fbn': '011', 'zenith': '057', 'stanbic': '221', 'sterling': '232',
            'test': '000023', 'testbank': '000023'
          };
          
          const bankCode = bankMap[bankName.toLowerCase()];
          
          if (bankCode) {
            console.log(`    Bank Code: ${bankCode}`);
            
            try {
              const validation = await bankTransferService.validateBankAccount(accountNumber, bankCode);
              console.log('    Validation Result:', {
                valid: validation.valid,
                accountName: validation.accountName,
                bank: validation.bank,
                test: validation.test || false
              });
            } catch (error) {
              console.log('    Validation Error:', error.message);
            }
          } else {
            console.log('    ❌ Unknown bank name:', bankName);
          }
        }
      }
      
      // Test Full Processing
      console.log('\n🔄 Step 3: Full Message Processing');
      const processingResult = await aiAssistant.processUserMessage(
        mockUser.whatsappNumber,
        testMessage,
        'text'
      );
      
      console.log('  Processing Result:');
      console.log(`    Success: ${processingResult.success}`);
      if (processingResult.success) {
        console.log(`    Intent: ${processingResult.result.intent}`);
        console.log(`    Message: ${processingResult.result.message?.substring(0, 100)}...`);
        console.log(`    Requires Action: ${processingResult.result.requiresAction}`);
        console.log(`    Awaiting Input: ${processingResult.result.awaitingInput || 'N/A'}`);
      } else {
        console.log(`    Error: ${processingResult.error}`);
      }
      
    } catch (error) {
      console.error('  ❌ Test failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  console.log('✅ Transfer flow testing completed!');
}

// Run the test
testTransferFlow().catch(console.error);

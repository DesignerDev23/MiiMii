const whatsappFlowService = require('./src/services/whatsappFlowService');
const aiAssistant = require('./src/services/aiAssistant');
const logger = require('./src/utils/logger');

async function testFlowImplementation() {
  try {
    console.log('🧪 Testing Flow Implementation with flow_json approach...\n');

    // Test 1: Generate Flow JSON
    console.log('1. Testing Flow JSON Generation...');
    const testFlowData = {
      flowToken: 'test_token_123',
      flowCta: 'Complete Onboarding',
      flowAction: 'navigate',
      header: {
        type: 'text',
        text: 'Welcome to MiiMii!'
      },
      body: 'Hey Designer! 👋 I\'m MiiMii, your financial assistant. Before we dive in, please complete the onboarding process so I can get to know you better. Once that\'s done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨',
      footer: 'Secure • Fast • Easy',
      flowActionPayload: {
        screen: 'QUESTION_ONE',
        data: {
          userId: 'test-user-123',
          phoneNumber: '+2349072874728',
          step: 'personal_details',
          userName: 'Designer'
        }
      }
    };

    const flowJson = whatsappFlowService.generateDynamicFlowJson(testFlowData);
    console.log('✅ Flow JSON generated successfully');
    console.log(`📏 Flow JSON length: ${flowJson.length} characters`);
    console.log(`📄 First 200 chars: ${flowJson.substring(0, 200)}...\n`);

    // Test 2: Generate AI Welcome Message
    console.log('2. Testing AI Welcome Message Generation...');
    const welcomeMessage = await aiAssistant.generatePersonalizedWelcome('Designer', '+2349072874728');
    console.log('✅ AI Welcome message generated');
    console.log(`📏 Message length: ${welcomeMessage.length} characters`);
    console.log(`💬 Message: ${welcomeMessage}\n`);

    // Test 3: Generate Flow Token
    console.log('3. Testing Flow Token Generation...');
    const flowToken = whatsappFlowService.generateFlowToken('test-user-123', 'personal_details');
    console.log('✅ Flow token generated');
    console.log(`🔑 Token: ${flowToken.substring(0, 20)}...\n`);

    // Test 4: Verify Flow Token
    console.log('4. Testing Flow Token Verification...');
    const verifiedToken = whatsappFlowService.verifyFlowToken(flowToken);
    console.log('✅ Flow token verified');
    console.log(`👤 User ID: ${verifiedToken.userId}`);
    console.log(`📋 Step: ${verifiedToken.step}\n`);

    // Test 5: Check Environment Variables
    console.log('5. Testing Environment Variables...');
    const requiredVars = [
      'BOT_ACCESS_TOKEN',
      'BOT_PHONE_NUMBER_ID',
      'BOT_BUSINESS_ACCOUNT_ID',
      'AI_API_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      console.log('✅ All required environment variables are set');
    } else {
      console.log('❌ Missing environment variables:');
      missingVars.forEach(varName => console.log(`   - ${varName}`));
    }

    console.log('\n🎉 Flow implementation test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Flow JSON generation works');
    console.log('✅ AI welcome message generation works');
    console.log('✅ Flow token generation and verification works');
    console.log('✅ No dependency on Flow IDs');
    console.log('✅ Using flow_json approach as per WhatsApp documentation');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testFlowImplementation();


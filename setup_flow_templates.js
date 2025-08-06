const axios = require('axios');
const logger = require('./src/utils/logger');

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://api.chatmiimii.com';
const TEST_PHONE = process.env.TEST_PHONE || '+2348012345678';

async function setupFlowTemplates() {
  try {
    console.log('🚀 Setting up WhatsApp Flow templates...');
    
    // Create Flow templates
    console.log('📝 Creating Flow templates...');
    const createResponse = await axios.post(`${BASE_URL}/api/whatsapp/create-flow-templates`, {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (createResponse.data.success) {
      console.log('✅ Flow templates created successfully');
      console.log('📋 Templates:', JSON.stringify(createResponse.data.templates, null, 2));
      
      // Store template IDs in environment variables
      const templates = createResponse.data.templates;
      console.log('\n📋 Environment variables to set:');
      console.log(`WHATSAPP_ONBOARDING_FLOW_ID=${templates.onboarding.id}`);
      console.log(`WHATSAPP_LOGIN_FLOW_ID=${templates.login.id}`);
      
      return templates;
    } else {
      throw new Error('Failed to create templates');
    }
  } catch (error) {
    console.error('❌ Failed to create Flow templates:', error.response?.data || error.message);
    throw error;
  }
}

async function testOnboardingFlow() {
  try {
    console.log('\n🧪 Testing onboarding Flow...');
    
    const flowResponse = await axios.post(`${BASE_URL}/api/whatsapp/send-flow-message`, {
      to: TEST_PHONE,
      flowType: 'onboarding'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (flowResponse.data.success) {
      console.log('✅ Onboarding Flow message sent successfully');
      console.log('📱 Message ID:', flowResponse.data.messageId);
      console.log('🔑 Flow Token:', flowResponse.data.flowToken);
    } else {
      throw new Error('Failed to send onboarding Flow message');
    }
  } catch (error) {
    console.error('❌ Failed to test onboarding Flow:', error.response?.data || error.message);
    throw error;
  }
}

async function testLoginFlow() {
  try {
    console.log('\n🧪 Testing login Flow...');
    
    const flowResponse = await axios.post(`${BASE_URL}/api/whatsapp/send-flow-message`, {
      to: TEST_PHONE,
      flowType: 'login'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (flowResponse.data.success) {
      console.log('✅ Login Flow message sent successfully');
      console.log('📱 Message ID:', flowResponse.data.messageId);
      console.log('🔑 Flow Token:', flowResponse.data.flowToken);
    } else {
      throw new Error('Failed to send login Flow message');
    }
  } catch (error) {
    console.error('❌ Failed to test login Flow:', error.response?.data || error.message);
    throw error;
  }
}

async function testWelcomeMessage() {
  try {
    console.log('\n🧪 Testing welcome message...');
    
    const welcomeResponse = await axios.post(`${BASE_URL}/api/whatsapp/test-interactive-bot`, {
      to: TEST_PHONE,
      testScenario: 'welcome_new_user'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (welcomeResponse.data.success) {
      console.log('✅ Welcome message sent successfully');
      console.log('📱 Message ID:', welcomeResponse.data.messageId);
    } else {
      throw new Error('Failed to send welcome message');
    }
  } catch (error) {
    console.error('❌ Failed to test welcome message:', error.response?.data || error.message);
    throw error;
  }
}

async function testFlowWebhook() {
  try {
    console.log('\n🧪 Testing Flow webhook processing...');
    
    // Simulate Flow webhook data
    const mockFlowData = {
      flow_token: 'test_user_123_1234567890_abcdef123456_abc123',
      screen: 'PERSONAL_DETAILS_SCREEN',
      data: {
        first_name: 'John',
        last_name: 'Doe',
        middle_name: 'Smith',
        date_of_birth: '1990-01-01',
        gender: 'male'
      }
    };
    
    const webhookResponse = await axios.post(`${BASE_URL}/api/whatsapp/test-flow-webhook`, {
      flowData: mockFlowData
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (webhookResponse.data.success) {
      console.log('✅ Flow webhook processed successfully');
      console.log('📋 Result:', JSON.stringify(webhookResponse.data.result, null, 2));
    } else {
      throw new Error('Failed to process Flow webhook');
    }
  } catch (error) {
    console.error('❌ Failed to test Flow webhook:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🎯 MiiMii WhatsApp Flow Setup & Testing');
    console.log('==========================================');
    
    // Check if we're testing locally or production
    const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    console.log(`🌍 Environment: ${isLocal ? 'Local' : 'Production'}`);
    console.log(`🔗 Base URL: ${BASE_URL}`);
    console.log(`📱 Test Phone: ${TEST_PHONE}`);
    
    // Setup Flow templates
    const templates = await setupFlowTemplates();
    
    // Test welcome message
    await testWelcomeMessage();
    
    // Test onboarding Flow
    await testOnboardingFlow();
    
    // Test login Flow
    await testLoginFlow();
    
    // Test Flow webhook processing
    await testFlowWebhook();
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Set the environment variables shown above');
    console.log('2. Configure your WhatsApp webhook to point to your webhook endpoint');
    console.log('3. Test the complete flow with real users');
    console.log('4. Monitor the webhook logs for any issues');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  setupFlowTemplates,
  testOnboardingFlow,
  testLoginFlow,
  testWelcomeMessage,
  testFlowWebhook
}; 
const axios = require('axios');

async function testWebhook() {
  console.log('🔍 Testing WhatsApp Webhook Configuration...\n');

  const baseUrl = 'https://api.chatmiimii.com';
  
  try {
    // 1. Test webhook verification endpoint
    console.log('1. Testing webhook verification endpoint...');
    try {
      const verifyResponse = await axios.get(`${baseUrl}/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test`, {
        timeout: 10000
      });
      console.log('✅ Webhook verification endpoint is accessible');
      console.log('   Status:', verifyResponse.status);
      console.log('   Response:', verifyResponse.data);
    } catch (error) {
      console.log('❌ Webhook verification failed:', error.message);
      if (error.response?.status === 403) {
        console.log('   → Webhook verification token is incorrect (this is expected with test token)');
      }
    }

    // 2. Test webhook POST endpoint with mock data
    console.log('\n2. Testing webhook POST endpoint...');
    try {
      const mockWebhookData = {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'test-entry-id',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: 'test-phone-id'
              },
              contacts: [{
                profile: {
                  name: 'Test User'
                },
                wa_id: '1234567890'
              }],
              messages: [{
                from: '1234567890',
                id: 'test-message-id',
                timestamp: '1234567890',
                type: 'text',
                text: {
                  body: 'Hello, this is a test message'
                }
              }]
            },
            field: 'messages'
          }]
        }]
      };

      const webhookResponse = await axios.post(`${baseUrl}/api/webhook/whatsapp`, mockWebhookData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Webhook POST endpoint is accessible');
      console.log('   Status:', webhookResponse.status);
      console.log('   Response:', webhookResponse.data);
    } catch (error) {
      console.log('❌ Webhook POST failed:', error.message);
      if (error.response) {
        console.log('   Status:', error.response.status);
        console.log('   Response:', error.response.data);
      }
    }

    // 3. Test server health
    console.log('\n3. Testing server health...');
    try {
      const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 10000 });
      console.log('✅ Server is healthy');
      console.log('   Status:', healthResponse.status);
      console.log('   Response:', healthResponse.data);
    } catch (error) {
      console.log('❌ Server health check failed:', error.message);
    }

    // 4. Test environment variables
    console.log('\n4. Testing environment variables...');
    try {
      const envResponse = await axios.get(`${baseUrl}/api/test/env/check`, { timeout: 10000 });
      console.log('✅ Environment check successful');
      
      const env = envResponse.data.environment;
      console.log('   BOT_ACCESS_TOKEN:', env.BOT_ACCESS_TOKEN);
      console.log('   BOT_PHONE_NUMBER_ID:', env.BOT_PHONE_NUMBER_ID);
      console.log('   BOT_WEBHOOK_VERIFY_TOKEN:', env.BOT_WEBHOOK_VERIFY_TOKEN);
      
      if (env.BOT_ACCESS_TOKEN === 'Not set') {
        console.log('   ⚠️  WhatsApp access token is not configured');
      } else {
        console.log('   ✅ WhatsApp access token is configured');
      }
    } catch (error) {
      console.log('❌ Environment check failed:', error.message);
    }

  } catch (error) {
    console.error('❌ Webhook test failed:', error.message);
  }

  console.log('\n📋 Webhook Configuration Summary:');
  console.log('✅ Webhook URL: https://api.chatmiimii.com/api/webhook/whatsapp');
  console.log('✅ GET endpoint: /api/webhook/whatsapp (for verification)');
  console.log('✅ POST endpoint: /api/webhook/whatsapp (for incoming messages)');
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Configure webhook URL in WhatsApp Business API:');
  console.log('   https://api.chatmiimii.com/api/webhook/whatsapp');
  console.log('2. Set webhook verification token to match BOT_WEBHOOK_VERIFY_TOKEN');
  console.log('3. Test with a real WhatsApp message');
}

testWebhook().catch(console.error); 
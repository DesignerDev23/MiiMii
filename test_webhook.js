const axios = require('axios');

async function testWebhook() {
  try {
    console.log('🔍 Testing WhatsApp webhook...');
    
    const webhookData = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '123456789',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: '123456789'
            },
            contacts: [{
              profile: {
                name: 'Test User'
              },
              wa_id: '+2348012345678'
            }],
            messages: [{
              from: '+2348012345678',
              id: 'test_message_id',
              timestamp: Math.floor(Date.now() / 1000),
              type: 'text',
              text: {
                body: 'Hello'
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };

    console.log('📤 Sending webhook data...');
    console.log('📋 Webhook URL: https://api.chatmiimii.com/webhook/whatsapp');
    
    const response = await axios.post('https://api.chatmiimii.com/webhook/whatsapp', webhookData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ Webhook test successful!');
    console.log('📊 Response status:', response.status);
    console.log('📋 Response data:', response.data);
    
  } catch (error) {
    console.log('❌ Webhook test failed:');
    console.log('📊 Error status:', error.response?.status);
    console.log('📋 Error message:', error.response?.data || error.message);
    
    if (error.response?.status === 504) {
      console.log('⚠️  Gateway timeout - application might be restarting');
    }
  }
}

async function testWebhookVerification() {
  try {
    console.log('\n🔍 Testing webhook verification...');
    
    const response = await axios.get('https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=test_token', {
      timeout: 10000
    });

    console.log('✅ Webhook verification test successful!');
    console.log('📊 Response status:', response.status);
    console.log('📋 Response data:', response.data);
    
  } catch (error) {
    console.log('❌ Webhook verification test failed:');
    console.log('📊 Error status:', error.response?.status);
    console.log('📋 Error message:', error.response?.data || error.message);
  }
}

async function main() {
  console.log('🚀 MiiMii Webhook Test');
  console.log('======================');
  
  await testWebhookVerification();
  await testWebhook();
  
  console.log('\n✅ Test completed!');
}

if (require.main === module) {
  main();
}

module.exports = { testWebhook, testWebhookVerification }; 
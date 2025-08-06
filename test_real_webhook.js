const axios = require('axios');

async function testRealWebhook() {
  try {
    console.log('🔍 Testing with real webhook data...');
    
    // Using the exact webhook structure from the user's logs
    const webhookData = {
      "object": "whatsapp_business_account",
      "entry": [{
        "id": "123456789",
        "changes": [{
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15556613536",
              "phone_number_id": "755450640975332"
            },
            "contacts": [{
              "profile": {
                "name": "Designer"
              },
              "wa_id": "2349072874728"
            }],
            "messages": [{
              "from": "2349072874728",
              "id": "wamid.HBgNMjM0OTA3Mjg3NDcyOBUCABIYIEYzMzQ1QTkzMDg4RjNDMEM3N0UxMEJENTYxNUE5RERDAA==",
              "timestamp": "1754502167",
              "text": {
                "body": "Hi"
              },
              "type": "text"
            }]
          },
          "field": "messages"
        }]
      }]
    };

    console.log('📤 Sending real webhook data...');
    console.log('📋 Webhook URL: https://api.chatmiimii.com/webhook/whatsapp');
    console.log('📋 Message from: 2349072874728');
    console.log('📋 Message content: Hi');
    
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

async function main() {
  console.log('🚀 MiiMii Real Webhook Test');
  console.log('=============================');
  
  await testRealWebhook();
  
  console.log('\n✅ Test completed!');
}

if (require.main === module) {
  main();
}

module.exports = { testRealWebhook }; 
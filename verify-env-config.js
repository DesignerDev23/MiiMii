const axios = require('axios');

async function verifyEnvironmentConfig() {
  console.log('🔍 Verifying Environment Configuration...\n');

  try {
    // Test the health endpoint to see if server is running
    console.log('1. Testing server connectivity...');
    const healthResponse = await axios.get('https://api.chatmiimii.com/healthz', {
      timeout: 10000
    });
    console.log('✅ Server is running');
    console.log('   Status:', healthResponse.status);

    // Test detailed health endpoint
    console.log('\n2. Testing detailed health endpoint...');
    const detailedHealthResponse = await axios.get('https://api.chatmiimii.com/health', {
      timeout: 10000
    });
    console.log('✅ Detailed health check passed');
    console.log('   Response:', JSON.stringify(detailedHealthResponse.data, null, 2));

    // Test webhook endpoint
    console.log('\n3. Testing webhook endpoint...');
    try {
      const webhookResponse = await axios.get('https://api.chatmiimii.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test', {
        timeout: 10000
      });
      console.log('✅ Webhook endpoint is accessible');
      console.log('   Status:', webhookResponse.status);
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Webhook endpoint is accessible (403 is expected for wrong token)');
      } else {
        console.log('❌ Webhook endpoint failed:', error.message);
      }
    }

  } catch (error) {
    console.log('❌ Server connectivity failed:', error.message);
    console.log('   → Server might not be running or there are configuration issues');
  }
}

verifyEnvironmentConfig().catch(console.error); 
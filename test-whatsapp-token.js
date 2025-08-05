const axios = require('axios');

async function testWhatsAppToken() {
  try {
    console.log('Testing WhatsApp token on production...');
    
    // Test environment variables endpoint
    console.log('\n1. Checking environment variables...');
    try {
      const envResponse = await axios.get('https://api.chatmiimii.com/api/test/env/check');
      console.log('✅ Environment check successful');
      console.log('Environment variables:', JSON.stringify(envResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Environment check failed:', error.message);
      if (error.response) {
        console.log('Response:', error.response.data);
      }
    }
    
    // Test WhatsApp health check
    console.log('\n2. Testing WhatsApp health check...');
    try {
      const healthResponse = await axios.get('https://api.chatmiimii.com/api/test/whatsapp-health');
      console.log('✅ WhatsApp health check successful');
      console.log('WhatsApp health:', JSON.stringify(healthResponse.data, null, 2));
    } catch (error) {
      console.log('❌ WhatsApp health check failed:', error.message);
      if (error.response) {
        console.log('Response:', error.response.data);
      }
    }
    
    // Test direct WhatsApp token validation
    console.log('\n3. Testing direct WhatsApp token validation...');
    try {
      const tokenTestResponse = await axios.get('https://api.chatmiimii.com/api/test/whatsapp-token-test');
      console.log('✅ WhatsApp token test successful');
      console.log('WhatsApp token test:', JSON.stringify(tokenTestResponse.data, null, 2));
    } catch (error) {
      console.log('❌ WhatsApp token test failed:', error.message);
      if (error.response) {
        console.log('Response:', error.response.data);
      }
    }
    
    // Test general health endpoint
    console.log('\n4. Testing general health endpoint...');
    try {
      const generalHealthResponse = await axios.get('https://api.chatmiimii.com/health');
      console.log('✅ General health check successful');
      console.log('General health:', JSON.stringify(generalHealthResponse.data, null, 2));
    } catch (error) {
      console.log('❌ General health check failed:', error.message);
      if (error.response) {
        console.log('Response:', error.response.data);
      }
    }
    
  } catch (error) {
    console.error('Error testing WhatsApp token:', error.message);
  }
}

testWhatsAppToken(); 
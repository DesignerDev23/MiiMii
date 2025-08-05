const axios = require('axios');

async function testDigitalOceanEnvironment() {
  try {
    console.log('=== Testing Digital Ocean Environment Variables Only ===\n');
    
    // Test environment variables endpoint
    console.log('1. Checking environment variables from Digital Ocean...');
    try {
      const envResponse = await axios.get('https://api.chatmiimii.com/api/test/env/check');
      console.log('✅ Environment check successful');
      
      const env = envResponse.data.environment;
      console.log('\nEnvironment Variables Status:');
      console.log(`- NODE_ENV: ${env.NODE_ENV}`);
      console.log(`- WHATSAPP_ACCESS_TOKEN: ${env.WHATSAPP_ACCESS_TOKEN}`);
      console.log(`- WHATSAPP_ACCESS_TOKEN_LENGTH: ${env.WHATSAPP_ACCESS_TOKEN_LENGTH}`);
      console.log(`- WHATSAPP_ACCESS_TOKEN_PREFIX: ${env.WHATSAPP_ACCESS_TOKEN_PREFIX}`);
      console.log(`- WHATSAPP_PHONE_NUMBER_ID: ${env.WHATSAPP_PHONE_NUMBER_ID}`);
      console.log(`- DATABASE_URL: ${env.DATABASE_URL}`);
      console.log(`- JWT_SECRET: ${env.JWT_SECRET ? 'Set' : 'Not set'}`);
      
      // Check if we're getting real values or placeholders
      if (env.WHATSAPP_ACCESS_TOKEN_LENGTH === 26) {
        console.log('\n❌ ISSUE: Still getting placeholder values!');
        console.log('You need to update your Digital Ocean App Platform environment variables.');
      } else if (env.WHATSAPP_ACCESS_TOKEN_LENGTH > 200) {
        console.log('\n✅ SUCCESS: Getting real environment variables from Digital Ocean!');
      }
      
    } catch (error) {
      console.log('❌ Environment check failed:', error.message);
    }
    
    // Test WhatsApp health
    console.log('\n2. Testing WhatsApp health...');
    try {
      const healthResponse = await axios.get('https://api.chatmiimii.com/api/test/whatsapp-health');
      console.log('✅ WhatsApp health check successful');
      console.log('WhatsApp Health:', healthResponse.data.whatsappHealth);
    } catch (error) {
      console.log('❌ WhatsApp health check failed:', error.message);
    }
    
    console.log('\n=== Test Complete ===');
    console.log('\nIf you see placeholder values, update your Digital Ocean App Platform environment variables.');
    
  } catch (error) {
    console.error('Error testing Digital Ocean environment:', error.message);
  }
}

testDigitalOceanEnvironment(); 
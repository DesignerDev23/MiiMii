const axios = require('axios');
const logger = require('./src/utils/logger');

async function diagnoseWhatsAppIssues() {
  console.log('🔍 Diagnosing WhatsApp and Database Issues...\n');

  try {
    // 1. Test server connectivity
    console.log('1. Testing server connectivity...');
    try {
      const response = await axios.get('https://api.chatmiimii.com/health', { timeout: 10000 });
      console.log('✅ Server is reachable');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    } catch (error) {
      console.log('❌ Server connectivity failed:', error.message);
      if (error.code === 'ECONNREFUSED') {
        console.log('   → Server is not running or not accessible');
      } else if (error.code === 'ENOTFOUND') {
        console.log('   → DNS resolution failed');
      }
    }

    // 2. Test environment variables
    console.log('\n2. Testing environment variables...');
    try {
      const envResponse = await axios.get('https://api.chatmiimii.com/api/test/env/check', { timeout: 10000 });
      console.log('✅ Environment check successful');
      
      const env = envResponse.data.environment;
      console.log('   NODE_ENV:', env.NODE_ENV);
      console.log('   BOT_ACCESS_TOKEN:', env.BOT_ACCESS_TOKEN);
      console.log('   BOT_ACCESS_TOKEN_LENGTH:', env.BOT_ACCESS_TOKEN_LENGTH);
      console.log('   BOT_PHONE_NUMBER_ID:', env.BOT_PHONE_NUMBER_ID);
      console.log('   DB_CONNECTION_URL:', env.DB_CONNECTION_URL);
      
      if (env.BOT_ACCESS_TOKEN === 'Not set') {
        console.log('   ⚠️  WhatsApp access token is not configured');
      } else if (env.BOT_ACCESS_TOKEN_LENGTH < 100) {
        console.log('   ⚠️  WhatsApp access token seems too short');
      } else {
        console.log('   ✅ WhatsApp access token appears valid');
      }
    } catch (error) {
      console.log('❌ Environment check failed:', error.message);
    }

    // 3. Test WhatsApp health
    console.log('\n3. Testing WhatsApp service health...');
    try {
      const healthResponse = await axios.get('https://api.chatmiimii.com/api/test/whatsapp-health', { timeout: 10000 });
      console.log('✅ WhatsApp health check successful');
      
      const health = healthResponse.data.whatsappHealth;
      console.log('   Configured:', health.configured);
      console.log('   Token Valid:', health.tokenValid);
      console.log('   Error:', health.error || 'None');
      
      if (!health.configured) {
        console.log('   ⚠️  WhatsApp service is not properly configured');
      } else if (!health.tokenValid) {
        console.log('   ⚠️  WhatsApp token is invalid or expired');
      } else {
        console.log('   ✅ WhatsApp service is healthy');
      }
    } catch (error) {
      console.log('❌ WhatsApp health check failed:', error.message);
    }

    // 4. Test WhatsApp token validation
    console.log('\n4. Testing WhatsApp token validation...');
    try {
      const tokenResponse = await axios.get('https://api.chatmiimii.com/api/test/whatsapp-token-test', { timeout: 10000 });
      console.log('✅ WhatsApp token test successful');
      
      const tokenInfo = tokenResponse.data.tokenInfo;
      const validation = tokenResponse.data.validationResult;
      
      console.log('   Has Token:', tokenInfo.hasToken);
      console.log('   Token Length:', tokenInfo.tokenLength);
      console.log('   Is Configured:', tokenInfo.isConfigured);
      console.log('   Token Valid:', validation.valid);
      
      if (!tokenInfo.hasToken) {
        console.log('   ⚠️  No WhatsApp access token found');
      } else if (!validation.valid) {
        console.log('   ⚠️  WhatsApp token is invalid:', validation.error);
      } else {
        console.log('   ✅ WhatsApp token is valid');
      }
    } catch (error) {
      console.log('❌ WhatsApp token test failed:', error.message);
    }

    // 5. Test database connection
    console.log('\n5. Testing database connection...');
    try {
      const dbResponse = await axios.get('https://api.chatmiimii.com/api/test/db/connection', { timeout: 15000 });
      console.log('✅ Database connection successful');
    } catch (error) {
      console.log('❌ Database connection failed:', error.message);
      if (error.response?.status === 500) {
        console.log('   → Database server is unreachable or credentials are incorrect');
      }
    }

    // 6. Test all services health
    console.log('\n6. Testing all services health...');
    try {
      const allHealthResponse = await axios.get('https://api.chatmiimii.com/api/test/health/all', { timeout: 15000 });
      console.log('✅ All services health check successful');
      
      const services = allHealthResponse.data.services;
      console.log('   Database:', services.database);
      console.log('   BellBank:', services.bellbank);
      console.log('   Dojah:', services.dojah);
      console.log('   WhatsApp:', services.whatsapp);
      console.log('   OpenAI:', services.openai);
      
      const unhealthyServices = Object.entries(services)
        .filter(([name, status]) => status === 'unhealthy')
        .map(([name]) => name);
      
      if (unhealthyServices.length > 0) {
        console.log('   ⚠️  Unhealthy services:', unhealthyServices.join(', '));
      } else {
        console.log('   ✅ All services are healthy');
      }
    } catch (error) {
      console.log('❌ All services health check failed:', error.message);
    }

    // 7. Test webhook endpoint
    console.log('\n7. Testing webhook endpoint...');
    try {
      const webhookResponse = await axios.get('https://api.chatmiimii.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test', { timeout: 10000 });
      console.log('✅ Webhook endpoint is accessible');
      console.log('   Status:', webhookResponse.status);
    } catch (error) {
      console.log('❌ Webhook endpoint test failed:', error.message);
      if (error.response?.status === 403) {
        console.log('   → Webhook verification token is incorrect');
      }
    }

  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
  }

  console.log('\n📋 Summary of Issues:');
  console.log('1. Database Connection: ETIMEDOUT errors indicate database server is unreachable');
  console.log('2. WhatsApp Configuration: Environment variables may be missing or incorrect');
  console.log('3. Server Status: Check if the server is running and accessible');
  
  console.log('\n🔧 Recommended Fixes:');
  console.log('1. Verify database connection string and credentials');
  console.log('2. Set correct WhatsApp environment variables (BOT_ACCESS_TOKEN, BOT_PHONE_NUMBER_ID, BOT_WEBHOOK_VERIFY_TOKEN)');
  console.log('3. Ensure server is running and accessible');
  console.log('4. Check Digital Ocean App Platform deployment status');
}

diagnoseWhatsAppIssues().catch(console.error); 
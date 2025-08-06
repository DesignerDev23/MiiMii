const axios = require('axios');
const logger = require('./src/utils/logger');

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://api.chatmiimii.com';
const TEST_PHONE = process.env.TEST_PHONE || '+2348012345678';

async function checkDatabaseConnection() {
  try {
    console.log('🔍 Checking database connection...');
    
    const response = await axios.get(`${BASE_URL}/health`, {
      timeout: 10000
    });
    
    if (response.data.database?.status === 'healthy') {
      console.log('✅ Database connection is healthy');
      return true;
    } else {
      console.log('❌ Database connection issues detected');
      console.log('📊 Database status:', response.data.database);
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check database connection:', error.message);
    return false;
  }
}

async function testWebhookEndpoint() {
  try {
    console.log('🔍 Testing webhook endpoint...');
    
    // Test webhook verification
    const verificationResponse = await axios.post(`${BASE_URL}/webhook/whatsapp`, {
      'hub.mode': 'subscribe',
      'hub.challenge': 'test_challenge_123',
      'hub.verify_token': process.env.BOT_WEBHOOK_VERIFY_TOKEN || 'test_token'
    }, {
      timeout: 10000
    });
    
    if (verificationResponse.status === 200) {
      console.log('✅ Webhook verification endpoint working');
    } else {
      console.log('❌ Webhook verification failed');
    }
    
    // Test message webhook
    const messageWebhook = {
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
              wa_id: TEST_PHONE
            }],
            messages: [{
              from: TEST_PHONE,
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
    
    const messageResponse = await axios.post(`${BASE_URL}/webhook/whatsapp`, messageWebhook, {
      timeout: 10000
    });
    
    if (messageResponse.status === 200) {
      console.log('✅ Message webhook processing working');
    } else {
      console.log('❌ Message webhook processing failed');
    }
    
    return true;
  } catch (error) {
    console.log('❌ Webhook test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testFlowWebhook() {
  try {
    console.log('🔍 Testing Flow webhook...');
    
    const flowWebhook = {
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
              wa_id: TEST_PHONE
            }],
            messages: [{
              from: TEST_PHONE,
              id: 'test_flow_message_id',
              timestamp: Math.floor(Date.now() / 1000),
              type: 'interactive',
              interactive: {
                type: 'flow',
                flow: {
                  flow_token: 'test_user_123_1234567890_abcdef123456_abc123',
                  screen: 'PERSONAL_DETAILS_SCREEN',
                  data: {
                    first_name: 'John',
                    last_name: 'Doe',
                    middle_name: 'Smith',
                    date_of_birth: '1990-01-01',
                    gender: 'male'
                  }
                }
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };
    
    const flowResponse = await axios.post(`${BASE_URL}/webhook/whatsapp`, flowWebhook, {
      timeout: 10000
    });
    
    if (flowResponse.status === 200) {
      console.log('✅ Flow webhook processing working');
    } else {
      console.log('❌ Flow webhook processing failed');
    }
    
    return true;
  } catch (error) {
    console.log('❌ Flow webhook test failed:', error.response?.data || error.message);
    return false;
  }
}

async function checkEnvironmentVariables() {
  console.log('🔍 Checking environment variables...');
  
  const requiredVars = [
    'BOT_ACCESS_TOKEN',
    'BOT_PHONE_NUMBER_ID',
    'BOT_BUSINESS_ACCOUNT_ID',
    'DB_CONNECTION_URL',
    'BASE_URL'
  ];
  
  const optionalVars = [
    'WHATSAPP_ONBOARDING_FLOW_ID',
    'WHATSAPP_LOGIN_FLOW_ID',
    'BOT_WEBHOOK_VERIFY_TOKEN'
  ];
  
  console.log('📋 Required environment variables:');
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`❌ ${varName}: NOT SET`);
    }
  });
  
  console.log('\n📋 Optional environment variables:');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`⚠️  ${varName}: NOT SET (optional)`);
    }
  });
}

async function testWhatsAppAPI() {
  try {
    console.log('🔍 Testing WhatsApp API connection...');
    
    const response = await axios.get(`${BASE_URL}/api/whatsapp/health`, {
      timeout: 10000
    });
    
    if (response.data.success) {
      console.log('✅ WhatsApp API connection working');
      console.log('📊 API Status:', response.data);
    } else {
      console.log('❌ WhatsApp API connection failed');
    }
    
    return true;
  } catch (error) {
    console.log('❌ WhatsApp API test failed:', error.response?.data || error.message);
    return false;
  }
}

async function generateTestReport() {
  console.log('📊 Generating comprehensive test report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    database: await checkDatabaseConnection(),
    webhook: await testWebhookEndpoint(),
    flowWebhook: await testFlowWebhook(),
    whatsappAPI: await testWhatsAppAPI(),
    environment: true // We'll check this separately
  };
  
  console.log('\n📋 Test Report:');
  console.log('===============');
  console.log(`Database Connection: ${report.database ? '✅ Healthy' : '❌ Issues'}`);
  console.log(`Webhook Processing: ${report.webhook ? '✅ Working' : '❌ Failed'}`);
  console.log(`Flow Webhook: ${report.flowWebhook ? '✅ Working' : '❌ Failed'}`);
  console.log(`WhatsApp API: ${report.whatsappAPI ? '✅ Working' : '❌ Failed'}`);
  
  // Save report to file
  const fs = require('fs');
  fs.writeFileSync('debug_report.json', JSON.stringify(report, null, 2));
  console.log('\n💾 Report saved to debug_report.json');
  
  return report;
}

async function provideRecommendations(report) {
  console.log('\n🔧 Recommendations:');
  console.log('==================');
  
  if (!report.database) {
    console.log('1. Database Issues:');
    console.log('   - Check DB_CONNECTION_URL in environment variables');
    console.log('   - Verify DigitalOcean database is running');
    console.log('   - Check database credentials and permissions');
  }
  
  if (!report.webhook) {
    console.log('2. Webhook Issues:');
    console.log('   - Verify webhook URL is accessible');
    console.log('   - Check webhook signature verification');
    console.log('   - Ensure WhatsApp Business Account is properly configured');
  }
  
  if (!report.flowWebhook) {
    console.log('3. Flow Webhook Issues:');
    console.log('   - Verify Flow templates are created and approved');
    console.log('   - Check Flow template IDs in environment variables');
    console.log('   - Ensure Flow webhook processing is implemented');
  }
  
  if (!report.whatsappAPI) {
    console.log('4. WhatsApp API Issues:');
    console.log('   - Verify BOT_ACCESS_TOKEN is valid');
    console.log('   - Check BOT_PHONE_NUMBER_ID is correct');
    console.log('   - Ensure WhatsApp Business Account is active');
  }
  
  console.log('\n5. General Recommendations:');
  console.log('   - Check application logs for detailed error messages');
  console.log('   - Verify all environment variables are set correctly');
  console.log('   - Test with real phone numbers for complete validation');
  console.log('   - Monitor webhook delivery in WhatsApp Business Manager');
}

async function main() {
  try {
    console.log('🚀 MiiMii Webhook & Database Debug Tool');
    console.log('========================================');
    
    // Check environment variables
    await checkEnvironmentVariables();
    
    console.log('\n' + '='.repeat(50));
    
    // Run comprehensive tests
    const report = await generateTestReport();
    
    console.log('\n' + '='.repeat(50));
    
    // Provide recommendations
    await provideRecommendations(report);
    
    console.log('\n✅ Debug process completed!');
    
  } catch (error) {
    console.error('\n❌ Debug process failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkDatabaseConnection,
  testWebhookEndpoint,
  testFlowWebhook,
  testWhatsAppAPI,
  generateTestReport,
  provideRecommendations
}; 
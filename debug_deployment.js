#!/usr/bin/env node

/**
 * MiiMii Deployment Debug Script
 * This script helps debug your deployed application and WhatsApp configuration
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  // Your deployed application URL
  baseUrl: 'https://api.chatmiimii.com',
  
  // Your WhatsApp test phone number (include country code without +)
  testPhoneNumber: '2349XXXXXXXXX', // Replace with your actual test number
  
  // Timeout for requests
  timeout: 10000
};

class DeploymentDebugger {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {
        passed: 0,
        failed: 0,
        total: 0
      }
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async addTest(name, testFunction) {
    this.log(`Running test: ${name}`);
    const test = {
      name,
      startTime: Date.now(),
      status: 'running'
    };

    try {
      const result = await testFunction();
      test.status = 'passed';
      test.result = result;
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      
      this.log(`✅ ${name} - PASSED (${test.duration}ms)`, 'success');
      this.results.summary.passed++;
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      
      this.log(`❌ ${name} - FAILED: ${error.message}`, 'error');
      this.results.summary.failed++;
    }

    this.results.tests.push(test);
    this.results.summary.total++;
  }

  async testServerHealth() {
    const response = await axios.get(`${config.baseUrl}/`, {
      timeout: config.timeout
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.message.includes('MiiMii')) {
      throw new Error('Invalid response format');
    }

    return {
      status: response.status,
      environment: response.data.environment,
      version: response.data.version,
      nodeVersion: response.data.nodeVersion,
      platform: response.data.platform
    };
  }

  async testHealthEndpoint() {
    const response = await axios.get(`${config.baseUrl}/health`, {
      timeout: config.timeout
    });

    if (response.status !== 200) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    return response.data;
  }

  async testWhatsAppWebhookVerification() {
    // Test webhook verification endpoint
    const verifyToken = 'test_verify_token'; // This should match your BOT_WEBHOOK_VERIFY_TOKEN
    const challenge = 'test_challenge_' + Math.random().toString(36).substring(7);
    
    const response = await axios.get(`${config.baseUrl}/webhook/whatsapp`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': challenge
      },
      timeout: config.timeout
    });

    // Note: This will likely fail if the verify token doesn't match
    // But we can see what happens
    return {
      status: response.status,
      response: response.data
    };
  }

  async testWhatsAppSendMessage() {
    if (!config.testPhoneNumber || config.testPhoneNumber === '2349XXXXXXXXX') {
      throw new Error('Please set your actual test phone number in the config');
    }

    const response = await axios.post(`${config.baseUrl}/api/whatsapp/send-message`, {
      to: config.testPhoneNumber,
      message: `🧪 Test message from MiiMii Debug Script at ${new Date().toISOString()}`
    }, {
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Send message failed with status ${response.status}`);
    }

    return response.data;
  }

  async testDatabaseConnection() {
    try {
      // Test if any database-dependent endpoints work
      const response = await axios.get(`${config.baseUrl}/api/admin/stats`, {
        timeout: config.timeout
      });
      
      return {
        status: response.status,
        connected: true
      };
    } catch (error) {
      if (error.response && error.response.status === 401) {
        // Unauthorized is expected, but means the endpoint is working
        return {
          status: 401,
          connected: true,
          note: 'Database appears connected (got auth error, not connection error)'
        };
      }
      throw error;
    }
  }

  async testEnvironmentVariables() {
    // This test checks if critical environment variables are configured
    // by checking the response from the root endpoint
    const response = await axios.get(`${config.baseUrl}/`, {
      timeout: config.timeout
    });

    const checks = {
      hasCorrectEnvironment: response.data.environment === 'production',
      hasVersion: !!response.data.version,
      hasNodeVersion: !!response.data.nodeVersion,
      hasPlatform: response.data.platform === 'DigitalOcean App Platform'
    };

    return checks;
  }

  async testWebhookLogging() {
    // Send a test webhook to see if logging works
    try {
      const response = await axios.post(`${config.baseUrl}/webhook/whatsapp`, {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'test_entry_id',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: 'test_number',
                phone_number_id: 'test_phone_id'
              },
              messages: [{
                from: config.testPhoneNumber,
                id: 'test_message_id_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: {
                  body: 'Test webhook message from debug script'
                },
                type: 'text'
              }]
            },
            field: 'messages'
          }]
        }]
      }, {
        timeout: config.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        status: response.status,
        response: response.data
      };
    } catch (error) {
      // Even if this fails, we can learn from the error
      return {
        error: error.message,
        status: error.response?.status,
        note: 'Webhook test completed with error (may be expected)'
      };
    }
  }

  async runAllTests() {
    this.log('🚀 Starting MiiMii Deployment Debug Tests');
    this.log(`📡 Testing deployment at: ${config.baseUrl}`);
    this.log('─'.repeat(60));

    // Run all tests
    await this.addTest('Server Health Check', () => this.testServerHealth());
    await this.addTest('Health Endpoint', () => this.testHealthEndpoint());
    await this.addTest('Environment Variables', () => this.testEnvironmentVariables());
    await this.addTest('Database Connection', () => this.testDatabaseConnection());
    await this.addTest('WhatsApp Webhook Verification', () => this.testWhatsAppWebhookVerification());
    await this.addTest('WhatsApp Send Message', () => this.testWhatsAppSendMessage());
    await this.addTest('Webhook Logging Test', () => this.testWebhookLogging());

    // Print summary
    this.log('─'.repeat(60));
    this.log(`📊 Test Summary: ${this.results.summary.passed}/${this.results.summary.total} passed`);
    
    if (this.results.summary.failed > 0) {
      this.log('❌ Some tests failed. Check the detailed results below:', 'error');
    } else {
      this.log('🎉 All tests passed!', 'success');
    }

    // Save detailed results
    const resultsFile = path.join(__dirname, 'debug_results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));
    this.log(`📄 Detailed results saved to: ${resultsFile}`);

    return this.results;
  }

  printRecommendations() {
    this.log('─'.repeat(60));
    this.log('💡 RECOMMENDATIONS FOR DEBUGGING:', 'warn');
    this.log('');
    this.log('1. Check DigitalOcean App Platform logs:');
    this.log('   - Go to your DigitalOcean dashboard');
    this.log('   - Navigate to Apps → miimii-app');
    this.log('   - Click on "Runtime Logs" tab');
    this.log('   - Look for startup logs and error messages');
    this.log('');
    this.log('2. Verify Environment Variables:');
    this.log('   - In DigitalOcean dashboard, go to Settings → Environment Variables');
    this.log('   - Ensure BOT_ACCESS_TOKEN is set correctly');
    this.log('   - Verify BOT_PHONE_NUMBER_ID matches your WhatsApp Business account');
    this.log('   - Check that BOT_WEBHOOK_VERIFY_TOKEN is configured');
    this.log('');
    this.log('3. WhatsApp Business API Setup:');
    this.log('   - Verify your webhook URL is set to: https://api.chatmiimii.com/webhook/whatsapp');
    this.log('   - Ensure the verify token in Meta Developer Console matches BOT_WEBHOOK_VERIFY_TOKEN');
    this.log('   - Check that your WhatsApp Business account is properly configured');
    this.log('');
    this.log('4. Test WhatsApp Webhook:');
    this.log('   - Send a message to your WhatsApp Business number');
    this.log('   - Check DigitalOcean runtime logs for incoming webhook requests');
    this.log('   - Look for any error messages in the logs');
    this.log('');
    this.log('5. If no logs appear when sending WhatsApp messages:');
    this.log('   - Double-check webhook URL configuration in Meta Developer Console');
    this.log('   - Verify the webhook is enabled and subscribed to "messages" events');
    this.log('   - Test webhook verification manually');
  }
}

// Main execution
async function main() {
  const debug = new DeploymentDebugger();
  
  try {
    await debug.runAllTests();
    debug.printRecommendations();
  } catch (error) {
    debug.log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeploymentDebugger;
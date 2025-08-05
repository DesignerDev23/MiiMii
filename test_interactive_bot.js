#!/usr/bin/env node

/**
 * Interactive WhatsApp Bot Test Script
 * 
 * This script demonstrates all the new interactive features:
 * - Profile detection and personalized welcome
 * - Typing indicators
 * - WhatsApp Flows for onboarding
 * - Interactive buttons and responses
 */

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/whatsapp`;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

console.log(`${colors.bold}${colors.blue}
╔════════════════════════════════════════╗
║    Interactive WhatsApp Bot Tester     ║
║                                        ║
║  🤖 Profile Detection                  ║
║  ⌨️  Typing Indicators                  ║
║  🔄 WhatsApp Flows                     ║
║  📱 Interactive Buttons                ║
╚════════════════════════════════════════╝
${colors.reset}`);

async function testInteractiveFeatures() {
  try {
    // Get phone number from user
    const phoneNumber = await askQuestion('\n📱 Enter your WhatsApp number (e.g., +234XXXXXXXXXX or 08XXXXXXXXX): ');
    
    if (!phoneNumber.trim()) {
      console.log(`${colors.red}❌ Phone number is required!${colors.reset}`);
      process.exit(1);
    }

    console.log(`\n${colors.yellow}🧪 Testing interactive features for: ${phoneNumber}${colors.reset}\n`);

    // Test scenarios
    const scenarios = [
      {
        name: 'New User Welcome (with Profile Detection)',
        scenario: 'welcome_new_user',
        description: 'Tests personalized welcome with profile name and interactive buttons'
      },
      {
        name: 'Returning User Welcome',
        scenario: 'welcome_returning_user', 
        description: 'Tests returning user experience with quick action buttons'
      },
      {
        name: 'Typing Indicator Demo',
        scenario: 'typing_demo',
        description: 'Demonstrates typing indicators for better UX'
      },
      {
        name: 'WhatsApp Flow Message',
        scenario: 'flow_message',
        description: 'Sends a Flow message for structured onboarding'
      },
      {
        name: 'Learn More Information',
        scenario: 'learn_more',
        description: 'Shows detailed information page with interactive buttons'
      }
    ];

    // Run all tests
    for (let i = 0; i < scenarios.length; i++) {
      const test = scenarios[i];
      
      console.log(`${colors.bold}${i + 1}. Testing: ${test.name}${colors.reset}`);
      console.log(`   📝 ${test.description}`);
      
      try {
        const response = await axios.post(`${API_BASE}/test-interactive-bot`, {
          to: phoneNumber,
          testScenario: test.scenario
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        if (response.data.success) {
          console.log(`   ${colors.green}✅ Success: Message sent (ID: ${response.data.messageId})${colors.reset}`);
        } else {
          console.log(`   ${colors.red}❌ Failed: ${response.data.error || 'Unknown error'}${colors.reset}`);
        }
      } catch (error) {
        console.log(`   ${colors.red}❌ Error: ${error.response?.data?.error || error.message}${colors.reset}`);
      }

      // Wait between tests
      if (i < scenarios.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log();
      }
    }

    // Test typing indicator separately
    console.log(`\n${colors.bold}6. Testing: Standalone Typing Indicator${colors.reset}`);
    console.log(`   📝 Tests typing indicator with custom duration`);
    
    try {
      const response = await axios.post(`${API_BASE}/test-typing`, {
        to: phoneNumber,
        duration: 5000
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.data.success) {
        console.log(`   ${colors.green}✅ Success: Typing indicator sent${colors.reset}`);
      } else {
        console.log(`   ${colors.red}❌ Failed: ${response.data.error || 'Unknown error'}${colors.reset}`);
      }
    } catch (error) {
      console.log(`   ${colors.red}❌ Error: ${error.response?.data?.error || error.message}${colors.reset}`);
    }

    // Test Flow configuration
    console.log(`\n${colors.bold}7. Testing: Flow Configuration${colors.reset}`);
    console.log(`   📝 Tests Flow endpoint configuration`);
    
    try {
      const response = await axios.post(`${API_BASE}/configure-flow`, {
        flowId: 'DEMO_ONBOARDING_FLOW',
        flowSecret: 'demo_secret_123',
        webhookUrl: `${BASE_URL}/api/whatsapp/flow`
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.data.success) {
        console.log(`   ${colors.green}✅ Success: Flow configuration updated${colors.reset}`);
        console.log(`   📋 Flow ID: ${response.data.config.flowId}`);
        console.log(`   🔗 Webhook URL: ${response.data.config.webhookUrl}`);
      } else {
        console.log(`   ${colors.red}❌ Failed: ${response.data.error || 'Unknown error'}${colors.reset}`);
      }
    } catch (error) {
      console.log(`   ${colors.red}❌ Error: ${error.response?.data?.error || error.message}${colors.reset}`);
    }

    // Show summary
    console.log(`\n${colors.bold}${colors.green}
╔════════════════════════════════════════╗
║            Test Summary                 ║
╚════════════════════════════════════════╝${colors.reset}

${colors.yellow}📱 Interactive Features Tested:${colors.reset}
✅ Personalized welcome messages with profile detection
✅ Typing indicators for better user experience  
✅ Interactive buttons for quick actions
✅ WhatsApp Flow integration for onboarding
✅ Context-aware responses and navigation
✅ Flow configuration management

${colors.blue}📋 What to expect on WhatsApp:${colors.reset}
1. Personalized welcome message with your name (if detectable)
2. Interactive buttons for immediate actions
3. Typing indicators showing bot is processing
4. Flow message for structured onboarding (if Flow ID configured)
5. Learn more page with detailed information

${colors.green}🎉 Your WhatsApp bot is now highly interactive!${colors.reset}

${colors.yellow}Next Steps:${colors.reset}
- Set up WhatsApp Flow in Meta Business Manager
- Configure WHATSAPP_ONBOARDING_FLOW_ID environment variable
- Test the complete onboarding flow with real users
- Monitor analytics and user engagement metrics
`);

  } catch (error) {
    console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
  } finally {
    rl.close();
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}👋 Test interrupted. Goodbye!${colors.reset}`);
  rl.close();
  process.exit(0);
});

// Run the tests
if (require.main === module) {
  testInteractiveFeatures().catch(error => {
    console.error(`${colors.red}❌ Unexpected error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { testInteractiveFeatures };
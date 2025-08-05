#!/usr/bin/env node

// Comprehensive deployment script for Digital Ocean App Platform
const fs = require('fs');
const axios = require('axios');

console.log('🚀 MiiMii Fintech Platform - Digital Ocean Deployment Script\n');

// Required environment variables with their values
const ENV_VARS = {
  PORT: '3000',
  NODE_ENV: 'production',
  DB_CONNECTION_URL: 'postgresql://doadmin:AVNS_J9gjpWqQnV9WTaTwtXH@miimiidb-do-user-20025867-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
  DB_HOST: 'miimiidb-do-user-20025867-0.f.db.ondigitalocean.com',
  DB_PORT: '25060',
  DB_NAME: 'defaultdb',
  DB_USER: 'doadmin',
  DB_PASSWORD: 'AVNS_J9gjpWqQnV9WTaTwtXH',
  APP_SECRET: '811373a9ea95ccb89c4ecdda1f57a18e4f5272da33726a7e9c38d9491e03e519a1f811a03718f050b40c59fc493a1712ad08024fb95108e029fc717edfab549c',
  JWT_EXPIRES_IN: '30d',
  BOT_ACCESS_TOKEN: 'EAAXQZBHvBuxgBPN2hO6wDaC2TnX2W2Tq2QnjHEYW9r9qmoCzJBa0fEZBJp8XXpiZBeCx6xqalX5PJ1WrAqENxMAyq3LsuqkPEZBJ4fsPGKTKoHSoOC26hDBhzY68hwLDM0RzE5wNAlJS3bPUZAkRsj2khewZB7l1a7OGZAIrhzhaIlQ6WqZBr95RrQhKGiKwdTaVhX2mLbZCrHnlnk4Mv',
  BOT_PHONE_NUMBER_ID: '755450640975332',
  BOT_BUSINESS_ACCOUNT_ID: '1722871389103605',
  BOT_WEBHOOK_VERIFY_TOKEN: 'your-webhook-verify-token',
  BANK_CONSUMER_KEY: '1c2ea8d82c7661742d2e85a3e82f7819',
  BANK_CONSUMER_SECRET: 'test_1740939cfe01dff11619541bab1716c0757342dbf60951dd8ba8f1094386457e',
  PROVIDER_USERNAME: 'your-bilal-username',
  PROVIDER_PASSWORD: 'your-bilal-password',
  BILAL_API_KEY: 'your-bilal-api-key',
  DOJAH_APP_ID: 'your-dojah-app-id',
  DOJAH_SECRET_KEY: 'your-dojah-secret-key',
  DOJAH_PUBLIC_KEY: 'your-dojah-public-key',
  AI_API_KEY: 'your-openai-api-key-here',
  AI_MODEL: 'gpt-4-turbo',
  GOOGLE_APPLICATION_CREDENTIALS: 'path/to/service-account-key.json',
  REDIS_URL: 'redis://default:AVNS_J9gjpWqQnV9WTaTwtXH@redis-miimii-do-user-20025867-0.e.db.ondigitalocean.com:25061',
  MAX_FILE_SIZE: '10485760',
  UPLOAD_PATH: 'uploads/',
  WEBHOOK_SECRET: 'bd39e45bd67e5cee631eb014550ff6b3e4acba897ee066a65d45c2c43395a7bd',
  ADMIN_EMAIL: 'admin@miimii.com',
  ADMIN_PASSWORD: 'admin-password-here',
  TRANSFER_FEE_PERCENTAGE: '0.5',
  PLATFORM_FEE: '5',
  BELLBANK_FEE: '20',
  MAINTENANCE_FEE: '100',
  DATA_PURCHASE_FEE: '10',
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  BASE_URL: 'https://api.chatmiimii.com'
};

async function testDatabaseConnection() {
  console.log('🔗 Testing Database Connection...');
  
  try {
    // Set environment variables temporarily for testing
    Object.entries(ENV_VARS).forEach(([key, value]) => {
      process.env[key] = value;
    });

    const { Sequelize } = require('sequelize');
    
    const sequelize = new Sequelize(ENV_VARS.DB_CONNECTION_URL, {
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    });

    await sequelize.authenticate();
    console.log('✅ Database connection: SUCCESS');
    
    await sequelize.close();
    return true;
  } catch (error) {
    console.error('❌ Database connection: FAILED');
    console.error(`Error: ${error.message}`);
    return false;
  }
}

async function testRedisConnection() {
  console.log('⚡ Testing Redis Connection...');
  
  try {
    const redis = require('redis');
    const client = redis.createClient({
      url: ENV_VARS.REDIS_URL,
      socket: {
        reconnectDelay: 5000,
        timeout: 5000,
        connectTimeout: 5000
      }
    });

    await client.connect();
    await client.ping();
    console.log('✅ Redis connection: SUCCESS');
    
    await client.quit();
    return true;
  } catch (error) {
    console.error('❌ Redis connection: FAILED');
    console.error(`Error: ${error.message}`);
    return false;
  }
}

async function testWhatsAppWebhook() {
  console.log('📱 Testing WhatsApp Webhook...');
  
  try {
    const response = await axios.get(`${ENV_VARS.BASE_URL}/webhook/whatsapp`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': ENV_VARS.BOT_WEBHOOK_VERIFY_TOKEN,
        'hub.challenge': 'test_challenge_12345'
      },
      timeout: 10000
    });

    if (response.status === 200 && response.data === 'test_challenge_12345') {
      console.log('✅ WhatsApp webhook: SUCCESS');
      return true;
    } else {
      console.log('❌ WhatsApp webhook: FAILED (unexpected response)');
      return false;
    }
  } catch (error) {
    console.error('❌ WhatsApp webhook: FAILED');
    console.error(`Error: ${error.message}`);
    return false;
  }
}

async function testAPIEndpoints() {
  console.log('🔍 Testing API Endpoints...');
  
  const endpoints = [
    { path: '/', name: 'Root endpoint' },
    { path: '/health', name: 'Health check' },
    { path: '/healthz', name: 'Simple health check' }
  ];

  let allPassed = true;

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${ENV_VARS.BASE_URL}${endpoint.path}`, {
        timeout: 10000
      });
      
      if (response.status === 200) {
        console.log(`✅ ${endpoint.name}: SUCCESS`);
      } else {
        console.log(`❌ ${endpoint.name}: FAILED (status ${response.status})`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: FAILED (${error.message})`);
      allPassed = false;
    }
  }

  return allPassed;
}

function generateDeploymentConfig() {
  console.log('\n📋 Digital Ocean App Platform Environment Variables:');
  console.log('═'.repeat(80));
  console.log('Copy these to your Digital Ocean App Platform environment variables:\n');

  Object.entries(ENV_VARS).forEach(([key, value]) => {
    console.log(`${key}=${value}`);
  });

  console.log('\n═'.repeat(80));
}

function generateDockerRunCommand() {
  console.log('\n🐳 Docker Run Command for Local Testing:');
  console.log('═'.repeat(80));
  
  const envFlags = Object.entries(ENV_VARS)
    .map(([key, value]) => `-e ${key}="${value}"`)
    .join(' \\\n  ');

  console.log(`docker run -p 3000:3000 \\
  ${envFlags} \\
  miimii-fintech-platform`);
  
  console.log('\n═'.repeat(80));
}

async function performHealthCheck() {
  console.log('\n🏥 Performing Comprehensive Health Check...\n');

  const checks = [
    { name: 'Database Connection', test: testDatabaseConnection },
    { name: 'Redis Connection', test: testRedisConnection },
    { name: 'WhatsApp Webhook', test: testWhatsAppWebhook },
    { name: 'API Endpoints', test: testAPIEndpoints }
  ];

  const results = [];

  for (const check of checks) {
    try {
      const result = await check.test();
      results.push({ name: check.name, passed: result });
    } catch (error) {
      console.error(`Error testing ${check.name}:`, error.message);
      results.push({ name: check.name, passed: false });
    }
  }

  console.log('\n📊 Health Check Summary:');
  console.log('─'.repeat(40));
  
  let allPassed = true;
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}`);
    if (!passed) allPassed = false;
  });

  console.log(`\n🎯 Overall Status: ${allPassed ? '✅ HEALTHY' : '❌ DEGRADED'}`);
  
  return allPassed;
}

function generateTroubleshootingGuide() {
  console.log('\n🔧 Troubleshooting Guide:');
  console.log('═'.repeat(80));
  console.log('If services are failing, check these common issues:\n');
  
  console.log('1. Database Issues:');
  console.log('   • Verify DB_CONNECTION_URL is correct');
  console.log('   • Check if DigitalOcean Managed Database is running');
  console.log('   • Ensure SSL is properly configured');
  console.log('   • Verify firewall rules allow connections\n');
  
  console.log('2. Redis Issues:');
  console.log('   • Verify REDIS_URL is correct');
  console.log('   • Check if DigitalOcean Managed Redis is running');
  console.log('   • Ensure Redis is accessible from your app\n');
  
  console.log('3. WhatsApp Issues:');
  console.log('   • Verify BOT_ACCESS_TOKEN is valid');
  console.log('   • Check BOT_WEBHOOK_VERIFY_TOKEN matches Facebook settings');
  console.log('   • Ensure webhook URL is accessible from Facebook\n');
  
  console.log('4. App Platform Issues:');
  console.log('   • Check app logs in DigitalOcean dashboard');
  console.log('   • Verify all environment variables are set');
  console.log('   • Ensure app is deployed to the correct region');
  console.log('   • Check resource limits and scaling settings\n');
  
  console.log('═'.repeat(80));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--env-vars')) {
    generateDeploymentConfig();
  } else if (args.includes('--docker')) {
    generateDockerRunCommand();
  } else if (args.includes('--test')) {
    await performHealthCheck();
  } else if (args.includes('--troubleshoot')) {
    generateTroubleshootingGuide();
  } else {
    console.log('🚀 MiiMii Fintech Platform - Digital Ocean Deployment Helper\n');
    console.log('Usage:');
    console.log('  node deploy_digital_ocean.js --env-vars       # Show environment variables');
    console.log('  node deploy_digital_ocean.js --docker         # Show Docker run command');
    console.log('  node deploy_digital_ocean.js --test           # Test all services');
    console.log('  node deploy_digital_ocean.js --troubleshoot   # Show troubleshooting guide\n');

    console.log('Running all operations...\n');
    generateDeploymentConfig();
    generateDockerRunCommand();
    await performHealthCheck();
    generateTroubleshootingGuide();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ENV_VARS, testDatabaseConnection, testRedisConnection, testWhatsAppWebhook };
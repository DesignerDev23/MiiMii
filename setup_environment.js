#!/usr/bin/env node

// Environment setup script for Digital Ocean App Platform
console.log('🚀 Setting up MiiMii Fintech Platform Environment Variables for Digital Ocean...\n');

// Environment variables that should be set on Digital Ocean App Platform
const requiredEnvVars = {
  // Server Configuration
  PORT: '3000',
  NODE_ENV: 'production',
  
  // Database Configuration (Digital Ocean Managed PostgreSQL)
  DB_CONNECTION_URL: 'postgresql://doadmin:AVNS_J9gjpWqQnV9WTaTwtXH@miimiidb-do-user-20025867-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
  DB_HOST: 'miimiidb-do-user-20025867-0.f.db.ondigitalocean.com',
  DB_PORT: '25060',
  DB_NAME: 'defaultdb',
  DB_USER: 'doadmin',
  DB_PASSWORD: 'AVNS_J9gjpWqQnV9WTaTwtXH',
  
  // JWT Configuration
  APP_SECRET: '811373a9ea95ccb89c4ecdda1f57a18e4f5272da33726a7e9c38d9491e03e519a1f811a03718f050b40c59fc493a1712ad08024fb95108e029fc717edfab549c',
  JWT_EXPIRES_IN: '30d',
  
  // WhatsApp Configuration
  BOT_ACCESS_TOKEN: 'EAAXQZBHvBuxgBPN2hO6wDaC2TnX2W2Tq2QnjHEYW9r9qmoCzJBa0fEZBJp8XXpiZBeCx6xqalX5PJ1WrAqENxMAyq3LsuqkPEZBJ4fsPGKTKoHSoOC26hDBhzY68hwLDM0RzE5wNAlJS3bPUZAkRsj2khewZB7l1a7OGZAIrhzhaIlQ6WqZBr95RrQhKGiKwdTaVhX2mLbZCrHnlnk4Mv',
  BOT_PHONE_NUMBER_ID: '755450640975332',
  BOT_BUSINESS_ACCOUNT_ID: '1722871389103605',
  BOT_WEBHOOK_VERIFY_TOKEN: 'your-webhook-verify-token',
  
  // Banking Configuration
  BANK_CONSUMER_KEY: '1c2ea8d82c7661742d2e85a3e82f7819',
  BANK_CONSUMER_SECRET: 'test_1740939cfe01dff11619541bab1716c0757342dbf60951dd8ba8f1094386457e',
  
  // Provider Configuration
  PROVIDER_USERNAME: 'your-bilal-username',
  PROVIDER_PASSWORD: 'your-bilal-password',
  BILAL_API_KEY: 'your-bilal-api-key',
  
  // KYC Configuration
  DOJAH_APP_ID: 'your-dojah-app-id',
  DOJAH_SECRET_KEY: 'your-dojah-secret-key',
  DOJAH_PUBLIC_KEY: 'your-dojah-public-key',
  
  // AI Configuration
  AI_API_KEY: 'your-openai-api-key-here',
  AI_MODEL: 'gpt-4-turbo',
  
  // Google Cloud Configuration
  GOOGLE_APPLICATION_CREDENTIALS: 'path/to/service-account-key.json',
  
  // Redis Configuration (DigitalOcean Managed Redis or external Redis)
  REDIS_URL: 'redis://localhost:6379',
  
  // File Configuration
  MAX_FILE_SIZE: '10485760',
  UPLOAD_PATH: 'uploads/',
  
  // Webhook Configuration
  WEBHOOK_SECRET: 'bd39e45bd67e5cee631eb014550ff6b3e4acba897ee066a65d45c2c43395a7bd',
  
  // Admin Configuration
  ADMIN_EMAIL: 'admin@miimii.com',
  ADMIN_PASSWORD: 'admin-password-here',
  
  // Fees Configuration
  TRANSFER_FEE_PERCENTAGE: '0.5',
  PLATFORM_FEE: '5',
  BELLBANK_FEE: '20',
  MAINTENANCE_FEE: '100',
  DATA_PURCHASE_FEE: '10',
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  
  // Base URL
  BASE_URL: 'https://api.chatmiimii.com'
};

// Generate .env file for local development (DO NOT use in production)
function generateEnvFile() {
  const fs = require('fs');
  const envContent = Object.entries(requiredEnvVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync('.env', envContent);
  console.log('✅ .env file generated for local development\n');
}

// Generate Digital Ocean App Platform environment configuration
function generateDigitalOceanConfig() {
  console.log('🔧 Digital Ocean App Platform Environment Variables Configuration:\n');
  console.log('Copy and paste these into your Digital Ocean App Platform settings:\n');
  console.log('─'.repeat(80));
  
  Object.entries(requiredEnvVars).forEach(([key, value]) => {
    // Mask sensitive values for display
    let displayValue = value;
    if (key.includes('PASSWORD') || key.includes('SECRET') || key.includes('TOKEN') || key.includes('KEY')) {
      displayValue = value.substring(0, 8) + '***';
    }
    console.log(`${key}=${displayValue}`);
  });
  
  console.log('─'.repeat(80));
  console.log('\n📋 Instructions for Digital Ocean App Platform:');
  console.log('1. Go to your App Platform dashboard');
  console.log('2. Navigate to Settings > Environment Variables');
  console.log('3. Add each environment variable above');
  console.log('4. Ensure all sensitive values are properly set');
  console.log('5. Deploy the application\n');
}

// Validate current environment
function validateEnvironment() {
  console.log('🔍 Validating Environment Variables...\n');
  
  const missing = [];
  const configured = [];
  
  Object.keys(requiredEnvVars).forEach(key => {
    if (process.env[key]) {
      configured.push(key);
    } else {
      missing.push(key);
    }
  });
  
  console.log(`✅ Configured: ${configured.length}/${Object.keys(requiredEnvVars).length}`);
  console.log(`❌ Missing: ${missing.length}/${Object.keys(requiredEnvVars).length}\n`);
  
  if (missing.length > 0) {
    console.log('🚨 Missing Environment Variables:');
    missing.forEach(key => console.log(`   • ${key}`));
    console.log('');
  }
  
  return missing.length === 0;
}

// Check for production-specific requirements
function checkProductionRequirements() {
  console.log('🏭 Production Environment Checks:\n');
  
  const checks = [
    {
      name: 'Database Connection URL',
      check: () => process.env.DB_CONNECTION_URL && process.env.DB_CONNECTION_URL.includes('sslmode=require'),
      recommendation: 'Ensure DB_CONNECTION_URL includes SSL requirement for security'
    },
    {
      name: 'JWT Secret Length',
      check: () => process.env.APP_SECRET && process.env.APP_SECRET.length >= 64,
      recommendation: 'Use a strong JWT secret with at least 64 characters'
    },
    {
      name: 'Redis Configuration',
      check: () => process.env.REDIS_URL && !process.env.REDIS_URL.includes('localhost'),
      recommendation: 'Configure external Redis for production (DigitalOcean Managed Redis recommended)'
    },
    {
      name: 'Base URL Configuration',
      check: () => process.env.BASE_URL && process.env.BASE_URL.includes('https://'),
      recommendation: 'Ensure BASE_URL uses HTTPS for security'
    },
    {
      name: 'Node Environment',
      check: () => process.env.NODE_ENV === 'production',
      recommendation: 'Set NODE_ENV to production for optimal performance'
    }
  ];
  
  checks.forEach(({ name, check, recommendation }) => {
    const passed = check();
    console.log(`${passed ? '✅' : '⚠️'} ${name}: ${passed ? 'OK' : 'ATTENTION NEEDED'}`);
    if (!passed) {
      console.log(`   💡 ${recommendation}`);
    }
  });
  
  console.log('');
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--validate')) {
    validateEnvironment();
    checkProductionRequirements();
  } else if (args.includes('--local')) {
    generateEnvFile();
    console.log('⚠️  WARNING: .env file contains sensitive data. DO NOT commit to version control!');
  } else if (args.includes('--digital-ocean')) {
    generateDigitalOceanConfig();
  } else {
    console.log('Usage:');
    console.log('  node setup_environment.js --validate          # Validate current environment');
    console.log('  node setup_environment.js --local             # Generate .env for local dev');
    console.log('  node setup_environment.js --digital-ocean     # Show DigitalOcean config');
    console.log('');
    
    // Show current status
    validateEnvironment();
    checkProductionRequirements();
  }
}

if (require.main === module) {
  main();
}

module.exports = { requiredEnvVars, validateEnvironment, checkProductionRequirements };
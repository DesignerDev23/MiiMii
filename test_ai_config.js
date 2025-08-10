const logger = require('./src/utils/logger');

// Test AI configuration
function testAIConfig() {
  console.log('🔍 Testing AI Configuration...\n');
  
  // Check environment variables
  const envVars = {
    AI_API_KEY: process.env.AI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    AI_BASE_URL: process.env.AI_BASE_URL,
    NODE_ENV: process.env.NODE_ENV
  };
  
  console.log('📋 Environment Variables:');
  Object.entries(envVars).forEach(([key, value]) => {
    const masked = value ? `${value.substring(0, 4)}***${value.substring(value.length - 4)}` : 'NOT_SET';
    const length = value ? value.length : 0;
    console.log(`  ${key}: ${masked} (length: ${length})`);
  });
  
  // Determine which API key is being used
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  console.log(`\n🔑 API Key Source: ${process.env.AI_API_KEY ? 'AI_API_KEY' : process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : 'NONE'}`);
  console.log(`🔑 API Key Status: ${apiKey ? 'SET' : 'NOT_SET'}`);
  
  if (apiKey) {
    console.log(`🔑 API Key Length: ${apiKey.length}`);
    console.log(`🔑 API Key Preview: ${apiKey.substring(0, 4)}***${apiKey.substring(apiKey.length - 4)}`);
    console.log(`🔑 API Key Starts With: ${apiKey.substring(0, 3)}`);
    
    // Check if it looks like a valid OpenAI API key
    if (apiKey.startsWith('sk-')) {
      console.log('✅ API Key format looks valid (starts with sk-)');
    } else {
      console.log('⚠️  API Key format may be invalid (should start with sk-)');
    }
  } else {
    console.log('❌ No API key found!');
    console.log('💡 To fix this:');
    console.log('   1. Set AI_API_KEY or OPENAI_API_KEY environment variable');
    console.log('   2. In Digital Ocean App Platform, go to your app settings');
    console.log('   3. Add environment variable AI_API_KEY with your OpenAI API key');
    console.log('   4. Redeploy the app');
  }
  
  // Test AI Assistant service
  console.log('\n🤖 Testing AI Assistant Service...');
  try {
    const aiAssistant = require('./src/services/aiAssistant');
    console.log('✅ AI Assistant service loaded successfully');
    console.log(`✅ AI Assistant configured: ${aiAssistant.isConfigured}`);
    console.log(`✅ AI Model: ${aiAssistant.model}`);
    console.log(`✅ AI Base URL: ${aiAssistant.openaiBaseUrl}`);
  } catch (error) {
    console.log('❌ Failed to load AI Assistant service:', error.message);
  }
  
  // Test basic intent analysis
  console.log('\n🧠 Testing Basic Intent Analysis...');
  try {
    const aiAssistant = require('./src/services/aiAssistant');
    const testMessage = 'Hi there!';
    const result = aiAssistant.basicIntentAnalysis(testMessage);
    console.log(`✅ Basic intent analysis works: ${result.intent} (confidence: ${result.confidence})`);
  } catch (error) {
    console.log('❌ Basic intent analysis failed:', error.message);
  }
  
  console.log('\n📝 Summary:');
  if (apiKey) {
    console.log('✅ API key is configured');
    console.log('⚠️  If you\'re still getting 401 errors, check:');
    console.log('   - API key is valid and active');
    console.log('   - API key has sufficient credits');
    console.log('   - API key has access to the specified model');
  } else {
    console.log('❌ API key is missing - AI features will use fallback processing');
  }
}

// Run the test
testAIConfig();

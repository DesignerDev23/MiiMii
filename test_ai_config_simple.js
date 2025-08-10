// Simple AI Configuration Test (no external dependencies)
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
  
  // Test basic intent analysis logic
  console.log('\n🧠 Testing Basic Intent Analysis Logic...');
  try {
    const testMessage = 'Hi there!';
    const lowerMessage = testMessage.toLowerCase();
    
    // Simple greeting detection
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'start', 'begin'];
    const isGreeting = greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage.length < 10;
    
    console.log(`✅ Basic intent analysis works: ${isGreeting ? 'greeting' : 'unknown'}`);
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
    console.log('   - API key is properly set in Digital Ocean App Platform');
  } else {
    console.log('❌ API key is missing - AI features will use fallback processing');
    console.log('💡 The 401 errors in your logs indicate the AI_API_KEY is not set');
    console.log('💡 You need to set this in your Digital Ocean App Platform environment variables');
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Go to your Digital Ocean App Platform dashboard');
  console.log('2. Navigate to your MiiMii app');
  console.log('3. Go to Settings > Environment Variables');
  console.log('4. Add AI_API_KEY with your OpenAI API key value');
  console.log('5. Redeploy the app');
  console.log('6. Check the logs again to see if the 401 errors are resolved');
}

// Run the test
testAIConfig();

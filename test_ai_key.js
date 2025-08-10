// Simple AI API Key Test Script
const axios = require('axios');

async function testAIKey() {
  console.log('🔍 Testing AI_API_KEY...\n');
  
  const apiKey = process.env.AI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ AI_API_KEY environment variable is not set');
    console.log('💡 Set it in your Digital Ocean App Platform environment variables');
    return;
  }
  
  console.log('📋 API Key Details:');
  console.log(`  Length: ${apiKey.length} characters`);
  console.log(`  Preview: ${apiKey.substring(0, 4)}***${apiKey.substring(apiKey.length - 4)}`);
  console.log(`  Starts with: ${apiKey.substring(0, 3)}`);
  
  // Check format
  if (!apiKey.startsWith('sk-')) {
    console.log('❌ Invalid format - API key should start with "sk-"');
    return;
  }
  
  if (apiKey.length !== 51) {
    console.log(`⚠️  Unusual length - expected 51 characters, got ${apiKey.length}`);
    console.log('   This might indicate an invalid or malformed key');
  } else {
    console.log('✅ Format looks correct');
  }
  
  console.log('\n🧪 Testing API key with OpenAI...');
  
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ API key is valid and working!');
      console.log(`📊 Available models: ${response.data.data?.length || 0}`);
      
      // Check if gpt-4o-mini is available
      const models = response.data.data?.map(m => m.id) || [];
      const hasGpt4oMini = models.some(m => m.includes('gpt-4o-mini'));
      
      if (hasGpt4oMini) {
        console.log('✅ gpt-4o-mini model is available');
      } else {
        console.log('⚠️  gpt-4o-mini model not found in available models');
        console.log('   Available models:', models.slice(0, 5).join(', '));
      }
      
    } else {
      console.log(`❌ Unexpected response: ${response.status}`);
    }
    
  } catch (error) {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.error?.message || error.message;
    
    console.log(`❌ API test failed: ${errorMessage}`);
    
    if (status === 401) {
      console.log('🔑 401 Unauthorized - The API key is invalid or expired');
      console.log('💡 Generate a new API key from: https://platform.openai.com/api-keys');
    } else if (status === 429) {
      console.log('⚠️  429 Rate limit exceeded - this is normal for testing');
    } else if (status === 403) {
      console.log('🚫 403 Forbidden - API key might not have the right permissions');
    } else {
      console.log(`⚠️  Status ${status} - Check your internet connection`);
    }
  }
  
  console.log('\n📝 Summary:');
  if (apiKey.length === 51 && apiKey.startsWith('sk-')) {
    console.log('✅ API key format is correct');
    console.log('💡 If you\'re still getting 401 errors, the key might be:');
    console.log('   - Expired or revoked');
    console.log('   - From a different OpenAI account');
    console.log('   - Not properly set in Digital Ocean environment variables');
  } else {
    console.log('❌ API key format is incorrect');
    console.log('💡 Generate a new API key from OpenAI dashboard');
  }
}

// Run the test
testAIKey().catch(console.error);

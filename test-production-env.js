const axios = require('axios');

async function testProductionEnvironment() {
  try {
    console.log('Testing production environment variables...');
    
    // Test the environment check endpoint
    const response = await axios.get('https://api.chatmiimii.com/api/test/env/check');
    
    console.log('=== Production Environment Variables ===');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Test health check
    console.log('\n=== Testing Health Check ===');
    const healthResponse = await axios.get('https://api.chatmiimii.com/api/test/health/all');
    console.log(JSON.stringify(healthResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error testing production environment:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testProductionEnvironment(); 
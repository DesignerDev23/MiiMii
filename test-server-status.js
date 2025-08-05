const axios = require('axios');

async function testServerStatus() {
  try {
    console.log('Testing server connectivity...');
    
    // Test basic health endpoint
    console.log('\n1. Testing /health endpoint...');
    try {
      const healthResponse = await axios.get('https://api.chatmiimii.com/health');
      console.log('✅ Health endpoint working:', healthResponse.status);
      console.log('Response:', JSON.stringify(healthResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.message);
    }
    
    // Test if server is responding at all
    console.log('\n2. Testing server response...');
    try {
      const response = await axios.get('https://api.chatmiimii.com/');
      console.log('✅ Server responding:', response.status);
    } catch (error) {
      console.log('❌ Server not responding:', error.message);
    }
    
    // Test admin endpoint
    console.log('\n3. Testing admin endpoint...');
    try {
      const adminResponse = await axios.get('https://api.chatmiimii.com/admin');
      console.log('✅ Admin endpoint working:', adminResponse.status);
    } catch (error) {
      console.log('❌ Admin endpoint failed:', error.message);
    }
    
  } catch (error) {
    console.error('Error testing server:', error.message);
  }
}

testServerStatus(); 
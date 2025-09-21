// Test script for Rubies API integration
const axios = require('axios');

// Your actual Rubies credentials
const RUBIES_API_KEY = 'SK-BUS0000000181-DEV-H408D2UZBGHK33LIZYJIT62ED5BCBB0D8E8A73C48D69431B0267C4C3C699DD80547A6ED46AC7249D0AF03';
const RUBIES_BASE_URL = 'https://api-sme-dev.rubies.ng/dev';

async function testRubiesAPI() {
  console.log('🔍 Testing Rubies API Integration...\n');
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Authorization': RUBIES_API_KEY
  };

  // Test 1: Get Channel Code
  console.log('1️⃣ Testing Get Channel Code...');
  try {
    const channelResponse = await axios.post(`${RUBIES_BASE_URL}/baas-virtual-account/get-channel-code`, {
      requestType: 'ALL'
    }, { headers });
    
    console.log('✅ Channel Code Success:', {
      responseCode: channelResponse.data.responseCode,
      responseMessage: channelResponse.data.responseMessage,
      dataCount: channelResponse.data.data?.length || 0
    });
  } catch (error) {
    console.log('❌ Channel Code Failed:', error.response?.status, error.response?.data || error.message);
    
    // Try alternative endpoint spelling
    try {
      console.log('   Trying alternative spelling...');
      const altResponse = await axios.post(`${RUBIES_BASE_URL}/baas-virtual-account/getChannelCode`, {
        requestType: 'ALL'
      }, { headers });
      
      console.log('✅ Alternative Channel Code Success:', {
        responseCode: altResponse.data.responseCode,
        responseMessage: altResponse.data.responseMessage
      });
    } catch (altError) {
      console.log('❌ Alternative Channel Code Failed:', altError.response?.status, altError.response?.data || altError.message);
    }
  }

  // Test 2: BVN Validation
  console.log('\n2️⃣ Testing BVN Validation...');
  try {
    const bvnResponse = await axios.post(`${RUBIES_BASE_URL}/baas-kyc/bvnValidation`, {
      bvn: '12345678901' // Test BVN
    }, { headers });
    
    console.log('✅ BVN Validation Success:', {
      responseCode: bvnResponse.data.responseCode,
      responseMessage: bvnResponse.data.responseMessage
    });
  } catch (error) {
    console.log('❌ BVN Validation Failed:', error.response?.status, error.response?.data || error.message);
  }

  // Test 3: Bank List
  console.log('\n3️⃣ Testing Bank List...');
  try {
    const bankResponse = await axios.post(`${RUBIES_BASE_URL}/baas-Transaction/bankList`, {}, { headers });
    
    console.log('✅ Bank List Success:', {
      responseCode: bankResponse.data.responseCode,
      responseMessage: bankResponse.data.responseMessage,
      bankCount: bankResponse.data.data?.length || 0
    });
  } catch (error) {
    console.log('❌ Bank List Failed:', error.response?.status, error.response?.data || error.message);
  }

  // Test 4: Name Enquiry
  console.log('\n4️⃣ Testing Name Enquiry...');
  try {
    const nameResponse = await axios.post(`${RUBIES_BASE_URL}/baas-Transaction/nameEnquiry`, {
      accountNumber: '0123456789',
      bankCode: '044' // Access Bank
    }, { headers });
    
    console.log('✅ Name Enquiry Success:', {
      responseCode: nameResponse.data.responseCode,
      responseMessage: nameResponse.data.responseMessage
    });
  } catch (error) {
    console.log('❌ Name Enquiry Failed:', error.response?.status, error.response?.data || error.message);
  }

  console.log('\n📋 Test Summary:');
  console.log('Base URL:', RUBIES_BASE_URL);
  console.log('API Key:', RUBIES_API_KEY.substring(0, 20) + '...');
  console.log('\n🔗 Webhook URL to configure in Rubies dashboard:');
  console.log('https://your-app-domain.com/webhook/rubies');
  
  console.log('\n🚀 Next Steps:');
  console.log('1. Run rubies_migration_simple.sql on your database');
  console.log('2. Deploy to Digital Ocean');
  console.log('3. Test BVN validation in onboarding flow');
  console.log('4. Configure webhook URL in Rubies dashboard');
}

// Run the test
testRubiesAPI().catch(console.error);

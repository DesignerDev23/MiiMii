// Find the correct account parent for your Rubies account
const axios = require('axios');

const RUBIES_API_KEY = 'SK-BUS0000000051-PROD-SQSADUJ05RPWLXPMBFBT6BCF42E6EFC074F463C0339FFAFE2ABD41ADBEFBD6266C7862FF40FFC371CD6F';
const RUBIES_BASE_URL = 'https://api-sme.rubies.ng/prod';

async function findAccountParent() {
  console.log('🔍 Finding Your Account Parent...\n');
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Authorization': RUBIES_API_KEY
  };

  // Test 1: Get your virtual account list to see what accountParent you should use
  console.log('1️⃣ Getting Virtual Account List...');
  try {
    const listResponse = await axios.post(`${RUBIES_BASE_URL}/baas-virtual-account/get-virtual-account-list`, {
      page: 1,
      pageSize: 10
    }, { headers });
    
    console.log('✅ Virtual Account List Success:', {
      responseCode: listResponse.data.responseCode,
      responseMessage: listResponse.data.responseMessage,
      accountCount: listResponse.data.data?.length || 0
    });

    if (listResponse.data.data && listResponse.data.data.length > 0) {
      const firstAccount = listResponse.data.data[0];
      console.log('\n📋 Your Account Parent Information:');
      console.log('Account Parent:', firstAccount.accountParent);
      console.log('Bank Code:', firstAccount.channelBankCode);
      console.log('Bank Name:', firstAccount.channelBankName);
      console.log('\n✅ Use this accountParent in your virtual account creation:', firstAccount.accountParent);
    }
  } catch (error) {
    console.log('❌ Virtual Account List Failed:', error.response?.status, error.response?.data || error.message);
  }

  // Test 2: Try to create virtual account with different accountParent values
  console.log('\n2️⃣ Testing Different Account Parent Values...');
  
  const testParents = ['9018866641', '1000000051', 'BUS0000000051', '0000000051'];
  
  for (const parentValue of testParents) {
    try {
      console.log(`\nTesting accountParent: ${parentValue}`);
      
      const vaPayload = {
        accountAmountControl: 'EXACT',
        accountParent: parentValue,
        accountType: 'DISPOSABLE',
        amount: '0',
        bvn: '12345678901',
        photo: '',
        validTime: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
        firstName: 'Test',
        gender: 'Male',
        lastName: 'User',
        phoneNumber: '09072874728',
        reference: `VA_TEST_${Date.now()}_${parentValue}`
      };

      const vaResponse = await axios.post(`${RUBIES_BASE_URL}/baas-virtual-account/initiate-create-virtual-account`, vaPayload, { headers });
      
      console.log(`✅ SUCCESS with ${parentValue}:`, {
        responseCode: vaResponse.data.responseCode,
        responseMessage: vaResponse.data.responseMessage
      });
      
      if (vaResponse.data.responseCode === '00') {
        console.log(`🎉 FOUND WORKING ACCOUNT PARENT: ${parentValue}`);
        break;
      }
    } catch (error) {
      console.log(`❌ Failed with ${parentValue}:`, error.response?.data?.responseMessage || error.message);
    }
  }
}

findAccountParent().catch(console.error);

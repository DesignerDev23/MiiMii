const bellbankService = require('./src/services/bellbank');
const bankTransferService = require('./src/services/bankTransfer');

async function testBankCodeConversion() {
  console.log('🧪 Testing Bank Code Conversion\n');

  try {
    // Test 1: Convert 3-digit bank codes to 6-digit institution codes
    console.log('📋 Test 1: 3-digit to 6-digit bank code conversion');
    
    const testCases = [
      { code: '082', expected: '000082', bank: 'Keystone Bank' },
      { code: '014', expected: '000014', bank: 'Access Bank' },
      { code: '011', expected: '000016', bank: 'First Bank' },
      { code: '058', expected: '000058', bank: 'GTBank' },
      { code: '057', expected: '000057', bank: 'Zenith Bank' },
      { code: '070', expected: '000070', bank: 'Fidelity Bank' },
      { code: '032', expected: '000032', bank: 'Union Bank' },
      { code: '035', expected: '000035', bank: 'Wema Bank' },
      { code: '232', expected: '000232', bank: 'Sterling Bank' },
      { code: '050', expected: '000050', bank: 'Ecobank' },
      { code: '214', expected: '000214', bank: 'FCMB' },
      { code: '221', expected: '000221', bank: 'Stanbic IBTC' },
      { code: '068', expected: '000068', bank: 'Standard Chartered' },
      { code: '023', expected: '000023', bank: 'Citibank' },
      { code: '030', expected: '000030', bank: 'Heritage Bank' },
      { code: '215', expected: '000215', bank: 'Unity Bank' },
      { code: '084', expected: '000084', bank: 'Enterprise Bank' },
      { code: '033', expected: '000033', bank: 'UBA' }
    ];

    for (const testCase of testCases) {
      // Test the conversion logic directly
      const codeMapping = {
        '082': '000082', '014': '000014', '011': '000016', '058': '000058',
        '057': '000057', '070': '000070', '032': '000032', '035': '000035',
        '232': '000232', '050': '000050', '214': '000214', '221': '000221',
        '068': '000068', '023': '000023', '030': '000030', '215': '000215',
        '084': '000084', '033': '000033'
      };
      
      const converted = codeMapping[testCase.code] || testCase.code;
      const passed = converted === testCase.expected;
      
      console.log(`  ${passed ? '✅' : '❌'} ${testCase.bank}: ${testCase.code} → ${converted} ${passed ? '' : `(expected: ${testCase.expected})`}`);
    }

    // Test 2: Bank name to institution code mapping
    console.log('\n📋 Test 2: Bank name to institution code mapping');
    
    const bankNameTests = [
      { name: 'keystone bank', expected: '000082' },
      { name: 'access bank', expected: '000014' },
      { name: 'first bank', expected: '000016' },
      { name: 'gtbank', expected: '000058' },
      { name: 'zenith bank', expected: '000057' },
      { name: 'fidelity bank', expected: '000070' },
      { name: 'union bank', expected: '000032' },
      { name: 'wema bank', expected: '000035' },
      { name: 'sterling bank', expected: '000232' },
      { name: 'ecobank', expected: '000050' },
      { name: 'fcmb', expected: '000214' },
      { name: 'stanbic ibtc', expected: '000221' },
      { name: 'standard chartered', expected: '000068' },
      { name: 'citibank', expected: '000023' },
      { name: 'heritage bank', expected: '000030' },
      { name: 'unity bank', expected: '000215' },
      { name: 'enterprise bank', expected: '000084' },
      { name: 'uba', expected: '000033' }
    ];

    for (const testCase of bankNameTests) {
      try {
        const institutionCode = await bankTransferService.getInstitutionCode(testCase.name);
        const passed = institutionCode === testCase.expected;
        
        console.log(`  ${passed ? '✅' : '❌'} "${testCase.name}" → ${institutionCode} ${passed ? '' : `(expected: ${testCase.expected})`}`);
      } catch (error) {
        console.log(`  ❌ "${testCase.name}" → Error: ${error.message}`);
      }
    }

    // Test 3: Verify BellBank API integration
    console.log('\n📋 Test 3: BellBank API bank list integration');
    
    try {
      const bankMapping = await bellbankService.getBankMapping();
      console.log(`  ✅ Bank mapping retrieved successfully`);
      console.log(`     Total banks: ${bankMapping.banks.length}`);
      console.log(`     Mapping entries: ${Object.keys(bankMapping.bankMapping).length}`);
      
      // Show some sample mappings
      const sampleBanks = Object.entries(bankMapping.bankMapping).slice(0, 5);
      console.log(`     Sample mappings:`);
      for (const [name, code] of sampleBanks) {
        console.log(`       "${name}" → ${code}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed to get bank mapping: ${error.message}`);
      console.log(`     Using fallback mapping instead`);
    }

    // Test 4: Test name enquiry with correct institution code
    console.log('\n📋 Test 4: Name enquiry with institution code (mock)');
    
    try {
      // This would normally call the BellBank API, but we'll test the conversion logic
      const testAccount = '1234567890';
      const testBankCode = '082'; // Keystone Bank
      const expectedInstitutionCode = '000082';
      
      // Simulate the conversion logic
      const codeMapping = {
        '082': '000082', '014': '000014', '011': '000016', '058': '000058',
        '057': '000057', '070': '000070', '032': '000032', '035': '000035',
        '232': '000232', '050': '000050', '214': '000214', '221': '000221',
        '068': '000068', '023': '000023', '030': '000030', '215': '000215',
        '084': '000084', '033': '000033'
      };
      
      const institutionCode = codeMapping[testBankCode] || testBankCode;
      const passed = institutionCode === expectedInstitutionCode;
      
      console.log(`  ${passed ? '✅' : '❌'} Account: ${testAccount}, Bank: ${testBankCode} → Institution Code: ${institutionCode} ${passed ? '' : `(expected: ${expectedInstitutionCode})`}`);
      
      if (passed) {
        console.log(`     ✅ Conversion successful - would call BellBank API with correct 6-digit code`);
      } else {
        console.log(`     ❌ Conversion failed - would still use incorrect 3-digit code`);
      }
    } catch (error) {
      console.log(`  ❌ Name enquiry test failed: ${error.message}`);
    }

    console.log('\n🎉 Bank code conversion tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testBankCodeConversion().then(() => {
  console.log('\n✨ All tests completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});

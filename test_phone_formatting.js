// Test script to verify phone number formatting
const userService = require('./src/services/user');
const whatsappService = require('./src/services/whatsapp');

console.log('🔍 Testing phone number formatting...\n');

// Test cases for phone number formatting
const testCases = [
  // Nigerian local format
  { input: '09072874728', expected: '+2349072874728', description: 'Nigerian local format (starting with 0)' },
  { input: '08012345678', expected: '+2348012345678', description: 'Nigerian local format (08...)' },
  
  // E.164 format (already correct)
  { input: '+2349072874728', expected: '+2349072874728', description: 'E.164 format (already correct)' },
  { input: '+2348012345678', expected: '+2348012345678', description: 'E.164 format (already correct)' },
  
  // Without country code or +
  { input: '2349072874728', expected: '+2349072874728', description: '234 format without +' },
  { input: '9072874728', expected: '+2349072874728', description: '10-digit format' },
  { input: '8012345678', expected: '+2348012345678', description: '10-digit format (8...)' },
];

console.log('📋 Testing UserService.cleanPhoneNumber():');
testCases.forEach((testCase, index) => {
  try {
    const result = userService.cleanPhoneNumber(testCase.input);
    const status = result === testCase.expected ? '✅' : '❌';
    console.log(`  ${status} Test ${index + 1}: ${testCase.description}`);
    console.log(`     Input: "${testCase.input}" -> Output: "${result}"`);
    if (result !== testCase.expected) {
      console.log(`     Expected: "${testCase.expected}"`);
    }
  } catch (error) {
    console.log(`  ❌ Test ${index + 1}: ${testCase.description}`);
    console.log(`     Input: "${testCase.input}" -> Error: ${error.message}`);
  }
  console.log('');
});

console.log('📋 Testing WhatsAppService.formatToE164():');
testCases.forEach((testCase, index) => {
  try {
    const result = whatsappService.formatToE164(testCase.input);
    const status = result === testCase.expected ? '✅' : '❌';
    console.log(`  ${status} Test ${index + 1}: ${testCase.description}`);
    console.log(`     Input: "${testCase.input}" -> Output: "${result}"`);
    if (result !== testCase.expected) {
      console.log(`     Expected: "${testCase.expected}"`);
    }
  } catch (error) {
    console.log(`  ❌ Test ${index + 1}: ${testCase.description}`);
    console.log(`     Input: "${testCase.input}" -> Error: ${error.message}`);
  }
  console.log('');
});

console.log('📋 Testing E.164 validation:');
const validNumbers = ['+2349072874728', '+2348012345678', '+1234567890'];
const invalidNumbers = ['09072874728', '123', 'invalid', ''];

validNumbers.forEach(number => {
  const isValid = whatsappService.validateE164(number);
  const status = isValid ? '✅' : '❌';
  console.log(`  ${status} "${number}" -> ${isValid ? 'Valid' : 'Invalid'}`);
});

invalidNumbers.forEach(number => {
  const isValid = whatsappService.validateE164(number);
  const status = !isValid ? '✅' : '❌';
  console.log(`  ${status} "${number}" -> ${isValid ? 'Valid' : 'Invalid'} (should be invalid)`);
});

console.log('\n🎉 Phone number formatting tests completed!');
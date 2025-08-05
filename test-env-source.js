// Test to verify environment variables are coming from Digital Ocean only
console.log('=== Testing Environment Variable Source ===');

// Check WhatsApp variables
const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

console.log('Environment Variables:');
console.log('WHATSAPP_ACCESS_TOKEN:', whatsappToken ? 'Set' : 'Not set');
console.log('WHATSAPP_ACCESS_TOKEN_LENGTH:', whatsappToken ? whatsappToken.length : 0);
console.log('WHATSAPP_ACCESS_TOKEN_PREFIX:', whatsappToken ? whatsappToken.substring(0, 20) + '...' : 'none');
console.log('WHATSAPP_PHONE_NUMBER_ID:', phoneNumberId);
console.log('WHATSAPP_WEBHOOK_VERIFY_TOKEN:', verifyToken ? 'Set' : 'Not set');

// Check if we're getting placeholder values
if (whatsappToken && whatsappToken.includes('your-whatsapp-access')) {
  console.log('\n❌ ISSUE: Still getting placeholder values from somewhere!');
  console.log('This means there might be a .env file or hardcoded values.');
} else if (whatsappToken && whatsappToken.length > 200) {
  console.log('\n✅ SUCCESS: Getting real values from Digital Ocean!');
} else {
  console.log('\n⚠️  WARNING: No WhatsApp token found');
}

console.log('\n=== Test Complete ==='); 
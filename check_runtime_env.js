#!/usr/bin/env node

console.log('\n🔍 Runtime Environment Variable Check\n');
console.log('📋 WhatsApp Flow Configuration:');
console.log(`   WHATSAPP_ONBOARDING_FLOW_ID: "${process.env.WHATSAPP_ONBOARDING_FLOW_ID || 'NOT SET'}"`);
console.log(`   WHATSAPP_LOGIN_FLOW_ID: "${process.env.WHATSAPP_LOGIN_FLOW_ID || 'NOT SET'}"`);

console.log('\n📋 Other Key Environment Variables:');
console.log(`   NODE_ENV: "${process.env.NODE_ENV || 'NOT SET'}"`);
console.log(`   PORT: "${process.env.PORT || 'NOT SET'}"`);
console.log(`   DATABASE_URL: "${process.env.DATABASE_URL ? '[SET - ' + process.env.DATABASE_URL.substring(0, 20) + '...]' : 'NOT SET'}"`);

console.log('\n🔍 Checking if values match deployment placeholders:');
const onboardingId = process.env.WHATSAPP_ONBOARDING_FLOW_ID;
const loginId = process.env.WHATSAPP_LOGIN_FLOW_ID;

if (onboardingId === 'SET_THIS_IN_DO_UI') {
  console.log('   ❌ WHATSAPP_ONBOARDING_FLOW_ID still shows placeholder value');
  console.log('      This indicates the environment variable was not updated in the deployment');
} else if (!onboardingId) {
  console.log('   ❌ WHATSAPP_ONBOARDING_FLOW_ID is not set at all');
} else if (onboardingId === 'miimii_onboarding_flow') {
  console.log('   ❌ WHATSAPP_ONBOARDING_FLOW_ID is using fallback value');
} else {
  console.log('   ✅ WHATSAPP_ONBOARDING_FLOW_ID appears to be properly set');
}

if (loginId === 'SET_THIS_IN_DO_UI') {
  console.log('   ❌ WHATSAPP_LOGIN_FLOW_ID still shows placeholder value');
  console.log('      This indicates the environment variable was not updated in the deployment');
} else if (!loginId) {
  console.log('   ❌ WHATSAPP_LOGIN_FLOW_ID is not set at all');
} else {
  console.log('   ✅ WHATSAPP_LOGIN_FLOW_ID appears to be properly set');
}

console.log('\n💡 Next Steps:');
if (onboardingId === 'SET_THIS_IN_DO_UI' || loginId === 'SET_THIS_IN_DO_UI') {
  console.log('   1. Verify the environment variables are set in Digital Ocean dashboard');
  console.log('   2. Restart/redeploy the application to pick up new environment variables');
  console.log('   3. Check if the app.yaml file needs to be updated');
} else if (!onboardingId || !loginId) {
  console.log('   1. Set the environment variables in Digital Ocean dashboard');
  console.log('   2. Restart the application');
} else {
  console.log('   ✅ Environment variables appear to be properly configured');
  console.log('   If still getting 400 errors, check if the Flow IDs are valid in WhatsApp Business Manager');
}

console.log('\n📝 Flow ID Format Check:');
if (onboardingId && onboardingId !== 'SET_THIS_IN_DO_UI' && onboardingId !== 'miimii_onboarding_flow') {
  console.log(`   Onboarding Flow ID length: ${onboardingId.length} characters`);
  console.log(`   Starts with number: ${/^\d/.test(onboardingId) ? 'Yes' : 'No'}`);
}
if (loginId && loginId !== 'SET_THIS_IN_DO_UI') {
  console.log(`   Login Flow ID length: ${loginId.length} characters`);
  console.log(`   Starts with number: ${/^\d/.test(loginId) ? 'Yes' : 'No'}`);
}
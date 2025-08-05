// Debug script to see exactly what environment variables are loaded
console.log('=== Environment Variables Debug ===');

// List all environment variables that contain "whatsapp" or "your"
const envVars = Object.keys(process.env).filter(key => 
  key.toLowerCase().includes('whatsapp') || 
  process.env[key]?.includes('your-')
);

console.log('\nEnvironment variables containing "whatsapp" or "your":');
envVars.forEach(key => {
  const value = process.env[key];
  console.log(`${key}: ${value}`);
});

// Check specific WhatsApp variables
console.log('\n=== WhatsApp Variables ===');
console.log('WHATSAPP_ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN);
console.log('WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
console.log('WHATSAPP_WEBHOOK_VERIFY_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);

// Check if any values contain "your-"
const yourValues = Object.keys(process.env).filter(key => 
  process.env[key]?.includes('your-')
);

if (yourValues.length > 0) {
  console.log('\n❌ Found environment variables with "your-" values:');
  yourValues.forEach(key => {
    console.log(`${key}: ${process.env[key]}`);
  });
} else {
  console.log('\n✅ No "your-" values found in environment variables');
}

console.log('\n=== End Debug ==='); 
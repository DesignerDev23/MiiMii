const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔐 Generating RSA Keys for WhatsApp Flow Endpoint\n');

// Configuration
const KEY_SIZE = 2048;
const PASSPHRASE = process.argv[2] || 'miimii-flow-secure-passphrase-2024';

// Generate key pair
console.log('Generating RSA key pair...');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: KEY_SIZE,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: PASSPHRASE
  }
});

// Create keys directory
const keysDir = path.join(__dirname, 'flow-keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir);
}

// Save private key
const privateKeyPath = path.join(keysDir, 'private_key.pem');
fs.writeFileSync(privateKeyPath, privateKey);
console.log(`✅ Private key saved to: ${privateKeyPath}`);

// Save public key
const publicKeyPath = path.join(keysDir, 'public_key.pem');
fs.writeFileSync(publicKeyPath, publicKey);
console.log(`✅ Public key saved to: ${publicKeyPath}`);

// Generate environment variables
const privateKeyForEnv = privateKey.replace(/\n/g, '\\n');
const envContent = `# WhatsApp Flow Endpoint Configuration
FLOW_PRIVATE_KEY=${privateKeyForEnv}
FLOW_PASSPHRASE=${PASSPHRASE}
FLOW_ENDPOINT_URL=https://api.chatmiimii.com/api/flow/endpoint

# WhatsApp Flow IDs (update after creating flows in WhatsApp Manager)
WHATSAPP_ONBOARDING_FLOW_ID=your_onboarding_flow_id_here
WHATSAPP_LOGIN_FLOW_ID=your_login_flow_id_here
`;

// Save environment variables
const envPath = path.join(keysDir, '.env.flow');
fs.writeFileSync(envPath, envContent);
console.log(`✅ Environment variables saved to: ${envPath}`);

// Create setup instructions
const instructions = `# WhatsApp Flow Setup Instructions

## 1. Generated Files
- Private Key: ${privateKeyPath}
- Public Key: ${publicKeyPath}
- Environment Variables: ${envPath}

## 2. Next Steps

### A. Upload Public Key to Meta
1. Go to WhatsApp Business Manager
2. Navigate to Message Templates
3. Find Flow Settings or Endpoint Configuration
4. Upload the public_key.pem file

### B. Add Environment Variables to Digital Ocean
Copy the contents of .env.flow to your Digital Ocean environment variables.

### C. Test Your Endpoint
\`\`\`bash
# Test health check
curl -X GET "https://api.chatmiimii.com/api/flow/health"

# Expected response:
{
  "status": "healthy",
  "encryption": true,
  "services": {
    "database": "connected",
    "userService": "available",
    "onboardingService": "available"
  }
}
\`\`\`

### D. Create Flows in WhatsApp Manager
1. Get Flow JSON:
   \`\`\`bash
   curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"
   curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/login"
   \`\`\`

2. Create flows in WhatsApp Business Manager using the JSON responses

3. Update Flow IDs in environment variables

## 3. Security Notes
- Keep private_key.pem secure and never share it
- The passphrase is: ${PASSPHRASE}
- Delete the keys directory after setting up environment variables

## 4. Testing
After setup, test with:
\`\`\`bash
curl -X POST "https://api.chatmiimii.com/api/whatsapp/send-flow-message" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "2348012345678",
    "flowType": "onboarding"
  }'
\`\`\`
`;

const instructionsPath = path.join(keysDir, 'SETUP_INSTRUCTIONS.md');
fs.writeFileSync(instructionsPath, instructions);
console.log(`✅ Setup instructions saved to: ${instructionsPath}`);

console.log('\n🎉 RSA Keys Generated Successfully!');
console.log(`\n📁 All files saved to: ${keysDir}`);
console.log(`\n🔑 Passphrase: ${PASSPHRASE}`);
console.log('\n📋 Next Steps:');
console.log('1. Upload public_key.pem to WhatsApp Business Manager');
console.log('2. Add environment variables to Digital Ocean');
console.log('3. Create flows in WhatsApp Manager');
console.log('4. Test your endpoint');

console.log('\n⚠️  Security Reminder:');
console.log('- Keep private_key.pem secure');
console.log('- Delete the keys directory after setup');
console.log('- Never commit keys to version control');





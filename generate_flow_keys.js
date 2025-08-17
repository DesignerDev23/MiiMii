const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate key pair for WhatsApp Flow endpoint
function generateFlowKeys() {
  console.log('🔐 Generating WhatsApp Flow endpoint keys...\n');

  // Generate RSA key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
      format: 'pem'
  }
});

  // Create keys directory if it doesn't exist
  const keysDir = path.join(__dirname, 'keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir);
}

// Save private key
  const privateKeyPath = path.join(keysDir, 'flow_private_key.pem');
fs.writeFileSync(privateKeyPath, privateKey);
  console.log('✅ Private key saved to:', privateKeyPath);

// Save public key
  const publicKeyPath = path.join(keysDir, 'flow_public_key.pem');
fs.writeFileSync(publicKeyPath, publicKey);
  console.log('✅ Public key saved to:', publicKeyPath);

  // Display public key for WhatsApp Manager
  console.log('\n📋 PUBLIC KEY FOR WHATSAPP MANAGER:');
  console.log('=====================================');
  console.log(publicKey);
  console.log('=====================================');
  console.log('\n📝 Copy the above public key and paste it in WhatsApp Manager');
  console.log('🔒 Keep the private key secure - it will be used by your server');
  
  // Save public key content to a separate file for easy copying
  const publicKeyContentPath = path.join(keysDir, 'flow_public_key_content.txt');
  fs.writeFileSync(publicKeyContentPath, publicKey);
  console.log('\n📄 Public key content also saved to:', publicKeyContentPath);

  return { publicKey, privateKey };
}

// Generate the keys
generateFlowKeys();












const fs = require('fs');
const path = require('path');

// Configuration
const PHONE_NUMBER_ID = '755450640975332';
const ACCESS_TOKEN = 'EAAXQZBHvBuxgBPN2hO6wDaC2TnX2W2Tq2QnjHEYW9r9qmoCzJBa0fEZBJp8XXpiZBeCx6xqalX5PJ1WrAqENxMAyq3LsuqkPEZBJ4fsPGKTKoHSoOC26hDBhzY68hwLDM0RzE5wNAlJS3bPUZAkRsj2khewZB7l1a7OGZAIrhzhaIlQ6WqZBr95RrQhKGiKwdTaVhX2mLbZCrHnlnk4Mv';

async function uploadPublicKey() {
  try {
    // Read the public key file
    const publicKeyPath = path.join(__dirname, 'flow-keys', 'public_key.pem');
    
    if (!fs.existsSync(publicKeyPath)) {
      console.error('❌ Public key file not found at:', publicKeyPath);
      console.log('Please run "node generate_flow_keys.js" first to generate the keys.');
      return;
    }

    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    console.log('📄 Public key loaded successfully');

    // Prepare the request
    const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/whatsapp_business_encryption`;
    const formData = new URLSearchParams();
    formData.append('business_public_key', publicKey);

    console.log('🚀 Uploading public key to WhatsApp Business API...');
    console.log('📞 Phone Number ID:', PHONE_NUMBER_ID);
    console.log('🔗 URL:', url);

    // Make the request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Public key uploaded successfully!');
      console.log('📋 Response:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Failed to upload public key');
      console.error('📋 Error:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('❌ Error uploading public key:', error.message);
  }
}

// Run the upload
uploadPublicKey();


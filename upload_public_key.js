const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const ACCESS_TOKEN = 'EAASwZAYXOdmwBPQswOrHRktjGvxnhayygaKjSNYLMBFxEBcpYlUic7VeZCIcAevyrKNHEcy95Wney1afNpu5lRFYfdMqUBjrAxtsiZBmHHcgY7Ugbc5Aqw6IPZAsqZCWAUZBVUvIDzpSLNIxUZAt5zm7mwqK9ZA5WIqOVnHlndZA9cDZBZBPNlfBWl4nDCqP0VNNtv2ro8lgjsQniRchg7wtR4oGMrOzmVXWnFUIFp4p8rtfBXiIJXINKSiumv7Fg1LkwZDZD';
const PHONE_NUMBER_ID = '823014844219641';

/**
 * Upload public key to WhatsApp Business API
 */
async function uploadPublicKey() {
  try {
    console.log('🔑 Starting public key upload to WhatsApp Business API...');
    console.log(`📱 Phone Number ID: ${PHONE_NUMBER_ID}`);
    
    // Check if public key file exists
    const publicKeyPath = path.join(__dirname, 'keys', 'flow_public_key.pem');
    
    if (!fs.existsSync(publicKeyPath)) {
      console.error('❌ Public key file not found at:', publicKeyPath);
      console.log('📝 Please ensure you have generated the public key first.');
      return;
    }
    
    // Read the public key
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    console.log('✅ Public key file found and loaded');
    
    // Prepare the request
    const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/whatsapp_business_encryption`;
    
    // Use URLSearchParams for x-www-form-urlencoded format
    const formData = new URLSearchParams();
    formData.append('business_public_key', publicKey);
    
    console.log('🚀 Uploading public key...');
    
    const response = await axios.post(url, formData, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('✅ Public key uploaded successfully!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Failed to upload public key');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

/**
 * Get current public key from WhatsApp Business API
 */
async function getPublicKey() {
  try {
    console.log('🔍 Getting current public key from WhatsApp Business API...');
    console.log(`📱 Phone Number ID: ${PHONE_NUMBER_ID}`);
    
    const url = `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/whatsapp_business_encryption`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Public key retrieved successfully!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Failed to get public key');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'upload':
      await uploadPublicKey();
      break;
    case 'get':
      await getPublicKey();
      break;
    default:
      console.log('📋 Usage:');
      console.log('  node upload_public_key.js upload  - Upload public key');
      console.log('  node upload_public_key.js get     - Get current public key');
      console.log('');
      console.log('🔧 Make sure you have generated the public key first using:');
      console.log('  node generate_flow_keys.js');
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { uploadPublicKey, getPublicKey };


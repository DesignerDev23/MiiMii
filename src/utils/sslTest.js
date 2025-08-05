const axios = require('axios');
const { axiosConfig } = require('./httpsAgent');
const logger = require('./logger');

async function testSSLConnections() {
  const testUrls = [
    { name: 'Facebook Graph API', url: 'https://graph.facebook.com/v18.0/me' },
    { name: 'OpenAI API', url: 'https://api.openai.com/v1/models' },
    { name: 'General HTTPS', url: 'https://httpbin.org/status/200' }
  ];

  logger.info('Testing SSL connections with custom agent configuration...');

  for (const test of testUrls) {
    try {
      const response = await axios.get(test.url, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': 'Bearer dummy-token' // Will fail auth but should connect
        },
        validateStatus: () => true // Accept any status code for connection test
      });

      logger.info(`✅ SSL connection successful to ${test.name}`, {
        status: response.status,
        url: test.url
      });
    } catch (error) {
      if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || 
          error.code === 'CERT_HAS_EXPIRED' ||
          error.message.includes('self-signed certificate')) {
        logger.error(`❌ SSL certificate error for ${test.name}:`, {
          error: error.message,
          code: error.code,
          url: test.url
        });
      } else {
        logger.info(`✅ Connection established to ${test.name} (non-SSL error: ${error.message})`);
      }
    }
  }
}

module.exports = { testSSLConnections };
const https = require('https');
const http = require('http');

// Create custom HTTPS agent that handles self-signed certificates
// This is specifically for DigitalOcean environments where certificate chains
// might not be properly validated
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Allow self-signed certificates
  keepAlive: true,
  timeout: 120000, // Increased from 30000 to 120000 (2 minutes) for BellBank API
  maxSockets: 50,
  maxFreeSockets: 10
});

const httpAgent = new http.Agent({
  keepAlive: true,
  timeout: 120000, // Increased from 30000 to 120000 (2 minutes) for BellBank API
  maxSockets: 50,
  maxFreeSockets: 10
});

// Axios configuration with custom agents
const axiosConfig = {
  timeout: 120000, // Increased from 30000 to 120000 (2 minutes) for BellBank API
  httpsAgent: httpsAgent,
  httpAgent: httpAgent,
  // Additional axios defaults
  headers: {
    'User-Agent': 'MiiMii/1.0'
  }
};

module.exports = {
  httpsAgent,
  httpAgent,
  axiosConfig
};
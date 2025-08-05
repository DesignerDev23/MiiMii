const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Configure Node.js to handle DigitalOcean SSL certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Function to create SSL configuration for DigitalOcean managed databases
function createDOSSLConfig() {
  return {
    require: true,
    rejectUnauthorized: false,
    // Accept any certificate from DigitalOcean
    checkServerIdentity: () => undefined,
    // Use modern TLS
    secureProtocol: 'TLSv1_2_method',
    // Additional options to handle certificate chains
    servername: undefined,
    // Disable certificate verification for managed databases
    ca: undefined,
    cert: undefined,
    key: undefined
  };
}

// Create Sequelize instance with proper SSL handling for DigitalOcean managed PostgreSQL
let sequelize;

if (process.env.DB_CONNECTION_URL) {
  // Use DB_CONNECTION_URL for connection with SSL configuration
  // For DigitalOcean managed databases, we need to handle SSL properly
  const connectionUrl = process.env.DB_CONNECTION_URL;
  
  sequelize = new Sequelize(connectionUrl, {
    logging: process.env.NODE_ENV === 'development' 
      ? (msg) => logger.debug(msg) 
      : false,
    pool: {
      max: 20,
      min: 0,
      acquire: 60000,
      idle: 20000
    },
    dialectOptions: {
      ssl: connectionUrl.includes('sslmode=require') ? createDOSSLConfig() : false
    },
    retry: {
      match: [
        /ECONNRESET/,
        /ENOTFOUND/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /self-signed certificate/,
        /certificate verify failed/
      ],
      max: 5,
      backoffBase: 2000,
      backoffExponent: 1.5,
    }
  });
} else if (process.env.DB_HOST) {
  // Fallback to individual connection parameters
  const isDigitalOceanDB = process.env.DB_HOST && process.env.DB_HOST.includes('db.ondigitalocean.com');
  
  sequelize = new Sequelize({
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' 
      ? (msg) => logger.debug(msg) 
      : false,
    pool: {
      max: 20,
      min: 0,
      acquire: 60000,
      idle: 20000
    },
    dialectOptions: {
      ssl: isDigitalOceanDB ? createDOSSLConfig() : false
    },
    retry: {
      match: [
        /ECONNRESET/,
        /ENOTFOUND/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /self-signed certificate/,
        /certificate verify failed/
      ],
      max: 5,
      backoffBase: 2000,
      backoffExponent: 1.5,
    }
  });
} else {
  // Create a dummy sequelize instance to prevent errors
  sequelize = new Sequelize('sqlite::memory:', {
    logging: false,
    dialectOptions: {}
  });
  logger.warn('No database configuration found - using in-memory SQLite for basic operation');
}

module.exports = { sequelize };
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Create Sequelize instance with proper SSL handling for DigitalOcean managed PostgreSQL
let sequelize;

if (process.env.DB_CONNECTION_URL) {
  // Use DB_CONNECTION_URL for connection with SSL configuration
  sequelize = new Sequelize(process.env.DB_CONNECTION_URL, {
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
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    retry: {
      match: [
        /ECONNRESET/,
        /ENOTFOUND/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
      ],
      max: 3,
      backoffBase: 1000,
      backoffExponent: 1.5,
    }
  });
} else if (process.env.DB_HOST) {
  // Fallback to individual connection parameters
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
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    retry: {
      match: [
        /ECONNRESET/,
        /ENOTFOUND/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
      ],
      max: 3,
      backoffBase: 1000,
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
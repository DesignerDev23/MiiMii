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
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
        // Additional SSL options for DigitalOcean managed PostgreSQL
        sslmode: 'require',
        ca: false,
        key: false,
        cert: false
      }
    }
  });
} else {
  // Fallback to individual connection parameters
  sequelize = new Sequelize({
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' 
      ? (msg) => logger.debug(msg) 
      : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: false
    }
  });
}

module.exports = { sequelize };
const winston = require('winston');
const path = require('path');

// Create custom format for production console output
const productionConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let log = `${timestamp} [${service}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'miimii-api' },
  transports: [
    // Always add console transport for DigitalOcean runtime logs
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' 
        ? productionConsoleFormat 
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    })
  ]
});

// Only add file transports if not in a containerized environment
// DigitalOcean App Platform doesn't persist file logs
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_FILE_LOGS === 'true') {
  logger.add(new winston.transports.File({ 
    filename: path.join(__dirname, '../../logs/error.log'), 
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({ 
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

module.exports = logger;
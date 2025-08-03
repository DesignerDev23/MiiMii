const { sequelize } = require('./connection');
const models = require('../models');
const logger = require('../utils/logger');

async function migrate() {
  try {
    logger.info('Starting database migration...');
    
    // Test connection with retry logic
    let connected = false;
    const maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        await sequelize.authenticate();
        logger.info('Database connection established successfully');
        connected = true;
        break;
      } catch (error) {
        logger.warn(`Database connection attempt ${i + 1} failed:`, error.message);
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
      }
    }
    
    if (!connected) {
      logger.error('Failed to connect to database after multiple attempts');
      logger.info('Database migration skipped - application will attempt to sync on startup');
      process.exit(0); // Exit gracefully instead of with error
    }
    
    // Create tables
    await sequelize.sync({ force: false, alter: true });
    logger.info('Database models synchronized successfully');
    
    // Run any custom migrations
    await runCustomMigrations();
    
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed:', error);
    logger.info('Application will attempt to sync database on startup');
    process.exit(0); // Exit gracefully instead of with error for production
  }
}

async function runCustomMigrations() {
  // Add any custom migration logic here
  // For example, adding indexes, updating data, etc.
  
  try {
    // Add indexes for better performance
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_whatsapp_number 
      ON users(whatsapp_number);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_id_created_at 
      ON transactions(user_id, created_at DESC);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_reference 
      ON transactions(reference);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status 
      ON transactions(status);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_provider_processed 
      ON webhook_logs(provider, processed);
    `);
    
    logger.info('Custom migrations completed');
  } catch (error) {
    // Ignore index creation errors (they might already exist)
    logger.warn('Some custom migrations failed (this might be expected):', error.message);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
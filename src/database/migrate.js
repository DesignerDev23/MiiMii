const { sequelize } = require('./connection');
const models = require('../models');
const logger = require('../utils/logger');

async function migrate() {
  try {
    logger.info('Starting database migration...');
    
    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Create tables
    await sequelize.sync({ force: false, alter: true });
    logger.info('Database models synchronized successfully');
    
    // Run any custom migrations
    await runCustomMigrations();
    
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
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
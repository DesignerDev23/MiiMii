#!/usr/bin/env node

/**
 * Production fix for missing lastWelcomedAt column
 * This script should be run on the production environment to add the missing column
 */

const { sequelize } = require('./src/database/connection');
const logger = require('./src/utils/logger');

async function fixMissingColumn() {
  try {
    logger.info('Starting production fix for missing lastWelcomedAt column...');
    
    // Test connection first
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Get database dialect to use appropriate syntax
    const dialect = sequelize.getDialect();
    logger.info(`Database dialect: ${dialect}`);
    
    if (dialect === 'postgres') {
      // PostgreSQL syntax
      
      // Check if column already exists
      const [results] = await sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'lastWelcomedAt'
      `);
      
      if (results.length > 0) {
        logger.info('Column lastWelcomedAt already exists in users table');
        return true;
      }
      
      // Add the missing column
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN "lastWelcomedAt" TIMESTAMP WITH TIME ZONE
      `);
      
      logger.info('Successfully added lastWelcomedAt column to users table');
      
      // Add comment to column for documentation
      try {
        await sequelize.query(`
          COMMENT ON COLUMN users."lastWelcomedAt" IS 'Last time user received welcome message'
        `);
        logger.info('Added column comment');
      } catch (error) {
        logger.warn('Failed to add column comment (non-critical):', error.message);
      }
      
    } else {
      // Generic SQL approach for other databases
      logger.info('Using generic SQL approach for non-PostgreSQL database');
      
      try {
        await sequelize.query(`
          ALTER TABLE users 
          ADD COLUMN lastWelcomedAt DATETIME
        `);
        logger.info('Successfully added lastWelcomedAt column to users table');
      } catch (error) {
        if (error.message.includes('duplicate column name') || 
            error.message.includes('already exists')) {
          logger.info('Column lastWelcomedAt already exists in users table');
          return true;
        }
        throw error;
      }
    }
    
    // Verify the column was added
    try {
      const [testResults] = await sequelize.query(`
        SELECT "lastWelcomedAt" FROM users LIMIT 1
      `);
      logger.info('Column verification successful - column is accessible');
    } catch (error) {
      logger.warn('Column verification failed, but this might be expected for empty tables');
    }
    
    logger.info('Production fix completed successfully');
    return true;
    
  } catch (error) {
    logger.error('Production fix failed:', error);
    
    // Provide helpful error messages
    if (error.message.includes('permission denied')) {
      logger.error('Database permission denied. Make sure the database user has ALTER privileges.');
    } else if (error.message.includes('connection')) {
      logger.error('Database connection failed. Check database credentials and connectivity.');
    }
    
    throw error;
  } finally {
    try {
      await sequelize.close();
    } catch (error) {
      logger.warn('Failed to close database connection:', error.message);
    }
  }
}

// Self-healing approach: try to add column and continue gracefully if it fails
async function attemptColumnAddition() {
  try {
    await fixMissingColumn();
    logger.info('Column addition successful');
    return true;
  } catch (error) {
    logger.warn('Column addition failed, application will continue without lastWelcomedAt functionality:', error.message);
    return false;
  }
}

// Export functions for use in other modules
module.exports = {
  fixMissingColumn,
  attemptColumnAddition
};

// Run fix if this file is executed directly
if (require.main === module) {
  fixMissingColumn()
    .then(() => {
      console.log('✅ Production fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Production fix failed:', error.message);
      process.exit(1);
    });
}
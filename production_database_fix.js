#!/usr/bin/env node

/**
 * Production Database Fix Script
 * 
 * This script fixes the missing fullName and profilePicture columns in the production database.
 * It can be run on the production server where the environment variables are properly configured.
 * 
 * Usage:
 *   node production_database_fix.js
 * 
 * Requirements:
 *   - Environment variables for database connection must be set
 *   - DB_CONNECTION_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT
 */

const { sequelize } = require('./src/database/connection');
const logger = require('./src/utils/logger');

async function fixProductionDatabase() {
  try {
    logger.info('🚀 Starting PRODUCTION database fix for missing User table columns...');
    
    // Verify we're connected to the right database
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    const dbName = sequelize.getDatabaseName();
    const dbHost = sequelize.config.host;
    
    logger.info('✅ Database connection established successfully', {
      dialect,
      database: dbName,
      host: dbHost,
      port: sequelize.config.port
    });
    
    // Safety check - warn if this looks like a production database
    if (dbHost && dbHost.includes('ondigitalocean.com')) {
      logger.info('🔥 PRODUCTION DATABASE DETECTED - proceeding with caution');
    } else if (dialect === 'sqlite') {
      logger.warn('⚠️  SQLite detected - this may not be production database');
    }
    
    // First ensure the users table exists by syncing models
    logger.info('🔄 Ensuring database tables exist...');
    const User = require('./src/models/User');
    
    try {
      // Try to sync without altering first to see if table exists
      await User.sync({ force: false });
      logger.info('✅ User table exists or created successfully');
    } catch (syncError) {
      logger.warn('User table sync failed, will try with alter:', syncError.message);
      // If sync fails, try with alter
      await User.sync({ alter: true });
      logger.info('✅ User table synced with alter');
    }
    
    // Check which columns are missing
    let missingColumns = [];
    
    if (dialect === 'postgres') {
      // PostgreSQL query to check for missing columns
      const requiredColumns = ['fullName', 'profilePicture'];
      
      for (const columnName of requiredColumns) {
        const [result] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name = '${columnName}'
          AND table_schema = current_schema();
        `);
        
        if (result.length === 0) {
          missingColumns.push(columnName);
        }
      }
    } else if (dialect === 'sqlite') {
      // SQLite query to check for missing columns
      try {
        const [columns] = await sequelize.query(`PRAGMA table_info(users);`);
        const existingColumns = columns.map(col => col.name);
        
        if (!existingColumns.includes('fullName')) {
          missingColumns.push('fullName');
        }
        if (!existingColumns.includes('profilePicture')) {
          missingColumns.push('profilePicture');
        }
        
        logger.info(`🔍 Existing columns: ${existingColumns.join(', ')}`);
      } catch (error) {
        logger.warn('Could not get table info:', error.message);
        missingColumns = ['fullName', 'profilePicture']; // Assume missing
      }
    }
    
    logger.info(`📋 Missing columns detected: ${missingColumns.length > 0 ? missingColumns.join(', ') : 'none'}`);
    
    // Add missing columns
    for (const columnName of missingColumns) {
      logger.info(`➕ Adding ${columnName} column to users table...`);
      
      try {
        if (dialect === 'postgres') {
          if (columnName === 'fullName') {
            await sequelize.query(`
              ALTER TABLE users 
              ADD COLUMN "fullName" VARCHAR(255) NULL;
            `);
            
            await sequelize.query(`
              COMMENT ON COLUMN users."fullName" IS 'Full name from WhatsApp profile';
            `);
          } else if (columnName === 'profilePicture') {
            await sequelize.query(`
              ALTER TABLE users 
              ADD COLUMN "profilePicture" VARCHAR(512) NULL;
            `);
            
            await sequelize.query(`
              COMMENT ON COLUMN users."profilePicture" IS 'WhatsApp profile picture URL';
            `);
          }
        } else if (dialect === 'sqlite') {
          if (columnName === 'fullName') {
            await sequelize.query(`ALTER TABLE users ADD COLUMN fullName TEXT;`);
          } else if (columnName === 'profilePicture') {
            await sequelize.query(`ALTER TABLE users ADD COLUMN profilePicture TEXT;`);
          }
        }
        
        logger.info(`✅ ${columnName} column added successfully`);
      } catch (addError) {
        if (addError.message.includes('already exists') || addError.message.includes('duplicate column')) {
          logger.info(`ℹ️ ${columnName} column already exists (detected during add attempt)`);
        } else {
          logger.error(`❌ Failed to add ${columnName} column:`, addError.message);
          throw addError;
        }
      }
    }
    
    // Final sync to ensure everything is properly aligned
    logger.info('🔄 Final model sync to ensure schema alignment...');
    await User.sync({ alter: true });
    logger.info('✅ Final sync completed');
    
    // Verify all required columns now exist
    logger.info('🔍 Verifying all required columns exist...');
    
    if (dialect === 'postgres') {
      const [columnCheck] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('fullName', 'profilePicture', 'lastWelcomedAt')
        AND table_schema = current_schema()
        ORDER BY column_name;
      `);
      
      logger.info('📋 Final column status:');
      columnCheck.forEach(col => {
        logger.info(`   ✅ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      
      // Check if we have all required columns
      const requiredCols = ['fullName', 'profilePicture', 'lastWelcomedAt'];
      const foundCols = columnCheck.map(c => c.column_name);
      const stillMissing = requiredCols.filter(col => !foundCols.includes(col));
      
      if (stillMissing.length > 0) {
        throw new Error(`Still missing columns: ${stillMissing.join(', ')}`);
      }
    } else if (dialect === 'sqlite') {
      const [columns] = await sequelize.query(`PRAGMA table_info(users);`);
      const targetColumns = columns.filter(col => 
        ['fullName', 'profilePicture', 'lastWelcomedAt'].includes(col.name)
      );
      
      logger.info('📋 Final column status:');
      targetColumns.forEach(col => {
        logger.info(`   ✅ ${col.name}: ${col.type} (nullable: ${col.notnull === 0})`);
      });
    }
    
    // Test a User query to ensure everything works
    logger.info('🧪 Testing User model query with new columns...');
    
    try {
      const testUser = await User.findOne({
        limit: 1,
        attributes: ['id', 'whatsappNumber', 'fullName', 'profilePicture', 'lastWelcomedAt']
      });
      
      if (testUser) {
        logger.info('✅ User model query successful - all columns accessible');
        logger.info(`   Test user: ${testUser.whatsappNumber} (${testUser.fullName || 'no name'})`);
      } else {
        logger.info('ℹ️ No users in database yet, but query structure is valid');
      }
    } catch (queryError) {
      logger.error('❌ User model query failed:', queryError.message);
      throw queryError;
    }
    
    logger.info('🎉 PRODUCTION DATABASE FIX COMPLETED SUCCESSFULLY!');
    logger.info('🔥 The fullName column issue should now be resolved');
    
    return {
      success: true,
      columnsAdded: missingColumns,
      dialect,
      database: dbName
    };
    
  } catch (error) {
    logger.error('❌ PRODUCTION DATABASE FIX FAILED:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  fixProductionDatabase()
    .then((result) => {
      logger.info('✅ Production database fix completed successfully', result);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Production database fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixProductionDatabase };
const express = require('express');
const router = express.Router();
const databaseMigration = require('../services/databaseMigration');
const startupMigration = require('../services/startupMigration');
const logger = require('../utils/logger');

// Manual migration endpoint for testing
router.post('/run-migrations', async (req, res) => {
  try {
    logger.info('Manual migration triggered');
    
    // Run Rubies wallet column migration
    await databaseMigration.ensureRubiesWalletColumns();
    
    // Run all migrations
    await databaseMigration.runMigrations();
    
    res.json({
      success: true,
      message: 'Migrations completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual migration failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Migration failed'
    });
  }
});

// Check if Rubies wallet columns exist
router.get('/check-rubies-columns', async (req, res) => {
  try {
    const columns = [
      'rubiesAccountNumber',
      'rubiesCustomerId', 
      'rubiesWalletStatus',
      'lastSyncAt'
    ];
    
    const results = {};
    for (const column of columns) {
      results[column] = await databaseMigration.columnExists('Wallets', column);
    }
    
    res.json({
      success: true,
      columns: results,
      allExist: Object.values(results).every(exists => exists),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to check Rubies columns', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to check columns'
    });
  }
});

// Force run startup migrations
router.post('/force-startup-migrations', async (req, res) => {
  try {
    logger.info('Force startup migration triggered');
    
    await startupMigration.forceRunMigrations();
    
    res.json({
      success: true,
      message: 'Startup migrations completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Force startup migration failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Startup migration failed'
    });
  }
});

module.exports = router;

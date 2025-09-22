const databaseMigration = require('./databaseMigration');
const logger = require('../utils/logger');

class StartupMigrationService {
  constructor() {
    this.hasRun = false;
  }

  // Run migrations on application startup
  async runStartupMigrations() {
    if (this.hasRun) {
      logger.info('Startup migrations already run, skipping');
      return;
    }

    try {
      logger.info('Running startup database migrations');
      
      // Ensure Rubies wallet columns exist
      await databaseMigration.ensureRubiesWalletColumns();
      
      // Run any other pending migrations
      await databaseMigration.runMigrations();
      
      this.hasRun = true;
      logger.info('Startup migrations completed successfully');
    } catch (error) {
      logger.error('Startup migrations failed', {
        error: error.message,
        stack: error.stack
      });
      // Don't throw error to prevent app startup failure
      // The app should still start even if migrations fail
    }
  }

  // Force run migrations (useful for manual triggers)
  async forceRunMigrations() {
    this.hasRun = false;
    return await this.runStartupMigrations();
  }
}

module.exports = new StartupMigrationService();

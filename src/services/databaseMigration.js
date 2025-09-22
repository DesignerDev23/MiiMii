const { sequelize } = require('../database/connection');
const logger = require('../utils/logger');

class DatabaseMigrationService {
  constructor() {
    this.migrations = [
      {
        name: 'add_rubies_wallet_columns',
        description: 'Add Rubies wallet integration columns to Wallet table',
        async run() {
          const queryInterface = sequelize.getQueryInterface();
          
          try {
            // Check if rubiesAccountNumber column exists
            const tableDescription = await queryInterface.describeTable('Wallets');
            
            if (!tableDescription.rubiesAccountNumber) {
              logger.info('Adding rubiesAccountNumber column to Wallets table');
              await queryInterface.addColumn('Wallets', 'rubiesAccountNumber', {
                type: 'VARCHAR(255)',
                allowNull: true,
                unique: true,
                comment: 'Rubies wallet account number'
              });
            }
            
            if (!tableDescription.rubiesCustomerId) {
              logger.info('Adding rubiesCustomerId column to Wallets table');
              await queryInterface.addColumn('Wallets', 'rubiesCustomerId', {
                type: 'VARCHAR(255)',
                allowNull: true,
                comment: 'Rubies customer ID'
              });
            }
            
            if (!tableDescription.rubiesWalletStatus) {
              logger.info('Adding rubiesWalletStatus column to Wallets table');
              await queryInterface.addColumn('Wallets', 'rubiesWalletStatus', {
                type: 'VARCHAR(50)',
                allowNull: true,
                comment: 'Rubies wallet status'
              });
            }
            
            if (!tableDescription.lastSyncAt) {
              logger.info('Adding lastSyncAt column to Wallets table');
              await queryInterface.addColumn('Wallets', 'lastSyncAt', {
                type: 'TIMESTAMP',
                allowNull: true,
                comment: 'Last sync with Rubies wallet'
              });
            }
            
            logger.info('Rubies wallet columns migration completed successfully');
            return { success: true, message: 'Rubies wallet columns added successfully' };
            
          } catch (error) {
            logger.error('Failed to add Rubies wallet columns', {
              error: error.message,
              stack: error.stack
            });
            throw error;
          }
        }
      }
    ];
  }

  // Run all pending migrations
  async runMigrations() {
    try {
      logger.info('Starting database migrations');
      
      for (const migration of this.migrations) {
        try {
          logger.info(`Running migration: ${migration.name}`);
          const result = await migration.run();
          logger.info(`Migration ${migration.name} completed`, result);
        } catch (error) {
          logger.error(`Migration ${migration.name} failed`, {
            error: error.message,
            stack: error.stack
          });
          // Continue with other migrations even if one fails
        }
      }
      
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Database migration process failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Run a specific migration
  async runMigration(migrationName) {
    const migration = this.migrations.find(m => m.name === migrationName);
    if (!migration) {
      throw new Error(`Migration ${migrationName} not found`);
    }
    
    try {
      logger.info(`Running specific migration: ${migrationName}`);
      const result = await migration.run();
      logger.info(`Migration ${migrationName} completed`, result);
      return result;
    } catch (error) {
      logger.error(`Migration ${migrationName} failed`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Check if a column exists in a table
  async columnExists(tableName, columnName) {
    try {
      const queryInterface = sequelize.getQueryInterface();
      const tableDescription = await queryInterface.describeTable(tableName);
      return !!tableDescription[columnName];
    } catch (error) {
      logger.error(`Failed to check if column ${columnName} exists in ${tableName}`, {
        error: error.message
      });
      return false;
    }
  }

  // Add a column if it doesn't exist
  async addColumnIfNotExists(tableName, columnName, columnDefinition) {
    try {
      const exists = await this.columnExists(tableName, columnName);
      if (!exists) {
        logger.info(`Adding column ${columnName} to ${tableName}`);
        const queryInterface = sequelize.getQueryInterface();
        await queryInterface.addColumn(tableName, columnName, columnDefinition);
        logger.info(`Column ${columnName} added successfully to ${tableName}`);
        return true;
      } else {
        logger.info(`Column ${columnName} already exists in ${tableName}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to add column ${columnName} to ${tableName}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Self-healing method for Rubies wallet columns
  async ensureRubiesWalletColumns() {
    try {
      logger.info('Ensuring Rubies wallet columns exist');
      
      const columns = [
        {
          name: 'rubiesAccountNumber',
          definition: {
            type: 'VARCHAR(255)',
            allowNull: true,
            unique: true,
            comment: 'Rubies wallet account number'
          }
        },
        {
          name: 'rubiesCustomerId',
          definition: {
            type: 'VARCHAR(255)',
            allowNull: true,
            comment: 'Rubies customer ID'
          }
        },
        {
          name: 'rubiesWalletStatus',
          definition: {
            type: 'VARCHAR(50)',
            allowNull: true,
            comment: 'Rubies wallet status'
          }
        },
        {
          name: 'lastSyncAt',
          definition: {
            type: 'TIMESTAMP',
            allowNull: true,
            comment: 'Last sync with Rubies wallet'
          }
        }
      ];

      for (const column of columns) {
        await this.addColumnIfNotExists('Wallets', column.name, column.definition);
      }
      
      logger.info('Rubies wallet columns ensured successfully');
      return { success: true, message: 'Rubies wallet columns are ready' };
    } catch (error) {
      logger.error('Failed to ensure Rubies wallet columns', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new DatabaseMigrationService();

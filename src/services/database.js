const { databaseManager } = require('../database/connection');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.databaseManager = databaseManager;
  }

  /**
   * Execute a database operation with automatic retry logic
   * @param {Function} operation - The database operation to execute
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum number of retry attempts
   * @param {string} options.operationName - Name of the operation for logging
   * @param {boolean} options.logErrors - Whether to log errors
   * @returns {Promise} - The result of the operation
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      operationName = 'database operation',
      logErrors = true
    } = options;

    return this.databaseManager.executeWithRetry(async () => {
      try {
        return await operation();
      } catch (error) {
        if (logErrors) {
          logger.error(`Failed to execute ${operationName}:`, {
            error: error.message,
            stack: error.stack
          });
        }
        throw error;
      }
    }, maxRetries);
  }

  /**
   * Execute a find operation with retry logic
   */
  async findWithRetry(model, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.findAll(options),
      { ...retryOptions, operationName: `find ${model.name}` }
    );
  }

  /**
   * Execute a findOne operation with retry logic
   */
  async findOneWithRetry(model, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.findOne(options),
      { ...retryOptions, operationName: `findOne ${model.name}` }
    );
  }

  /**
   * Execute a findByPk operation with retry logic
   */
  async findByPkWithRetry(model, id, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.findByPk(id, options),
      { ...retryOptions, operationName: `findByPk ${model.name}` }
    );
  }

  /**
   * Execute a create operation with retry logic
   */
  async createWithRetry(model, data, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.create(data, options),
      { ...retryOptions, operationName: `create ${model.name}` }
    );
  }

  /**
   * Execute an update operation with retry logic
   */
  async updateWithRetry(model, values, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.update(values, options),
      { ...retryOptions, operationName: `update ${model.name}` }
    );
  }

  /**
   * Execute a destroy operation with retry logic
   */
  async destroyWithRetry(model, options = {}, retryOptions = {}) {
    return this.executeWithRetry(
      () => model.destroy(options),
      { ...retryOptions, operationName: `destroy ${model.name}` }
    );
  }

  /**
   * Execute a transaction with retry logic
   */
  async transactionWithRetry(operation, retryOptions = {}) {
    return this.executeWithRetry(async () => {
      const sequelize = this.databaseManager.getSequelize();
      return sequelize.transaction(operation);
    }, { ...retryOptions, operationName: 'transaction' });
  }

  /**
   * Execute a raw query with retry logic
   */
  async queryWithRetry(sql, options = {}, retryOptions = {}) {
    return this.executeWithRetry(async () => {
      const sequelize = this.databaseManager.getSequelize();
      return sequelize.query(sql, options);
    }, { ...retryOptions, operationName: 'raw query' });
  }

  /**
   * Safe operation wrapper that continues execution even if database fails
   */
  async safeExecute(operation, options = {}) {
    const {
      operationName = 'database operation',
      fallbackValue = null,
      logWarning = true
    } = options;

    try {
      if (!this.databaseManager.isConnectionHealthy()) {
        if (logWarning) {
          logger.warn(`Skipping ${operationName} - database connection unhealthy`);
        }
        return fallbackValue;
      }

      return await this.executeWithRetry(operation, {
        operationName,
        maxRetries: 2,
        logErrors: false
      });
    } catch (error) {
      if (logWarning) {
        logger.warn(`Failed to execute ${operationName} - continuing without database:`, {
          error: error.message
        });
      }
      return fallbackValue;
    }
  }

  /**
   * Get database connection status
   */
  getConnectionStatus() {
    return this.databaseManager.getConnectionStatus();
  }

  /**
   * Check if database connection is healthy
   */
  isHealthy() {
    return this.databaseManager.isConnectionHealthy();
  }

  /**
   * Force reconnection attempt
   */
  async reconnect() {
    try {
      await this.databaseManager.connect();
      return true;
    } catch (error) {
      logger.error('Manual reconnection failed:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
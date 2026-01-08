const { supabase, databaseManager } = require('../database/connection');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.supabase = supabase;
    this.isHealthy = false;
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    
    this.startHealthMonitoring();
  }

  async executeWithRetry(operation, maxRetries = 3) {
    return databaseManager.executeWithRetry(operation, maxRetries);
  }

  async healthCheck() {
    try {
      if (!this.supabase) {
        this.isHealthy = false;
        return {
          isHealthy: false,
          error: 'Supabase client not initialized',
          lastCheck: this.lastHealthCheck
        };
      }

      const startTime = Date.now();
      // Use Supabase client instead of Sequelize (NO connection strings!)
      const { error } = await this.supabase.from('users').select('count').limit(1);
      const duration = Date.now() - startTime;
      
      if (error) {
        throw error;
      }
      
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
      
      logger.debug('Database health check passed', {
        duration: `${duration}ms`,
        isHealthy: this.isHealthy
      });
      
      return {
        isHealthy: true,
        duration,
        lastCheck: this.lastHealthCheck
      };
    } catch (error) {
      this.isHealthy = false;
      logger.warn('Database health check failed', {
        error: error.message,
        isHealthy: this.isHealthy
      });
      
      return {
        isHealthy: false,
        error: error.message,
        lastCheck: this.lastHealthCheck
      };
    }
  }

  startHealthMonitoring() {
    // Check database health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.healthCheck();
    }, 30000);

    // Initial health check
    this.healthCheck();
  }

  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  isConnectionHealthy() {
    return databaseManager.isConnectionHealthy();
  }

  getConnectionStatus() {
    return databaseManager.getConnectionStatus();
  }

  async gracefulShutdown() {
    this.stopHealthMonitoring();
    await databaseManager.gracefulShutdown();
  }

  // Helper methods for common operations
  async findOne(model, options) {
    return this.executeWithRetry(async () => {
      return await model.findOne(options);
    });
  }

  async findAll(model, options) {
    return this.executeWithRetry(async () => {
      return await model.findAll(options);
    });
  }

  async create(model, data) {
    return this.executeWithRetry(async () => {
      return await model.create(data);
    });
  }

  async update(model, data, options) {
    return this.executeWithRetry(async () => {
      return await model.update(data, options);
    });
  }

  async destroy(model, options) {
    return this.executeWithRetry(async () => {
      return await model.destroy(options);
    });
  }

  async transaction(callback) {
    return this.executeWithRetry(async () => {
      return await this.sequelize.transaction(callback);
    });
  }

  async query(sql, options) {
    return this.executeWithRetry(async () => {
      return await this.sequelize.query(sql, options);
    });
  }

  // Enhanced retry methods for UserService compatibility
  async findOneWithRetry(model, options, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'findOne' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.findOne(options);
    }, maxRetries);
  }

  async findWithRetry(model, options, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'findAll' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.findAll(options);
    }, maxRetries);
  }

  async findByPkWithRetry(model, id, options, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'findByPk' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.findByPk(id, options);
    }, maxRetries);
  }

  async createWithRetry(model, data, options = {}, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'create' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.create(data, options);
    }, maxRetries);
  }

  async updateWithRetry(model, data, options, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'update' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.update(data, options);
    }, maxRetries);
  }

  async destroyWithRetry(model, options, retryOptions = {}) {
    const { maxRetries = 3, operationName = 'destroy' } = retryOptions;
    return this.executeWithRetry(async () => {
      return await model.destroy(options);
    }, maxRetries);
  }

  async queryWithRetry(sql, options, retryOptions = {}) {
    // Note: Supabase client uses PostgREST, not direct SQL queries
    // This will need to be migrated to use Supabase client methods
    throw new Error('Direct SQL queries not supported with Supabase client. Use Supabase client methods instead.');
  }

  async safeExecute(operation, options = {}) {
    const { maxRetries = 3, operationName = 'operation', fallbackValue = null } = options;
    try {
      return await this.executeWithRetry(operation, maxRetries);
    } catch (error) {
      logger.error(`Safe execute failed for ${operationName}`, { error: error.message });
      if (fallbackValue !== null) {
        return fallbackValue;
      }
      throw error;
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
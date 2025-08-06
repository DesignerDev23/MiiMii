const { databaseManager } = require('../database/connection');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.sequelize = databaseManager.getSequelize();
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
      const startTime = Date.now();
      await this.sequelize.query('SELECT 1');
      const duration = Date.now() - startTime;
      
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
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
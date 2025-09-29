const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Configure Node.js to handle DigitalOcean SSL certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Function to create SSL configuration for DigitalOcean managed databases
function createDOSSLConfig() {
  return {
    require: true,
    rejectUnauthorized: false,
    // Accept any certificate from DigitalOcean
    checkServerIdentity: () => undefined,
    // Use modern TLS
    secureProtocol: 'TLSv1_2_method',
    // Additional options to handle certificate chains
    servername: undefined,
    // Disable certificate verification for managed databases
    ca: undefined,
    cert: undefined,
    key: undefined
  };
}

class DatabaseManager {
  constructor() {
    this.sequelize = null;
    this.isConnected = false;
    this.isShuttingDown = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5 seconds
    this.maxReconnectDelay = 60000; // Max 60 seconds
    this.healthCheckInterval = null;
    this.maintenanceInterval = null;
    this.connectionPromise = null;
    
    this.initialize();
  }

  initialize() {
    if (process.env.DB_CONNECTION_URL) {
      // Use DB_CONNECTION_URL for connection with SSL configuration
      const connectionUrl = process.env.DB_CONNECTION_URL;
      
      this.sequelize = new Sequelize(connectionUrl, {
        logging: process.env.NODE_ENV === 'development' 
          ? (msg) => logger.debug(msg) 
          : false,
        pool: {
          max: 10, // Reduced from 25 to prevent connection exhaustion
          min: 2, // Reduced from 5 to prevent idle connections
          acquire: 30000, // Reduced from 60000 to fail faster
          idle: 10000, // Reduced from 30000 to close idle connections faster
          evict: 5000, // Reduced from 10000 to evict faster
          handleDisconnects: true,
          validate: true, // Add connection validation
          testOnBorrow: true, // Test connections before use
          testOnReturn: false, // Don't test on return to avoid overhead
          testWhileIdle: true, // Test idle connections
          timeBetweenEvictionRunsMillis: 10000, // Check for eviction every 10 seconds
          numTestsPerEvictionRun: 3, // Test 3 connections per eviction run
          softIdleTimeoutMillis: 5000, // Soft idle timeout
          idleTimeoutMillis: 10000 // Hard idle timeout
        },
        dialectOptions: {
          ssl: connectionUrl.includes('sslmode=require') ? createDOSSLConfig() : false,
          // Add keep-alive settings
          keepAlive: true,
          keepAliveInitialDelayMillis: 0,
          // Connection timeout settings
          connectTimeout: 10000, // 10 seconds
          requestTimeout: 30000, // 30 seconds
          // Additional PostgreSQL-specific options
          application_name: 'MiiMii-Fintech-Platform',
          statement_timeout: 30000, // 30 seconds
          idle_in_transaction_session_timeout: 60000, // 1 minute
          // Connection pooling optimizations
          max: 10,
          min: 2,
          acquire: 30000,
          idle: 10000
        },
        retry: {
          match: [
            /ECONNRESET/,
            /ENOTFOUND/,
            /ECONNREFUSED/,
            /ETIMEDOUT/,
            /EHOSTUNREACH/,
            /self-signed certificate/,
            /certificate verify failed/,
            /connection terminated/,
            /connection reset/,
            /timeout/
          ],
          max: 5,
          backoffBase: 2000,
          backoffExponent: 1.5,
        },
        // Use hooks instead of connectionManager events
        hooks: {
          beforeConnect: () => {
            if (this.isShuttingDown) {
              throw new Error('Database is shutting down, cannot create new connections');
            }
            logger.debug('Attempting database connection...');
          },
          afterConnect: () => {
            logger.info('Database connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000; // Reset delay
          },
          beforeDisconnect: () => {
            logger.info('Database connection closing...');
          },
          afterDisconnect: () => {
            logger.warn('Database connection lost');
            this.isConnected = false;
            if (!this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }
      });
    } else if (process.env.DB_HOST) {
      // Fallback to individual connection parameters
      const isDigitalOceanDB = process.env.DB_HOST && process.env.DB_HOST.includes('db.ondigitalocean.com');
      
      this.sequelize = new Sequelize({
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' 
          ? (msg) => logger.debug(msg) 
          : false,
        pool: {
          max: 10, // Reduced from 25 to prevent connection exhaustion
          min: 2, // Reduced from 5 to prevent idle connections
          acquire: 30000, // Reduced from 60000 to fail faster
          idle: 10000, // Reduced from 30000 to close idle connections faster
          evict: 5000, // Reduced from 10000 to evict faster
          handleDisconnects: true,
          validate: true, // Add connection validation
          testOnBorrow: true, // Test connections before use
          testOnReturn: false, // Don't test on return to avoid overhead
          testWhileIdle: true, // Test idle connections
          timeBetweenEvictionRunsMillis: 10000, // Check for eviction every 10 seconds
          numTestsPerEvictionRun: 3, // Test 3 connections per eviction run
          softIdleTimeoutMillis: 5000, // Soft idle timeout
          idleTimeoutMillis: 10000 // Hard idle timeout
        },
        dialectOptions: {
          ssl: isDigitalOceanDB ? createDOSSLConfig() : false,
          // Add keep-alive settings
          keepAlive: true,
          keepAliveInitialDelayMillis: 0,
          // Connection timeout settings
          connectTimeout: 10000, // 10 seconds
          requestTimeout: 30000, // 30 seconds
          // Additional PostgreSQL-specific options
          application_name: 'MiiMii-Fintech-Platform',
          statement_timeout: 30000, // 30 seconds
          idle_in_transaction_session_timeout: 60000, // 1 minute
          // Connection pooling optimizations
          max: 10,
          min: 2,
          acquire: 30000,
          idle: 10000
        },
        retry: {
          match: [
            /ECONNRESET/,
            /ENOTFOUND/,
            /ECONNREFUSED/,
            /ETIMEDOUT/,
            /EHOSTUNREACH/,
            /self-signed certificate/,
            /certificate verify failed/,
            /connection terminated/,
            /connection reset/,
            /timeout/
          ],
          max: 5,
          backoffBase: 2000,
          backoffExponent: 1.5,
        },
        hooks: {
          beforeConnect: () => {
            if (this.isShuttingDown) {
              throw new Error('Database is shutting down, cannot create new connections');
            }
            logger.debug('Attempting database connection...');
          },
          afterConnect: () => {
            logger.info('Database connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000; // Reset delay
          },
          beforeDisconnect: () => {
            logger.info('Database connection closing...');
          },
          afterDisconnect: () => {
            logger.warn('Database connection lost');
            this.isConnected = false;
            if (!this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }
      });
    } else {
      // Create a dummy sequelize instance to prevent errors
      this.sequelize = new Sequelize('sqlite::memory:', {
        logging: false,
        dialectOptions: {}
      });
      logger.warn('No database configuration found - using in-memory SQLite for basic operation');
      return;
    }

    this.startHealthCheck();
    this.startMaintenance();
  }

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.attemptConnection();
    return this.connectionPromise;
  }

  async attemptConnection() {
    try {
      if (this.isShuttingDown) {
        throw new Error('Database is shutting down');
      }

      await this.sequelize.authenticate();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 5000;
      
      logger.info('✅ Database connection established successfully', {
        dialect: this.sequelize.getDialect(),
        database: this.sequelize.getDatabaseName(),
        host: this.sequelize.config.host,
        port: this.sequelize.config.port
      });

      // Self-healing migration removed - all BVN fields are now properly defined in the User model

      return this.sequelize;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Database connection failed:', {
        error: error.message,
        attempt: this.reconnectAttempts + 1,
        maxAttempts: this.maxReconnectAttempts
      });

      if (!this.isShuttingDown && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      } else {
        logger.error('Max reconnection attempts reached or shutting down');
      }

      throw error;
    } finally {
      this.connectionPromise = null;
    }
  }

  scheduleReconnect() {
    if (this.isShuttingDown || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    logger.info(`Scheduling database reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.attemptConnection();
        } catch (error) {
          // Error already logged in attemptConnection
        }
      }
    }, delay);
  }

  startHealthCheck() {
    // Check connection health every 15 seconds (more frequent)
    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        // Use a simple query to test connection
        await this.sequelize.query('SELECT 1 as health_check', { 
          type: this.sequelize.QueryTypes.SELECT,
          raw: true,
          timeout: 5000 // 5 second timeout for health check
        });
        
        if (!this.isConnected) {
          logger.info('Database connection restored');
          this.isConnected = true;
          this.reconnectAttempts = 0;
        }
      } catch (error) {
        if (this.isConnected) {
          logger.warn('Database health check failed:', error.message);
          this.isConnected = false;
          
          // Handle connection manager closure in health check
          if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
            logger.warn('Connection manager closed during health check, reinitializing...');
            this.initialize();
          }
          
          this.scheduleReconnect();
        }
      }
    }, 15000); // Reduced from 30 seconds to 15 seconds
  }

  startMaintenance() {
    // Run connection maintenance every 2 minutes
    this.maintenanceInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.maintainConnections();
      } catch (error) {
        logger.warn('Database maintenance interval failed:', error.message);
      }
    }, 120000); // 2 minutes
  }

  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.isShuttingDown) {
          throw new Error('Database is shutting down');
        }

        // Check for the specific connection manager closure error and reinitialize if needed
        if (lastError && lastError.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
          logger.warn('Connection manager was closed, reinitializing database connection...');
          this.initialize();
          await this.connect();
        } else if (!this.isConnected) {
          await this.connect();
        }

        return await operation();
      } catch (error) {
        lastError = error;
        
        // Special handling for connection manager closure
        if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
          logger.warn('Connection manager closed error detected, will reinitialize on next attempt');
          this.isConnected = false;
          
          if (attempt < maxRetries) {
            // Force reinitialize the connection on next attempt
            logger.info('Reinitializing database connection due to closed connection manager...');
            this.initialize();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          }
        }
        
        if (this.isConnectionError(error) && attempt < maxRetries) {
          logger.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
          this.isConnected = false;
          
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            await this.connect();
          } catch (connectError) {
            logger.error('Failed to reconnect during retry:', connectError.message);
          }
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  isConnectionError(error) {
    const connectionErrorMessages = [
      'ConnectionManager.getConnection was called after the connection manager was closed',
      'connection terminated',
      'connection reset',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EHOSTUNREACH'
    ];

    return connectionErrorMessages.some(msg => 
      error.message && error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }


  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Initiating graceful database shutdown...');

    // Clear health check and maintenance intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }

    try {
      // Wait for ongoing operations to complete (max 10 seconds)
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Database shutdown timeout reached, forcing close');
      }, 10000);

      // Close the connection
      if (this.sequelize) {
        try {
          await this.sequelize.close();
          logger.info('✅ Database connection closed gracefully');
        } catch (closeError) {
          // Handle case where connection manager is already closed
          if (closeError.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
            logger.info('✅ Database connection was already closed');
          } else {
            throw closeError;
          }
        }
      }

      clearTimeout(shutdownTimeout);
    } catch (error) {
      logger.error('Error during database shutdown:', error.message);
    } finally {
      this.isConnected = false;
    }
  }

  getSequelize() {
    return this.sequelize;
  }

  isConnectionHealthy() {
    return this.isConnected && !this.isShuttingDown;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isShuttingDown: this.isShuttingDown,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  // Add connection monitoring and statistics
  async getConnectionStats() {
    try {
      if (!this.sequelize) {
        return { error: 'Database not initialized' };
      }

      const pool = this.sequelize.connectionManager.pool;
      if (!pool) {
        return { error: 'Connection pool not available' };
      }

      return {
        totalConnections: pool.size,
        usedConnections: pool.used,
        idleConnections: pool.pending,
        waitingRequests: pool.pending,
        isHealthy: this.isConnected && !this.isShuttingDown,
        lastHealthCheck: new Date().toISOString()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Add proactive connection maintenance
  async maintainConnections() {
    try {
      if (this.isShuttingDown || !this.isConnected) {
        return;
      }

      // Test a few connections in the pool
      const testQueries = [];
      for (let i = 0; i < Math.min(3, 5); i++) {
        testQueries.push(
          this.sequelize.query('SELECT 1 as maintenance_check', { 
            type: this.sequelize.QueryTypes.SELECT,
            raw: true,
            timeout: 3000
          }).catch(err => ({ error: err.message }))
        );
      }

      const results = await Promise.all(testQueries);
      const failedQueries = results.filter(r => r.error);
      
      if (failedQueries.length > 0) {
        logger.warn(`Database maintenance found ${failedQueries.length} failed connections`);
        // Force pool refresh if too many connections are bad
        if (failedQueries.length >= 2) {
          logger.info('Refreshing connection pool due to multiple failed connections');
          await this.sequelize.connectionManager.close();
          await this.sequelize.connectionManager.initPools();
        }
      }
    } catch (error) {
      logger.warn('Database maintenance failed:', error.message);
    }
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export the manager and sequelize instance
module.exports = { 
  sequelize: databaseManager.getSequelize(),
  databaseManager
};
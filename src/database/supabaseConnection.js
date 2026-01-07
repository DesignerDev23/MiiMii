const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Supabase Database Connection Configuration
 * 
 * Supabase uses PostgreSQL with SSL connections.
 * Connection string format:
 * postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require
 * 
 * Or use individual parameters with SSL enabled.
 */

// Function to create SSL configuration for Supabase
function createSupabaseSSLConfig() {
  return {
    require: true,
    rejectUnauthorized: false, // Supabase uses valid certificates, but this allows flexibility
    // Supabase provides valid SSL certificates, but we keep rejectUnauthorized: false
    // for compatibility with connection pooling and various network configurations
  };
}

class SupabaseDatabaseManager {
  constructor() {
    this.sequelize = null;
    this.isConnected = false;
    this.isShuttingDown = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5 seconds
    this.maxReconnectDelay = 60000; // Max 60 seconds
    this.healthCheckInterval = null;
    this.connectionPromise = null;
    
    this.initialize();
  }

  initialize() {
    // Prefer individual parameters over connection string
    // This allows better control and avoids URL encoding issues
    
    if (process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD) {
      // Use individual Supabase connection parameters (preferred)
      const isSupabasePooler = process.env.SUPABASE_DB_HOST.includes('pooler.supabase.com');
      const defaultPort = isSupabasePooler ? 6543 : 5432;
      
      this.sequelize = new Sequelize({
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        username: process.env.SUPABASE_DB_USER || 'postgres',
        password: process.env.SUPABASE_DB_PASSWORD,
        host: process.env.SUPABASE_DB_HOST,
        port: parseInt(process.env.SUPABASE_DB_PORT) || defaultPort,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' 
          ? (msg) => logger.debug(msg) 
          : false,
        pool: {
          max: 25,
          min: 5,
          acquire: 60000,
          idle: 30000,
          evict: 10000,
          handleDisconnects: true
        },
        dialectOptions: {
          ssl: createSupabaseSSLConfig(),
          application_name: 'miimii-api',
          connectTimeout: 10000,
          // Force IPv4 to avoid IPv6 connection issues (EHOSTUNREACH)
          family: 4
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
            /timeout/,
            /Connection terminated unexpectedly/,
            /server closed the connection/
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
            logger.debug('Attempting Supabase database connection...');
          },
          afterConnect: () => {
            logger.info('Supabase database connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000;
          },
          beforeDisconnect: () => {
            logger.info('Supabase database connection closing...');
          },
          afterDisconnect: () => {
            logger.warn('Supabase database connection lost');
            this.isConnected = false;
            if (!this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }
      });
    } else if (process.env.SUPABASE_DB_URL) {
      // Use Supabase connection URL (recommended)
      const connectionUrl = process.env.SUPABASE_DB_URL;
      
      this.sequelize = new Sequelize(connectionUrl, {
        logging: process.env.NODE_ENV === 'development' 
          ? (msg) => logger.debug(msg) 
          : false,
        dialect: 'postgres',
        pool: {
          max: 25, // Supabase connection pooler supports up to 200 connections
          min: 5,
          acquire: 60000,
          idle: 30000,
          evict: 10000,
          handleDisconnects: true
        },
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false // Supabase uses valid certificates
          },
          // Supabase connection pooler settings
          application_name: 'miimii-api',
          // Connection timeout
          connectTimeout: 10000,
          // Force IPv4 to avoid IPv6 connection issues (EHOSTUNREACH)
          family: 4
          // Force IPv4 to avoid IPv6 connection issues
          family: 4
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
            /timeout/,
            /Connection terminated unexpectedly/,
            /server closed the connection/
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
            logger.debug('Attempting Supabase database connection...');
          },
          afterConnect: () => {
            logger.info('Supabase database connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000; // Reset delay
          },
          beforeDisconnect: () => {
            logger.info('Supabase database connection closing...');
          },
          afterDisconnect: () => {
            logger.warn('Supabase database connection lost');
            this.isConnected = false;
            if (!this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }
      });
    } else if (process.env.SUPABASE_DB_HOST) {
      // Use individual Supabase connection parameters
      const isSupabasePooler = process.env.SUPABASE_DB_HOST.includes('pooler.supabase.com');
      const defaultPort = isSupabasePooler ? 6543 : 5432; // Pooler uses 6543, direct uses 5432
      
      this.sequelize = new Sequelize({
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        username: process.env.SUPABASE_DB_USER || 'postgres',
        password: process.env.SUPABASE_DB_PASSWORD,
        host: process.env.SUPABASE_DB_HOST,
        port: parseInt(process.env.SUPABASE_DB_PORT) || defaultPort,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' 
          ? (msg) => logger.debug(msg) 
          : false,
        pool: {
          max: 25,
          min: 5,
          acquire: 60000,
          idle: 30000,
          evict: 10000,
          handleDisconnects: true
        },
        dialectOptions: {
          ssl: createSupabaseSSLConfig(),
          application_name: 'miimii-api',
          connectTimeout: 10000,
          // Force IPv4 to avoid IPv6 connection issues (EHOSTUNREACH)
          family: 4
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
            /timeout/,
            /Connection terminated unexpectedly/,
            /server closed the connection/
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
            logger.debug('Attempting Supabase database connection...');
          },
          afterConnect: () => {
            logger.info('Supabase database connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000;
          },
          beforeDisconnect: () => {
            logger.info('Supabase database connection closing...');
          },
          afterDisconnect: () => {
            logger.warn('Supabase database connection lost');
            this.isConnected = false;
            if (!this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }
      });
      } else {
        // No Supabase configuration found - log error and create disabled instance
        logger.error('❌ No Supabase database configuration found!', {
          availableEnvVars: {
            hasSupabaseDbUrl: !!process.env.SUPABASE_DB_URL,
            hasSupabaseDbHost: !!process.env.SUPABASE_DB_HOST,
            hasSupabaseDbPassword: !!process.env.SUPABASE_DB_PASSWORD,
            hasDbConnectionUrl: !!process.env.DB_CONNECTION_URL,
            dbConnectionUrlIsSupabase: process.env.DB_CONNECTION_URL?.includes('supabase') || false
          },
          instructions: 'Please set SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) environment variables. See SUPABASE_MIGRATION_GUIDE.md for details.'
        });
        
        // Create a disabled PostgreSQL instance (won't actually connect)
        // This prevents errors when sequelize is accessed but won't allow queries
        this.sequelize = new Sequelize({
          dialect: 'postgres',
          logging: false,
          // Don't set host/database so it won't try to connect
          // This will fail gracefully when authenticate() is called
        });
        logger.warn('⚠️ Database connection disabled - database features will not work until SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD are configured');
        return;
      }
        
        this.sequelize = new Sequelize(connectionUrl, {
          logging: process.env.NODE_ENV === 'development' 
            ? (msg) => logger.debug(msg) 
            : false,
          dialect: 'postgres',
          pool: {
            max: 25,
            min: 5,
            acquire: 60000,
            idle: 30000,
            evict: 10000,
            handleDisconnects: true
          },
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: false
            },
            application_name: 'miimii-api',
            connectTimeout: 10000,
            // Force IPv4 to avoid IPv6 connection issues (EHOSTUNREACH)
            family: 4
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
              /timeout/,
              /Connection terminated unexpectedly/,
              /server closed the connection/
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
              logger.debug('Attempting Supabase database connection...');
            },
            afterConnect: () => {
              logger.info('Supabase database connection established');
              this.isConnected = true;
              this.reconnectAttempts = 0;
              this.reconnectDelay = 5000;
            },
            beforeDisconnect: () => {
              logger.info('Supabase database connection closing...');
            },
            afterDisconnect: () => {
              logger.warn('Supabase database connection lost');
              this.isConnected = false;
              if (!this.isShuttingDown) {
                this.scheduleReconnect();
              }
          }
        }
      });
      } else {
        // No Supabase configuration found - log error and create disabled instance
        logger.error('❌ No Supabase database configuration found!', {
          availableEnvVars: {
            hasSupabaseDbUrl: !!process.env.SUPABASE_DB_URL,
            hasSupabaseDbHost: !!process.env.SUPABASE_DB_HOST,
            hasDbConnectionUrl: !!process.env.DB_CONNECTION_URL,
            dbConnectionUrlIsSupabase: process.env.DB_CONNECTION_URL?.includes('supabase.com') || false
          },
          instructions: 'Please set SUPABASE_DB_URL or SUPABASE_DB_HOST environment variables. See SUPABASE_MIGRATION_GUIDE.md for details.'
        });
        
        // Create a disabled PostgreSQL instance (won't actually connect)
        // This prevents errors when sequelize is accessed but won't allow queries
        this.sequelize = new Sequelize({
          dialect: 'postgres',
          logging: false,
          // Don't set host/database so it won't try to connect
          // This will fail gracefully when authenticate() is called
        });
        logger.warn('⚠️ Database connection disabled - database features will not work until SUPABASE_DB_URL is configured');
        return;
      }
    }

    this.startHealthCheck();
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
      
      logger.info('✅ Supabase database connection established successfully', {
        dialect: this.sequelize.getDialect(),
        database: this.sequelize.getDatabaseName(),
        host: this.sequelize.config.host,
        port: this.sequelize.config.port
      });

      return this.sequelize;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Supabase database connection failed:', {
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
    
    logger.info(`Scheduling Supabase database reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
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
    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.sequelize.query('SELECT 1');
        if (!this.isConnected) {
          logger.info('Supabase database connection restored');
          this.isConnected = true;
          this.reconnectAttempts = 0;
        }
      } catch (error) {
        if (this.isConnected) {
          logger.warn('Supabase database health check failed:', error.message);
          this.isConnected = false;
          
          if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
            logger.warn('Connection manager closed during health check, reinitializing...');
            this.initialize();
          }
          
          this.scheduleReconnect();
        }
      }
    }, 30000);
  }

  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.isShuttingDown) {
          throw new Error('Database is shutting down');
        }

        if (lastError && lastError.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
          logger.warn('Connection manager was closed, reinitializing Supabase database connection...');
          this.initialize();
          await this.connect();
        } else if (!this.isConnected) {
          await this.connect();
        }

        return await operation();
      } catch (error) {
        lastError = error;
        
        if (error.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
          logger.warn('Connection manager closed error detected, will reinitialize on next attempt');
          this.isConnected = false;
          
          if (attempt < maxRetries) {
            logger.info('Reinitializing Supabase database connection due to closed connection manager...');
            this.initialize();
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
        
        if (this.isConnectionError(error) && attempt < maxRetries) {
          logger.warn(`Supabase database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
          this.isConnected = false;
          
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            await this.connect();
          } catch (connectError) {
            logger.error('Failed to reconnect to Supabase during retry:', connectError.message);
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
      'EHOSTUNREACH',
      'Connection terminated unexpectedly',
      'server closed the connection'
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
    logger.info('Initiating graceful Supabase database shutdown...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Supabase database shutdown timeout reached, forcing close');
      }, 10000);

      if (this.sequelize) {
        try {
          await this.sequelize.close();
          logger.info('✅ Supabase database connection closed gracefully');
        } catch (closeError) {
          if (closeError.message.includes('ConnectionManager.getConnection was called after the connection manager was closed')) {
            logger.info('✅ Supabase database connection was already closed');
          } else {
            throw closeError;
          }
        }
      }

      clearTimeout(shutdownTimeout);
    } catch (error) {
      logger.error('Error during Supabase database shutdown:', error.message);
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
}

// Create singleton instance
const supabaseDatabaseManager = new SupabaseDatabaseManager();

// Export the manager and sequelize instance
module.exports = { 
  sequelize: supabaseDatabaseManager.getSequelize(),
  databaseManager: supabaseDatabaseManager
};


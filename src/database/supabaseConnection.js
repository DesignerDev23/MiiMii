const { createClient } = require('@supabase/supabase-js');
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Supabase client (like your other app)
let supabaseClient = null;

class SupabaseDatabaseManager {
  constructor() {
    this.sequelize = null;
    this.supabase = null;
    this.isConnected = false;
    this.isShuttingDown = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5 seconds
    this.maxReconnectDelay = 60000; // Max 60 seconds
    this.healthCheckInterval = null;
    this.connectionPromise = null;
    
    // Initialize synchronously - DNS resolution will happen on first connection
    this.initialize();
  }

  initialize() {
    // Use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (like your other app)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Create Supabase client (like your other app)
      supabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );
      this.supabase = supabaseClient;
      
      // For Sequelize, we need the database password to build connection string
      // Extract project ref from URL
      const urlMatch = process.env.SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
      if (urlMatch) {
        const projectRef = urlMatch[1];
        
        // Try to use SUPABASE_DB_PASSWORD if provided
        if (process.env.SUPABASE_DB_PASSWORD) {
          // Use direct connection (db.*.supabase.co:5432)
          const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
          this.sequelize = new Sequelize(connectionString, {
            dialect: 'postgres',
            logging: false,
            dialectOptions: {
              ssl: { require: true, rejectUnauthorized: false }
            }
          });
          this.startHealthCheck();
          logger.info('✅ Supabase client and Sequelize initialized');
          return;
        }
        
        // If no password, try SUPABASE_DB_URL as fallback
        if (process.env.SUPABASE_DB_URL) {
          this.sequelize = new Sequelize(process.env.SUPABASE_DB_URL, {
            dialect: 'postgres',
            logging: false,
            dialectOptions: {
              ssl: { require: true, rejectUnauthorized: false }
            }
          });
          this.startHealthCheck();
          logger.info('✅ Supabase client initialized, Sequelize using SUPABASE_DB_URL');
          return;
        }
        
        logger.warn('⚠️ Supabase client initialized, but Sequelize needs SUPABASE_DB_PASSWORD or SUPABASE_DB_URL');
        this.sequelize = new Sequelize({ dialect: 'postgres', logging: false });
        return;
      }
    }
    
    // Fallback: Use SUPABASE_DB_URL directly
    if (process.env.SUPABASE_DB_URL) {
      logger.info('✅ Connecting using SUPABASE_DB_URL');
      this.sequelize = new Sequelize(process.env.SUPABASE_DB_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
          ssl: { require: true, rejectUnauthorized: false }
        }
      });
      this.startHealthCheck();
      return;
    }
    
    // No config found
    logger.error('❌ No Supabase configuration! Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_DB_URL)');
    this.sequelize = new Sequelize({ dialect: 'postgres', logging: false });
  }
  
  // Test connection (like your other app)
  async testConnection() {
    try {
      if (this.supabase) {
        // Test using Supabase client
        const { data, error } = await this.supabase.from('users').select('count').limit(1);
        if (error) {
          logger.error('Supabase client connection test failed', { error: error.message });
          throw error;
        }
        logger.info('✅ Supabase client connection test successful');
      }
      
      // Test Sequelize connection
      if (this.sequelize && this.sequelize.config) {
        await this.sequelize.authenticate();
        logger.info('✅ Sequelize connection test successful');
      }
      
      return true;
    } catch (error) {
      logger.error('Database connection test failed', { error: error.message });
      throw error;
    }
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

// Export the manager, sequelize instance, and supabase client
module.exports = { 
  sequelize: supabaseDatabaseManager.getSequelize(),
  databaseManager: supabaseDatabaseManager,
  supabase: supabaseDatabaseManager.supabase || supabaseClient || null,
  testConnection: () => supabaseDatabaseManager.testConnection()
};


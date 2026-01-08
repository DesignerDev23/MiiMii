const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Supabase client (like your other app - NO connection strings!)
let supabaseClient = null;

class SupabaseDatabaseManager {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
    this.isShuttingDown = false;
    
    this.initialize();
  }

  initialize() {
    // SIMPLE: Just use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (like your other app)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
      logger.info('✅ Supabase client initialized (no connection strings needed!)');
    } else {
      logger.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY!');
    }
  }

  // Test connection (like your other app)
  async testConnection() {
    try {
      if (!this.supabase) {
        throw new Error('Supabase client not initialized');
      }
      
      // Test using Supabase client
      const { data, error } = await this.supabase.from('users').select('count').limit(1);
      if (error) {
        logger.error('Supabase client connection test failed', { error: error.message });
        throw error;
      }
      
      logger.info('✅ Supabase client connection test successful');
      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('Database connection test failed', { error: error.message });
      this.isConnected = false;
      throw error;
    }
  }

  getSupabase() {
    return this.supabase;
  }

  isConnectionHealthy() {
    return this.isConnected && !this.isShuttingDown;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isShuttingDown: this.isShuttingDown
    };
  }

  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Initiating graceful Supabase shutdown...');
    this.isConnected = false;
  }

  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.isShuttingDown) {
          throw new Error('Database is shutting down');
        }

        if (!this.isConnected && attempt > 1) {
          // Try to reconnect
          await this.testConnection();
        }

        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.warn(`Supabase operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

// Create singleton instance
const supabaseDatabaseManager = new SupabaseDatabaseManager();

// Export the manager and supabase client
module.exports = { 
  supabase: supabaseDatabaseManager.getSupabase() || supabaseClient || null,
  databaseManager: supabaseDatabaseManager,
  testConnection: () => supabaseDatabaseManager.testConnection()
};

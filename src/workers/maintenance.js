const cron = require('node-cron');
// Environment variables are loaded from Digital Ocean App Platform

const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { sequelize } = require('../database/connection');

class MaintenanceWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
  }

  async start() {
    try {
      logger.info('Starting maintenance worker...');

      // Initialize connections
      await sequelize.authenticate();
      logger.info('Database connection established');

      const redisConnected = await redisClient.connect();
      if (redisConnected) {
        logger.info('Redis connection established');
      } else {
        logger.warn('Redis connection failed - some maintenance tasks will be skipped');
      }

      this.isRunning = true;
      await this.scheduleJobs();
      
      logger.info('Maintenance worker started successfully');
    } catch (error) {
      logger.error('Failed to start maintenance worker:', error);
      process.exit(1);
    }
  }

  async scheduleJobs() {
    // Clean expired sessions every 15 minutes
    this.jobs.set('cleanSessions', cron.schedule('*/15 * * * *', async () => {
      await this.cleanExpiredSessions();
    }, { scheduled: false }));

    // Process pending transactions every 5 minutes
    this.jobs.set('processTransactions', cron.schedule('*/5 * * * *', async () => {
      await this.processPendingTransactions();
    }, { scheduled: false }));

    // Database maintenance every hour
    this.jobs.set('dbMaintenance', cron.schedule('0 * * * *', async () => {
      await this.performDatabaseMaintenance();
    }, { scheduled: false }));

    // Clean old logs every day at 2 AM
    this.jobs.set('cleanLogs', cron.schedule('0 2 * * *', async () => {
      await this.cleanOldLogs();
    }, { scheduled: false }));

    // Apply maintenance fee monthly (1st day of month at 3 AM)
    this.jobs.set('maintenanceFee', cron.schedule('0 3 1 * *', async () => {
      await this.applyMaintenanceFees();
    }, { scheduled: false }));

    // Start all scheduled jobs
    for (const [name, job] of this.jobs) {
      job.start();
      logger.info(`Scheduled job: ${name}`);
    }
  }

  async cleanExpiredSessions() {
    try {
      logger.info('Cleaning expired sessions...');
      
      if (!redisClient.isConnected) {
        logger.warn('Redis not connected, skipping session cleanup');
        return;
      }

      // This would typically be handled by Redis TTL automatically
      // But we can add custom cleanup logic here if needed
      
      logger.info('Session cleanup completed');
    } catch (error) {
      logger.error('Error cleaning expired sessions:', error);
    }
  }

  async processPendingTransactions() {
    try {
      logger.info('Processing pending transactions...');

      // Check for transactions that might be stuck in pending state
      const [pendingTransactions] = await sequelize.query(`
        SELECT id, user_id, amount, status, created_at 
        FROM transactions 
        WHERE status = 'pending' 
        AND created_at < NOW() - INTERVAL '30 minutes'
        LIMIT 100
      `);

      if (pendingTransactions.length > 0) {
        logger.info(`Found ${pendingTransactions.length} stuck pending transactions`);
        
        for (const transaction of pendingTransactions) {
          try {
            // Here you would implement logic to retry or mark as failed
            logger.info(`Processing stuck transaction: ${transaction.id}`);
            
            // Example: Mark as failed after 30 minutes
            await sequelize.query(`
              UPDATE transactions 
              SET status = 'failed', 
                  updated_at = NOW(),
                  failure_reason = 'Transaction timeout'
              WHERE id = ?
            `, {
              replacements: [transaction.id]
            });

            // Invalidate user cache
            if (redisClient.isConnected) {
              await redisClient.invalidateUserCache(transaction.user_id);
            }

          } catch (error) {
            logger.error(`Error processing transaction ${transaction.id}:`, error);
          }
        }
      }

      logger.info('Pending transaction processing completed');
    } catch (error) {
      logger.error('Error processing pending transactions:', error);
    }
  }

  async performDatabaseMaintenance() {
    try {
      logger.info('Performing database maintenance...');

      // Analyze table statistics
      await sequelize.query('ANALYZE;');
      
      // Clean up old transaction logs (older than 1 year)
      const [result] = await sequelize.query(`
        DELETE FROM transaction_logs 
        WHERE created_at < NOW() - INTERVAL '1 year'
      `);
      
      if (result.affectedRows > 0) {
        logger.info(`Cleaned up ${result.affectedRows} old transaction logs`);
      }

      // Clean up expired KYC documents (older than 2 years and rejected)
      const [kycResult] = await sequelize.query(`
        DELETE FROM kyc_documents 
        WHERE status = 'rejected' 
        AND created_at < NOW() - INTERVAL '2 years'
      `);
      
      if (kycResult.affectedRows > 0) {
        logger.info(`Cleaned up ${kycResult.affectedRows} old KYC documents`);
      }

      logger.info('Database maintenance completed');
    } catch (error) {
      logger.error('Error performing database maintenance:', error);
    }
  }

  async cleanOldLogs() {
    try {
      logger.info('Cleaning old application logs...');
      
      // Clean up old audit logs (older than 6 months)
      const [result] = await sequelize.query(`
        DELETE FROM audit_logs 
        WHERE created_at < NOW() - INTERVAL '6 months'
      `);
      
      if (result.affectedRows > 0) {
        logger.info(`Cleaned up ${result.affectedRows} old audit logs`);
      }

      logger.info('Log cleanup completed');
    } catch (error) {
      logger.error('Error cleaning old logs:', error);
    }
  }

  async applyMaintenanceFees() {
    try {
      logger.info('Applying monthly maintenance fees...');
      
      const maintenanceFee = parseFloat(process.env.MAINTENANCE_FEE) || 100;
      
      // Get all active wallets
      const [activeWallets] = await sequelize.query(`
        SELECT w.id, w.user_id, w.balance 
        FROM wallets w
        JOIN users u ON w.user_id = u.id
        WHERE u.status = 'active' 
        AND w.balance >= ?
        AND w.account_type != 'savings'
      `, {
        replacements: [maintenanceFee]
      });

      logger.info(`Applying maintenance fee of ${maintenanceFee} to ${activeWallets.length} wallets`);

      for (const wallet of activeWallets) {
        try {
          await sequelize.transaction(async (t) => {
            // Deduct maintenance fee
            await sequelize.query(`
              UPDATE wallets 
              SET balance = balance - ?,
                  updated_at = NOW()
              WHERE id = ?
            `, {
              replacements: [maintenanceFee, wallet.id],
              transaction: t
            });

            // Record transaction
            await sequelize.query(`
              INSERT INTO transactions (
                user_id, type, amount, status, description, created_at
              ) VALUES (?, 'fee', ?, 'completed', 'Monthly maintenance fee', NOW())
            `, {
              replacements: [wallet.user_id, maintenanceFee],
              transaction: t
            });
          });

          // Invalidate user cache
          if (redisClient.isConnected) {
            await redisClient.invalidateUserCache(wallet.user_id);
          }

        } catch (error) {
          logger.error(`Error applying maintenance fee to wallet ${wallet.id}:`, error);
        }
      }

      logger.info('Maintenance fee application completed');
    } catch (error) {
      logger.error('Error applying maintenance fees:', error);
    }
  }

  async stop() {
    logger.info('Stopping maintenance worker...');
    
    this.isRunning = false;
    
    // Stop all scheduled jobs
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    }

    // Close connections
    await sequelize.close();
    await redisClient.disconnect();
    
    logger.info('Maintenance worker stopped');
  }

  // Health check endpoint
  getStatus() {
    return {
      running: this.isRunning,
      jobs: Array.from(this.jobs.keys()),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

// Create and start maintenance worker
const maintenanceWorker = new MaintenanceWorker();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down maintenance worker gracefully');
  await maintenanceWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down maintenance worker gracefully');
  await maintenanceWorker.stop();
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection in maintenance worker:', err);
  process.exit(1);
});

// Start the worker
if (require.main === module) {
  maintenanceWorker.start().catch((error) => {
    logger.error('Failed to start maintenance worker:', error);
    process.exit(1);
  });
}

module.exports = maintenanceWorker;
const cron = require('node-cron');
// Environment variables are loaded from Digital Ocean App Platform

const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { databaseManager } = require('../database/connection');
const { User, Wallet, ActivityLog } = require('../models');
const walletService = require('../services/wallet');
const whatsappService = require('../services/whatsapp');

class MaintenanceWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
    this.retryInterval = 5 * 60 * 1000; // 5 minutes
  }

  async start() {
    try {
      logger.info('Starting maintenance worker...');

      // Initialize connections
      await databaseManager.connect();
      logger.info('Database connection established');

      const redisConnected = await redisClient.connect();
      if (redisConnected) {
        logger.info('Redis connection established');
      } else {
        logger.warn('Redis connection failed - some maintenance tasks will be skipped');
      }

      this.isRunning = true;
      await this.scheduleJobs();
      this.retryLoop(); // Start the retry loop
      
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

    // Apply maintenance fee daily at 3 AM (will charge if due since onboarding)
    this.jobs.set('maintenanceFee', cron.schedule('0 3 * * *', async () => {
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
      const [pendingTransactions] = await databaseManager.getSequelize().query(`
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
            await databaseManager.getSequelize().query(`
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
      await databaseManager.getSequelize().query('ANALYZE;');
      
      // Clean up old transaction logs (older than 1 year)
      const [result] = await databaseManager.getSequelize().query(`
        DELETE FROM transaction_logs 
        WHERE created_at < NOW() - INTERVAL '1 year'
      `);
      
      if (result.affectedRows > 0) {
        logger.info(`Cleaned up ${result.affectedRows} old transaction logs`);
      }

      // Clean up expired KYC documents (older than 2 years and rejected)
      const [kycResult] = await databaseManager.getSequelize().query(`
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
      const [result] = await databaseManager.getSequelize().query(`
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
      
      // Iterate users and delegate to walletService for due logic and notifications
      const users = await User.findAll({ where: { isActive: true, isBanned: false } });
      let charged = 0;
      for (const user of users) {
        try {
          const result = await walletService.chargeMaintenanceFee(user.id);
          if (result) charged++;
        } catch (e) {
          logger.error('Failed to charge maintenance fee for user', { userId: user.id, error: e.message });
        }
      }

      logger.info('Maintenance fee application completed', { charged });
    } catch (error) {
      logger.error('Error applying maintenance fees:', error);
    }
  }

  async retryLoop() {
    while (this.isRunning) {
      try {
        await this.retryFailedVirtualAccounts();
        await this.sleep(this.retryInterval);
      } catch (error) {
        logger.error('Error in maintenance worker retry loop', { error: error.message });
        await this.sleep(60000); // Wait 1 minute on error
      }
    }
  }

  async retryFailedVirtualAccounts() {
    try {
      logger.info('Checking for failed virtual account creations to retry');

      // Find users who have wallets but no virtual accounts
      const walletsWithoutVA = await Wallet.findAll({
        where: {
          virtualAccountNumber: null,
          userId: { [require('sequelize').Op.not]: null }
        },
        include: [
          {
            model: User,
            as: 'user',
            where: {
              isActive: true,
              isBanned: false
            }
          }
        ],
        limit: 10 // Process in batches
      });

      if (walletsWithoutVA.length === 0) {
        logger.debug('No wallets without virtual accounts found');
        return;
      }

      logger.info(`Found ${walletsWithoutVA.length} wallets without virtual accounts to retry`);

      for (const wallet of walletsWithoutVA) {
        try {
          const user = wallet.user;
          
          // Check if user has all required fields
          const requiredFields = ['firstName', 'lastName', 'whatsappNumber', 'bvn', 'gender', 'dateOfBirth'];
          const missingFields = requiredFields.filter(field => !user[field]);
          
          if (missingFields.length > 0) {
            logger.warn('User missing required fields for virtual account creation', {
              userId: user.id,
              missingFields
            });
            continue;
          }

          // Check if there was a recent BellBank API error for this user
          const recentBellBankError = await ActivityLog.findOne({
            where: {
              userId: user.id,
              action: 'virtual_account_creation_bellbank_error',
              createdAt: {
                [require('sequelize').Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
              }
            },
            order: [['createdAt', 'DESC']]
          });

          if (recentBellBankError) {
            logger.info('Retrying virtual account creation for user with recent BellBank error', {
              userId: user.id,
              lastErrorTime: recentBellBankError.createdAt
            });
          }

          // Attempt to create virtual account
          const virtualAccount = await walletService.createVirtualAccountForWallet(user.id);
          
          if (virtualAccount && virtualAccount.success) {
            logger.info('Successfully retried virtual account creation', {
              userId: user.id,
              accountNumber: virtualAccount.accountNumber
            });

            // Send success notification to user (35 words max)
            try {
              const successMessage = `🎉 Your virtual account is ready!\n\n` +
                `🏦 Bank: ${virtualAccount.bankName}\n` +
                `💳 Account: ${virtualAccount.accountNumber}\n\n` +
                `You can now receive payments! 💰`;
              
              await whatsappService.sendTextMessage(user.whatsappNumber, successMessage);
              
              logger.info('Sent virtual account creation success message', { userId: user.id });
            } catch (messageError) {
              logger.error('Failed to send virtual account success message', {
                userId: user.id,
                error: messageError.message
              });
            }
          }

        } catch (error) {
          logger.error('Failed to retry virtual account creation for user', {
            userId: wallet.user?.id,
            error: error.message,
            errorType: error.name || 'Unknown'
          });

          // If it's still a BellBank API error, log it but don't give up
          if (error.name === 'BellBankAPIError' || error.isRetryable) {
            logger.warn('BellBank API still unavailable for user retry', {
              userId: wallet.user?.id,
              error: error.message
            });
          }
        }

        // Small delay between retries to avoid overwhelming the API
        await this.sleep(2000);
      }

    } catch (error) {
      logger.error('Error in retryFailedVirtualAccounts', { error: error.message });
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    logger.info('Stopping maintenance worker...');
    
    this.isRunning = false;
    
    // Stop all scheduled jobs
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    }

    // Don't close the shared database connection - let the main app handle it
    // The database manager will handle graceful shutdown
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
// Models removed - using Supabase client instead
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const logger = require('../utils/logger');
// Sequelize removed - using Supabase client instead
const { v4: uuidv4 } = require('uuid');

class ActivityLoggerService {
  /**
   * Log user activity with safe database operations
   */
  async logUserActivity(userId, activityType, action, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.executeWithRetry(async () => {
          // Map activityType to enum values
          const typeMap = {
            'kyc_verification': 'kyc_verified',
            'kyc_verified': 'kyc_verified',
            'kyc_submitted': 'kyc_submitted',
            'kyc_rejected': 'kyc_rejected',
            'wallet_funding': 'wallet_funded',
            'wallet_funded': 'wallet_funded',
            'wallet_debited': 'wallet_debited',
            'virtual_account_initiated': 'wallet_funded',
            'virtual_account_created_error': 'wallet_funded',
            'bvn_verified': 'kyc_verified',
            'bvn_verification_failed': 'kyc_rejected'
          };
          
          const mappedType = typeMap[activityType] || activityType || 'system_event';
          
          return await supabaseHelper.create('activityLogs', {
            id: uuidv4(),
            userId: userId || null,
            type: mappedType,
            description: metadata.description || action,
            source: metadata.source || 'whatsapp',
            severity: metadata.severity || 'info',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
            requestData: metadata.requestData || null,
            responseData: metadata.responseData || null,
            metadata: {
              ...metadata,
              action,
              originalActivityType: activityType,
              sessionId: metadata.sessionId,
              deviceInfo: metadata.deviceInfo,
              geolocation: metadata.geolocation
            }
          });
        });
      } else {
        logger.debug('Skipping activity logging - database connection unhealthy');
        return null;
      }
    } catch (error) {
      logger.debug('Failed to log user activity - continuing without logging', {
        error: error.message,
        userId,
        activityType
      });
      return null;
    }
  }

  /**
   * Log transaction activity with safe database operations
   */
  async logTransactionActivity(transactionId, userId, activityType, action, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.executeWithRetry(async () => {
          return await supabaseHelper.create('activityLogs', {
            id: uuidv4(),
            userId: userId || null,
            relatedTransactionId: transactionId,
            type: activityType,
            description: metadata.description || action,
            source: metadata.source || 'system',
            severity: metadata.severity || 'info',
            metadata: {
              ...metadata,
              action,
              entityType: 'transaction',
              entityId: transactionId,
              isSuccessful: metadata.isSuccessful !== false
            }
          });
        });
      } else {
        logger.debug('Skipping transaction activity logging - database connection unhealthy');
        return null;
      }
    } catch (error) {
      logger.debug('Failed to log transaction activity - continuing without logging', {
        error: error.message,
        transactionId,
        userId
      });
      return null;
    }
  }

  /**
   * Log security event with safe database operations
   */
  async logSecurityEvent(userId, action, severity, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.executeWithRetry(async () => {
          return await supabaseHelper.create('activityLogs', {
            id: uuidv4(),
            userId: userId || null,
            type: 'security_alert',
            description: metadata.description || action,
            source: metadata.source || 'system',
            severity: severity || 'info',
            ipAddress: metadata.ipAddress || null,
            userAgent: metadata.userAgent || null,
            metadata: {
              ...metadata,
              action,
              requiresAttention: severity === 'critical' || severity === 'error',
              tags: ['security', severity]
            }
          });
        });
      } else {
        logger.warn('Skipping security event logging - database connection unhealthy');
        return null;
      }
    } catch (error) {
      logger.warn('Failed to log security event - continuing without logging', {
        error: error.message,
        userId,
        action
      });
      return null;
    }
  }

  /**
   * Log admin action with safe database operations
   */
  async logAdminAction(adminUserId, targetUserId, action, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.executeWithRetry(async () => {
          return await supabaseHelper.create('activityLogs', {
            id: uuidv4(),
            userId: targetUserId || null,
            adminUserId: adminUserId || null,
            type: 'admin_action',
            description: metadata.description || action,
            source: 'admin',
            severity: metadata.severity || 'info',
            metadata: {
              ...metadata,
              action,
              oldValues: metadata.oldValues,
              newValues: metadata.newValues,
              tags: ['admin', 'manual']
            }
          });
        });
      } else {
        logger.warn('Skipping admin action logging - database connection unhealthy');
        return null;
      }
    } catch (error) {
      logger.warn('Failed to log admin action - continuing without logging', {
        error: error.message,
        adminUserId,
        targetUserId
      });
      return null;
    }
  }

  /**
   * Log system event with safe database operations
   */
  async logSystemEvent(action, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.executeWithRetry(async () => {
          return await supabaseHelper.create('activityLogs', {
            id: uuidv4(),
            userId: null,
            type: 'system_maintenance',
            description: metadata.description || action,
            source: 'system',
            severity: metadata.severity || 'info',
            metadata: {
              ...metadata,
              action
            }
          });
        });
      } else {
        logger.debug('Skipping system event logging - database connection unhealthy');
        return null;
      }
    } catch (error) {
      logger.debug('Failed to log system event - continuing without logging', {
        error: error.message,
        action
      });
      return null;
    }
  }

  /**
   * Get activity logs with retry logic
   */
  async getActivityLogs(options = {}) {
    const {
      userId = null,
      activityType = null,
      severity = null,
      requiresAttention = null,
      limit = 50,
      offset = 0,
      startDate = null,
      endDate = null
    } = options;

    return await databaseService.executeWithRetry(async () => {
      const whereClause = {};

      if (userId) whereClause.userId = userId;
      if (activityType) whereClause.activityType = activityType;
      if (severity) whereClause.severity = severity;
      if (requiresAttention !== null) whereClause.requiresAttention = requiresAttention;

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = startDate;
        if (endDate) whereClause.createdAt[Op.lte] = endDate;
      }

      return await supabaseHelper.findAndCountAll('activityLogs', whereClause, {
        orderBy: 'createdAt',
        order: 'desc',
        limit,
        offset
      });
    }, { operationName: 'get activity logs' });
  }

  /**
   * Get activity statistics with safe database operations
   */
  async getActivityStats(options = {}) {
    const { userId = null, days = 30 } = options;

    try {
      // Only query if database is healthy
      if (databaseService.isConnectionHealthy()) {
        const whereClause = {
          createdAt: {
            [Op.gte]: new Date(Date.now() - (days * 24 * 60 * 60 * 1000))
          }
        };

        if (userId) whereClause.userId = userId;

        const stats = await databaseService.query(`
          SELECT 
            COUNT(*) as total_activities,
            COUNT(CASE WHEN "activityType" = 'whatsapp_message_received' THEN 1 END) as messages_received,
            COUNT(CASE WHEN "activityType" = 'transaction' THEN 1 END) as transactions,
            COUNT(CASE WHEN "severity" = 'critical' THEN 1 END) as critical_events,
            COUNT(CASE WHEN "requiresAttention" = true THEN 1 END) as requires_attention
          FROM "ActivityLogs"
          WHERE "createdAt" >= $1 ${userId ? 'AND "userId" = $2' : ''}
        `, {
          bind: userId ? [new Date(Date.now() - (days * 24 * 60 * 60 * 1000)), userId] : [new Date(Date.now() - (days * 24 * 60 * 60 * 1000))],
          type: require('sequelize').QueryTypes.SELECT
        });

        return stats[0];
      } else {
        logger.debug('Skipping activity stats - database connection unhealthy');
        return {
          total_activities: 0,
          messages_received: 0,
          transactions: 0,
          critical_events: 0,
          requires_attention: 0
        };
      }
    } catch (error) {
      logger.debug('Failed to get activity stats - returning default values', {
        error: error.message
      });
      return {
        total_activities: 0,
        messages_received: 0,
        transactions: 0,
        critical_events: 0,
        requires_attention: 0
      };
    }
  }

  /**
   * Mark activity as reviewed with retry logic
   */
  async markAsReviewed(activityId, reviewedBy, notes = '') {
    return await databaseService.executeWithRetry(async () => {
      const [updatedCount] = await databaseService.updateWithRetry(ActivityLog, {
        reviewedAt: new Date(),
        reviewedBy,
        reviewNotes: notes,
        requiresAttention: false
      }, {
        where: { id: activityId }
      }, { operationName: 'mark activity as reviewed' });

      return updatedCount > 0;
    }, { operationName: 'mark activity as reviewed' });
  }

  /**
   * Bulk mark activities as reviewed
   */
  async bulkMarkAsReviewed(activityIds, reviewedBy, notes = '') {
    return await databaseService.executeWithRetry(async () => {
      const [updatedCount] = await databaseService.updateWithRetry(ActivityLog, {
        reviewedAt: new Date(),
        reviewedBy,
        reviewNotes: notes,
        requiresAttention: false
      }, {
        where: { id: { [Op.in]: activityIds } }
      }, { operationName: 'bulk mark activities as reviewed' });

      return updatedCount;
    }, { operationName: 'bulk mark activities as reviewed' });
  }
}

// Create singleton instance
const activityLogger = new ActivityLoggerService();

module.exports = activityLogger;
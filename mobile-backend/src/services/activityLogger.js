const { ActivityLog } = require('../models');
const databaseService = require('./database');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class ActivityLoggerService {
  /**
   * Log user activity with safe database operations
   */
  async logUserActivity(userId, activityType, action, metadata = {}) {
    try {
      // Only log if database is healthy
      if (databaseService.isConnectionHealthy()) {
        return await databaseService.create(ActivityLog, {
          userId,
          activityType,
          action,
          description: metadata.description,
          metadata,
          source: metadata.source || 'whatsapp',
          sessionId: metadata.sessionId,
          ipAddress: metadata.ipAddress,
          deviceInfo: metadata.deviceInfo,
          geolocation: metadata.geolocation
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
        return await databaseService.create(ActivityLog, {
          userId,
          activityType,
          action,
          description: metadata.description,
          entityType: 'transaction',
          entityId: transactionId,
          relatedTransactionId: transactionId,
          metadata,
          source: metadata.source || 'system',
          isSuccessful: metadata.isSuccessful !== false
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
        return await databaseService.create(ActivityLog, {
          userId,
          activityType: 'security_alert',
          action,
          description: metadata.description,
          severity,
          metadata,
          source: metadata.source || 'system',
          requiresAttention: severity === 'critical' || severity === 'error',
          ipAddress: metadata.ipAddress,
          deviceInfo: metadata.deviceInfo,
          tags: ['security', severity]
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
        return await databaseService.create(ActivityLog, {
          userId: targetUserId,
          adminUserId,
          activityType: 'admin_action',
          action,
          description: metadata.description,
          oldValues: metadata.oldValues,
          newValues: metadata.newValues,
          metadata,
          source: 'admin',
          tags: ['admin', 'manual']
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
        return await databaseService.create(ActivityLog, {
          activityType: 'system_maintenance',
          action,
          description: metadata.description,
          metadata,
          source: 'system',
          severity: metadata.severity || 'info'
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

      return await databaseService.findWithRetry(ActivityLog, {
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        include: [
          { model: require('../models').User, as: 'user' },
          { model: require('../models').User, as: 'adminUser' },
          { model: require('../models').Transaction, as: 'relatedTransaction' }
        ]
      }, { operationName: 'get activity logs' });
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
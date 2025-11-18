const { Notification, User } = require('../models');
const logger = require('../utils/logger');
const databaseService = require('./database');

class NotificationService {
  /**
   * Create a notification for a user
   */
  async createNotification(userId, notificationData) {
    try {
      const {
        type,
        title,
        message,
        data = {},
        priority = 'normal',
        actionUrl = null,
        imageUrl = null,
        expiresAt = null
      } = notificationData;

      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        data,
        priority,
        actionUrl,
        imageUrl,
        expiresAt
      });

      logger.info('Notification created', {
        notificationId: notification.id,
        userId,
        type,
        priority
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification', {
        error: error.message,
        userId,
        notificationData
      });
      throw error;
    }
  }

  /**
   * Create transaction notification
   */
  async createTransactionNotification(userId, transaction, transactionType = 'credit') {
    try {
      const amount = parseFloat(transaction.amount || 0);
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0
      }).format(amount);

      let type, title, message, actionUrl;

      if (transactionType === 'credit' || transaction.type === 'credit') {
        type = transaction.category === 'wallet_funding' 
          ? 'wallet_funded' 
          : 'transfer_incoming';
        title = '💰 Money Received';
        message = `You received ${formattedAmount}${transaction.description ? ` - ${transaction.description}` : ''}`;
        actionUrl = `/transactions/${transaction.reference}`;
      } else {
        type = 'transaction_debit';
        if (transaction.category === 'bank_transfer') {
          type = 'transfer_outgoing';
          title = '💸 Transfer Sent';
          message = `You sent ${formattedAmount}${transaction.recipientDetails?.accountNumber ? ` to ${transaction.recipientDetails.accountNumber}` : ''}`;
        } else if (transaction.category === 'airtime_purchase') {
          type = 'airtime_purchase';
          title = '📱 Airtime Purchased';
          message = `You purchased ${formattedAmount} airtime${transaction.subCategory ? ` (${transaction.subCategory})` : ''}`;
        } else if (transaction.category === 'data_purchase') {
          type = 'data_purchase';
          title = '📶 Data Purchased';
          message = `You purchased ${formattedAmount} data${transaction.subCategory ? ` (${transaction.subCategory})` : ''}`;
        } else if (transaction.category?.startsWith('bill_payment')) {
          type = 'bill_payment';
          title = '💡 Bill Paid';
          message = `You paid ${formattedAmount}${transaction.description ? ` - ${transaction.description}` : ''}`;
        } else {
          title = '💸 Transaction Completed';
          message = `${formattedAmount}${transaction.description ? ` - ${transaction.description}` : ''}`;
        }
        actionUrl = `/transactions/${transaction.reference}`;
      }

      const priority = amount >= 100000 ? 'high' : 'normal';

      return await this.createNotification(userId, {
        type,
        title,
        message,
        data: {
          transactionId: transaction.id,
          reference: transaction.reference,
          amount: amount,
          currency: transaction.currency || 'NGN',
          category: transaction.category,
          status: transaction.status
        },
        priority,
        actionUrl
      });
    } catch (error) {
      logger.error('Failed to create transaction notification', {
        error: error.message,
        userId,
        transactionId: transaction.id
      });
      // Don't throw - notification failure shouldn't break transaction flow
      return null;
    }
  }

  /**
   * Create transfer failed notification
   */
  async createTransferFailedNotification(userId, transaction, reason) {
    try {
      const amount = parseFloat(transaction.amount || 0);
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0
      }).format(amount);

      return await this.createNotification(userId, {
        type: 'transfer_failed',
        title: '❌ Transfer Failed',
        message: `Your transfer of ${formattedAmount} failed. ${reason || 'Please try again.'}`,
        data: {
          transactionId: transaction.id,
          reference: transaction.reference,
          amount: amount,
          reason: reason
        },
        priority: 'high',
        actionUrl: `/transactions/${transaction.reference}`
      });
    } catch (error) {
      logger.error('Failed to create transfer failed notification', {
        error: error.message,
        userId
      });
      return null;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        isRead = null,
        type = null,
        priority = null
      } = options;

      const where = { userId };

      if (isRead !== null) {
        where.isRead = isRead;
      }

      if (type) {
        where.type = type;
      }

      if (priority) {
        where.priority = priority;
      }

      // Exclude expired notifications
      where[require('sequelize').Op.or] = [
        { expiresAt: null },
        { expiresAt: { [require('sequelize').Op.gt]: new Date() } }
      ];

      const notifications = await Notification.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      });

      const total = await Notification.count({ where });

      return {
        notifications,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          hasMore: offset + notifications.length < total
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    try {
      const count = await Notification.count({
        where: {
          userId,
          isRead: false,
          [require('sequelize').Op.or]: [
            { expiresAt: null },
            { expiresAt: { [require('sequelize').Op.gt]: new Date() } }
          ]
        }
      });

      return count;
    } catch (error) {
      logger.error('Failed to get unread count', {
        error: error.message,
        userId
      });
      return 0;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (!notification.isRead) {
        await notification.update({
          isRead: true,
          readAt: new Date()
        });
      }

      return notification;
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const [updatedCount] = await Notification.update(
        {
          isRead: true,
          readAt: new Date()
        },
        {
          where: {
            userId,
            isRead: false
          }
        }
      );

      logger.info('Marked all notifications as read', {
        userId,
        updatedCount
      });

      return updatedCount;
    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.destroy();

      return true;
    } catch (error) {
      logger.error('Failed to delete notification', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Delete all read notifications for a user
   */
  async deleteAllRead(userId) {
    try {
      const deletedCount = await Notification.destroy({
        where: {
          userId,
          isRead: true
        }
      });

      logger.info('Deleted all read notifications', {
        userId,
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete all read notifications', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = new NotificationService();


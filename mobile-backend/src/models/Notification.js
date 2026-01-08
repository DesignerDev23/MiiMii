const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  type: {
    type: DataTypes.ENUM(
      'transaction_credit',
      'transaction_debit',
      'transfer_incoming',
      'transfer_outgoing',
      'transfer_failed',
      'airtime_purchase',
      'data_purchase',
      'bill_payment',
      'wallet_funded',
      'account_verified',
      'pin_changed',
      'security_alert',
      'system_announcement',
      'promotion'
    ),
    allowNull: false,
    index: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional data like transaction reference, amount, etc.'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    index: true
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal',
    index: true
  },
  actionUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Deep link or route to navigate when notification is tapped'
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Optional image/icon URL for the notification'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Optional expiration date for time-sensitive notifications'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'isRead'] },
    { fields: ['userId', 'createdAt'] },
    { fields: ['type'] },
    { fields: ['priority'] },
    { fields: ['expiresAt'] }
  ]
});

module.exports = Notification;


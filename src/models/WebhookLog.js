const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const WebhookLog = sequelize.define('WebhookLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  provider: {
    type: DataTypes.ENUM('whatsapp', 'bellbank', 'bilal', 'dojah', 'rubies'),
    allowNull: false
  },
  event: {
    type: DataTypes.STRING,
    allowNull: false
  },
  headers: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  payload: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  signature: {
    type: DataTypes.STRING,
    allowNull: true
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  responseCode: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'webhook_logs',
  timestamps: true,
  indexes: [
    { fields: ['provider'] },
    { fields: ['event'] },
    { fields: ['processed'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = WebhookLog;
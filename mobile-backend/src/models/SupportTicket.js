const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const SupportTicket = sequelize.define('SupportTicket', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticketNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  transactionId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('dispute', 'complaint', 'inquiry', 'technical', 'refund'),
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
    defaultValue: 'open'
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  assignedTo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'support_tickets',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['priority'] }
  ]
});

module.exports = SupportTicket;
const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  reference: {
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
  type: {
    type: DataTypes.ENUM(
      'credit', 'debit', 'transfer', 'airtime', 'data', 
      'utility', 'maintenance_fee', 'platform_fee'
    ),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM(
      'wallet_funding', 'wallet_transfer', 'bank_transfer', 
      'airtime_purchase', 'data_purchase', 'utility_payment',
      'fee_charge', 'refund', 'admin_adjustment'
    ),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  fee: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false
  },
  recipientDetails: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  providerReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  providerResponse: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  balanceBefore: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  webhookData: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  failureReason: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'transactions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['reference'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['createdAt'] }
  ]
});

// Instance methods
Transaction.prototype.markAsCompleted = function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

Transaction.prototype.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.processedAt = new Date();
  return this.save();
};

module.exports = Transaction;
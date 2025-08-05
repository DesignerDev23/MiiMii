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
      'utility', 'maintenance_fee', 'platform_fee', 'refund',
      'bonus', 'cashback', 'penalty', 'reversal'
    ),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM(
      'wallet_funding', 'wallet_transfer', 'bank_transfer', 
      'airtime_purchase', 'data_purchase', 'utility_payment',
      'fee_charge', 'refund', 'admin_adjustment', 'bonus_credit',
      'cashback_credit', 'referral_bonus', 'maintenance_fee',
      'bill_payment_electricity', 'bill_payment_cable', 
      'bill_payment_internet', 'bill_payment_water'
    ),
    allowNull: false
  },
  subCategory: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'More specific categorization (e.g., MTN, DSTV, PHCN)'
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
  platformFee: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  providerFee: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'amount + fee + platformFee + providerFee'
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM(
      'pending', 'processing', 'completed', 'failed', 
      'cancelled', 'reversed', 'disputed', 'refunded'
    ),
    defaultValue: 'pending'
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  source: {
    type: DataTypes.ENUM('whatsapp', 'api', 'admin', 'webhook', 'scheduler'),
    defaultValue: 'whatsapp'
  },
  approvalStatus: {
    type: DataTypes.ENUM('auto_approved', 'pending_approval', 'approved', 'rejected'),
    defaultValue: 'auto_approved'
  },
  approvedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin user who approved the transaction'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false
  },
  narration: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Additional details for bank statements'
  },
  recipientDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Details about the recipient (name, account, phone, etc.)'
  },
  senderDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Details about the sender for incoming transactions'
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
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  nextRetryAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    comment: 'Searchable tags for analytics'
  },
  riskScore: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 1
    }
  },
  fraudCheck: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Fraud detection results'
  },
  complianceCheck: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Compliance screening results'
  },
  geolocation: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Transaction location data'
  },
  deviceInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Device information for the transaction'
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'User session identifier'
  },
  parentTransactionId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id'
    },
    comment: 'For linked transactions (reversals, refunds, etc.)'
  },
  batchId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'For batch processing'
  },
  scheduledFor: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'For scheduled transactions'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Transaction expiry time'
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
  },
  errorCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerMessage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'User-friendly message to display'
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal notes for support/admin'
  }
}, {
  tableName: 'transactions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['reference'] },
    { fields: ['status'] },
    { fields: ['type', 'category'] },
    { fields: ['createdAt'] },
    { fields: ['processedAt'] },
    { fields: ['providerReference'] },
    { fields: ['parentTransactionId'] },
    { fields: ['batchId'] },
    { fields: ['approvalStatus'] },
    { fields: ['scheduledFor'] },
    { fields: ['expiresAt'] },
    { fields: ['riskScore'] },
    { fields: ['priority', 'status'] }
  ]
});

// Instance methods
Transaction.prototype.markAsCompleted = async function(providerResponse = null) {
  this.status = 'completed';
  this.processedAt = new Date();
  if (providerResponse) {
    this.providerResponse = providerResponse;
  }
  return this.save();
};

Transaction.prototype.markAsFailed = async function(reason, errorCode = null, customerMessage = null) {
  this.status = 'failed';
  this.failureReason = reason;
  this.errorCode = errorCode;
  this.customerMessage = customerMessage;
  this.processedAt = new Date();
  return this.save();
};

Transaction.prototype.markAsProcessing = async function() {
  this.status = 'processing';
  return this.save();
};

Transaction.prototype.approve = async function(approvedBy) {
  this.approvalStatus = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  return this.save();
};

Transaction.prototype.reject = async function(reason, rejectedBy) {
  this.approvalStatus = 'rejected';
  this.failureReason = reason;
  this.approvedBy = rejectedBy;
  this.approvedAt = new Date();
  this.status = 'failed';
  return this.save();
};

Transaction.prototype.scheduleRetry = async function(delayMinutes = 5) {
  this.retryCount += 1;
  this.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  return this.save();
};

Transaction.prototype.canRetry = function() {
  return this.retryCount < this.maxRetries && 
         ['failed', 'cancelled'].includes(this.status) &&
         (!this.expiresAt || this.expiresAt > new Date());
};

Transaction.prototype.isExpired = function() {
  return this.expiresAt && this.expiresAt <= new Date();
};

Transaction.prototype.updateRiskScore = async function(score, fraudCheckData = null) {
  this.riskScore = Math.max(0, Math.min(1, score));
  if (fraudCheckData) {
    this.fraudCheck = fraudCheckData;
  }
  return this.save();
};

Transaction.prototype.addTag = async function(tag) {
  if (!this.tags) {
    this.tags = [];
  }
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

Transaction.prototype.removeTag = async function(tag) {
  if (this.tags && this.tags.includes(tag)) {
    this.tags = this.tags.filter(t => t !== tag);
    return this.save();
  }
  return this;
};

Transaction.prototype.getTransactionSummary = function() {
  return {
    id: this.id,
    reference: this.reference,
    type: this.type,
    category: this.category,
    amount: parseFloat(this.amount),
    fee: parseFloat(this.fee),
    totalAmount: parseFloat(this.totalAmount),
    status: this.status,
    description: this.description,
    recipientDetails: this.recipientDetails,
    createdAt: this.createdAt,
    processedAt: this.processedAt,
    balanceBefore: this.balanceBefore ? parseFloat(this.balanceBefore) : null,
    balanceAfter: this.balanceAfter ? parseFloat(this.balanceAfter) : null
  };
};

Transaction.prototype.getReceiptData = function() {
  return {
    reference: this.reference,
    type: this.type,
    category: this.category,
    amount: parseFloat(this.amount),
    fee: parseFloat(this.fee),
    totalAmount: parseFloat(this.totalAmount),
    status: this.status,
    description: this.description,
    recipientDetails: this.recipientDetails,
    processedAt: this.processedAt || this.createdAt,
    providerReference: this.providerReference
  };
};

// Static methods
Transaction.generateReference = function(type, category) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const prefix = this.getReferencePrefix(type, category);
  return `${prefix}_${timestamp}_${random}`;
};

Transaction.getReferencePrefix = function(type, category) {
  const prefixes = {
    'wallet_funding': 'WF',
    'wallet_transfer': 'WT',
    'bank_transfer': 'BT',
    'airtime_purchase': 'AT',
    'data_purchase': 'DT',
    'utility_payment': 'UP',
    'fee_charge': 'FC',
    'refund': 'RF',
    'admin_adjustment': 'AA'
  };
  return prefixes[category] || 'TX';
};

module.exports = Transaction;
const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Null for system activities'
  },
  activityType: {
    type: DataTypes.ENUM(
      'user_registration', 'user_login', 'user_logout', 'profile_update',
      'kyc_submission', 'kyc_verification', 'kyc_rejection',
      'pin_creation', 'pin_change', 'pin_reset', 'pin_failure',
      'wallet_funding', 'wallet_transfer', 'bank_transfer',
      'airtime_purchase', 'data_purchase', 'bill_payment',
      'transaction_created', 'transaction_completed', 'transaction_failed',
      'beneficiary_added', 'beneficiary_updated', 'beneficiary_deleted',
      'bank_account_added', 'bank_account_verified', 'bank_account_deleted',
      'security_alert', 'fraud_detection', 'compliance_check',
      'admin_action', 'system_maintenance', 'api_call',
      'whatsapp_message_sent', 'whatsapp_message_received',
      'webhook_received', 'webhook_processed',
      'ai_processing'
    ),
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Specific action taken'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Human-readable description of the activity'
  },
  entityType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Type of entity affected (user, transaction, etc.)'
  },
  entityId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'ID of the affected entity'
  },
  oldValues: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Previous state before the change'
  },
  newValues: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'New state after the change'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional context and data'
  },
  ipAddress: {
    type: DataTypes.INET,
    allowNull: true
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deviceInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Device fingerprint and information'
  },
  geolocation: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Location data if available'
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  source: {
    type: DataTypes.ENUM('whatsapp', 'api', 'admin', 'system', 'webhook'),
    allowNull: false,
    defaultValue: 'system'
  },
  severity: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    defaultValue: 'info'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    comment: 'Searchable tags for filtering'
  },
  isSuccessful: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  errorCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in milliseconds for operations'
  },
  relatedTransactionId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id'
    }
  },
  adminUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin user who performed the action'
  },
  requiresAttention: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Flags for manual review'
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reviewedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin who reviewed this activity'
  },
  reviewNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['activityType'] },
    { fields: ['entityType', 'entityId'] },
    { fields: ['createdAt'] },
    { fields: ['source'] },
    { fields: ['severity'] },
    { fields: ['isSuccessful'] },
    { fields: ['requiresAttention'] },
    { fields: ['relatedTransactionId'] },
    { fields: ['sessionId'] },
    { fields: ['adminUserId'] },
    { fields: ['tags'], type: 'GIN' }
  ]
});

// Static methods for easy logging
ActivityLog.logUserActivity = async function(userId, activityType, action, metadata = {}) {
  return this.create({
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
};

ActivityLog.logTransactionActivity = async function(transactionId, userId, activityType, action, metadata = {}) {
  return this.create({
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
};

ActivityLog.logSecurityEvent = async function(userId, action, severity, metadata = {}) {
  return this.create({
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
};

ActivityLog.logAdminAction = async function(adminUserId, targetUserId, action, metadata = {}) {
  return this.create({
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
};

ActivityLog.logSystemEvent = async function(action, metadata = {}) {
  return this.create({
    activityType: 'system_maintenance',
    action,
    description: metadata.description,
    metadata,
    source: 'system',
    severity: metadata.severity || 'info'
  });
};

// Instance methods
ActivityLog.prototype.markAsReviewed = async function(reviewedBy, notes = '') {
  this.reviewedAt = new Date();
  this.reviewedBy = reviewedBy;
  this.reviewNotes = notes;
  this.requiresAttention = false;
  return this.save();
};

ActivityLog.prototype.addTag = async function(tag) {
  if (!this.tags) {
    this.tags = [];
  }
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

module.exports = ActivityLog;
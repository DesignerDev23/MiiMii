const { sequelize } = require('../database/connection');

// Import all models
const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const BankAccount = require('./BankAccount');
const Beneficiary = require('./Beneficiary');
const VirtualCard = require('./VirtualCard');
const SupportTicket = require('./SupportTicket');
const KVStore = require('./KVStore');
const WebhookLog = require('./WebhookLog');
const ActivityLog = require('./ActivityLog');
const DataPlan = require('./DataPlan');
const ChatMessage = require('./ChatMessage');

// Define relationships
// User relationships
User.hasOne(Wallet, {
  foreignKey: 'userId',
  as: 'wallet'
});

User.hasMany(Transaction, {
  foreignKey: 'userId',
  as: 'transactions'
});

User.hasMany(BankAccount, {
  foreignKey: 'userId',
  as: 'bankAccounts'
});

User.hasMany(Beneficiary, {
  foreignKey: 'userId',
  as: 'beneficiaries'
});

User.hasMany(VirtualCard, {
  foreignKey: 'userId',
  as: 'virtualCards'
});

User.hasMany(SupportTicket, {
  foreignKey: 'userId',
  as: 'supportTickets'
});

User.hasMany(ActivityLog, {
  foreignKey: 'userId',
  as: 'activityLogs'
});

User.hasMany(ChatMessage, {
  foreignKey: 'userId',
  as: 'chatMessages'
});

// Self-referential relationship for referrals
User.hasMany(User, {
  foreignKey: 'referredBy',
  as: 'referrals'
});

User.belongsTo(User, {
  foreignKey: 'referredBy',
  as: 'referrer'
});

// Wallet relationships
Wallet.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Transaction relationships
Transaction.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Self-referential relationship for linked transactions (reversals, refunds)
Transaction.hasMany(Transaction, {
  foreignKey: 'parentTransactionId',
  as: 'childTransactions'
});

Transaction.belongsTo(Transaction, {
  foreignKey: 'parentTransactionId',
  as: 'parentTransaction'
});

// BankAccount relationships
BankAccount.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Beneficiary relationships
Beneficiary.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// VirtualCard relationships
VirtualCard.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

VirtualCard.belongsTo(Wallet, {
  foreignKey: 'walletId',
  as: 'wallet'
});

// SupportTicket relationships
SupportTicket.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// ActivityLog relationships
ActivityLog.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

ActivityLog.belongsTo(Transaction, {
  foreignKey: 'relatedTransactionId',
  as: 'relatedTransaction'
});

ActivityLog.belongsTo(User, {
  foreignKey: 'adminUserId',
  as: 'adminUser'
});

ActivityLog.belongsTo(User, {
  foreignKey: 'reviewedBy',
  as: 'reviewer'
});

ChatMessage.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Export all models
module.exports = {
  sequelize,
  User,
  Wallet,
  Transaction,
  BankAccount,
  Beneficiary,
  VirtualCard,
  SupportTicket,
  WebhookLog,
  ActivityLog,
  KVStore,
  DataPlan,
  ChatMessage
};
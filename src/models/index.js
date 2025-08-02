const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const WebhookLog = require('./WebhookLog');
const SupportTicket = require('./SupportTicket');

// Define associations
User.hasOne(Wallet, {
  foreignKey: 'userId',
  as: 'wallet'
});

Wallet.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

User.hasMany(Transaction, {
  foreignKey: 'userId',
  as: 'transactions'
});

Transaction.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

User.hasMany(SupportTicket, {
  foreignKey: 'userId',
  as: 'supportTickets'
});

SupportTicket.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

Transaction.hasMany(SupportTicket, {
  foreignKey: 'transactionId',
  as: 'supportTickets'
});

SupportTicket.belongsTo(Transaction, {
  foreignKey: 'transactionId',
  as: 'transaction'
});

module.exports = {
  User,
  Wallet,
  Transaction,
  WebhookLog,
  SupportTicket
};
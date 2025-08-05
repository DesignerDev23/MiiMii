const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const BankAccount = sequelize.define('BankAccount', {
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
    }
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [10, 10]
    }
  },
  accountName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  bankCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  bankName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationData: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Name enquiry verification response'
  },
  isPrimary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  nickname: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'User-defined nickname for the account'
  },
  addedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalTransfers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  }
}, {
  tableName: 'bank_accounts',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['accountNumber', 'bankCode'], unique: true },
    { fields: ['isPrimary'] },
    { fields: ['isActive'] }
  ]
});

// Instance methods
BankAccount.prototype.markAsUsed = async function(amount = 0) {
  this.lastUsedAt = new Date();
  this.totalTransfers += 1;
  this.totalAmount = parseFloat(this.totalAmount) + parseFloat(amount);
  return this.save();
};

BankAccount.prototype.setPrimary = async function() {
  // First, remove primary status from other accounts
  await BankAccount.update(
    { isPrimary: false },
    { where: { userId: this.userId, id: { [require('sequelize').Op.ne]: this.id } } }
  );
  
  this.isPrimary = true;
  return this.save();
};

module.exports = BankAccount;
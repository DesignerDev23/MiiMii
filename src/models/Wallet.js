const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Wallet = sequelize.define('Wallet', {
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
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  previousBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  ledgerBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN'
  },
  virtualAccountNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  virtualAccountBank: {
    type: DataTypes.STRING,
    allowNull: true
  },
  virtualAccountName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFrozen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastMaintenanceFee: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'wallets',
  timestamps: true
});

// Instance methods
Wallet.prototype.canDebit = function(amount) {
  return !this.isFrozen && 
         this.isActive && 
         parseFloat(this.balance) >= parseFloat(amount);
};

Wallet.prototype.updateBalance = function(amount, type = 'credit') {
  this.previousBalance = this.balance;
  
  if (type === 'credit') {
    this.balance = parseFloat(this.balance) + parseFloat(amount);
  } else if (type === 'debit') {
    this.balance = parseFloat(this.balance) - parseFloat(amount);
  }
  
  this.ledgerBalance = this.balance;
  return this.save();
};

module.exports = Wallet;
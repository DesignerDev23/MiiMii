const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const Beneficiary = sequelize.define('Beneficiary', {
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
  type: {
    type: DataTypes.ENUM('bank_account', 'phone_number', 'miimii_user'),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Display name for the beneficiary'
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'For phone-based transfers or MiiMii users'
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Bank account number'
  },
  bankCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Bank code for bank transfers'
  },
  bankName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Bank name for display'
  },
  nickname: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'User-defined nickname'
  },
  category: {
    type: DataTypes.ENUM('family', 'friend', 'business', 'vendor', 'other'),
    defaultValue: 'other'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationData: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Verification response from name enquiry'
  },
  isFavorite: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  addedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalTransactions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  averageAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User notes about this beneficiary'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'beneficiaries',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['phoneNumber'] },
    { fields: ['accountNumber', 'bankCode'] },
    { fields: ['isFavorite'] },
    { fields: ['isActive'] },
    { fields: ['category'] },
    { fields: ['userId', 'phoneNumber'] },
    { fields: ['userId', 'accountNumber', 'bankCode'] }
  ]
});

// Instance methods
Beneficiary.prototype.updateUsage = async function(amount) {
  this.lastUsedAt = new Date();
  this.totalTransactions += 1;
  this.totalAmount = parseFloat(this.totalAmount) + parseFloat(amount);
  this.averageAmount = parseFloat(this.totalAmount) / this.totalTransactions;
  return this.save();
};

Beneficiary.prototype.toggleFavorite = async function() {
  this.isFavorite = !this.isFavorite;
  return this.save();
};

Beneficiary.prototype.updateVerification = async function(verificationData) {
  this.isVerified = true;
  this.verificationData = verificationData;
  
  // Update name if verification provides a different name
  if (verificationData.accountName || verificationData.name) {
    this.name = verificationData.accountName || verificationData.name;
  }
  
  return this.save();
};

Beneficiary.prototype.getDisplayInfo = function() {
  const info = {
    id: this.id,
    name: this.name,
    nickname: this.nickname,
    type: this.type,
    category: this.category,
    isFavorite: this.isFavorite,
    totalTransactions: this.totalTransactions
  };

  if (this.type === 'bank_account') {
    info.accountNumber = this.accountNumber;
    info.bankName = this.bankName;
    info.bankCode = this.bankCode;
  } else if (this.type === 'phone_number' || this.type === 'miimii_user') {
    info.phoneNumber = this.phoneNumber;
  }

  return info;
};

module.exports = Beneficiary;
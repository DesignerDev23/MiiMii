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
    comment: 'Total balance; can go negative for maintenance fee accrual'
  },
  previousBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  ledgerBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Balance including pending transactions'
  },
  availableBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Spendable balance excluding holds; never negative'
  },
  totalCredits: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Lifetime total credits'
  },
  totalDebits: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Lifetime total debits'
  },
  pendingBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Amount held for pending transactions'
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
  bankCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Bank code for virtual account'
  },
  accountReference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'External provider reference'
  },
  dailyLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 50000.00,
    comment: 'Daily transaction limit'
  },
  dailySpent: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Amount spent today'
  },
  lastResetDate: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
    comment: 'Last daily limit reset date'
  },
  monthlyLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 500000.00,
    comment: 'Monthly transaction limit'
  },
  monthlySpent: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Amount spent this month'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFrozen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  freezeReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  frozenAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  frozenBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin user who froze the wallet'
  },
  lastMaintenanceFee: {
    type: DataTypes.DATE,
    allowNull: true
  },
  maintenanceFeeAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 50.00,
    comment: 'Monthly maintenance fee'
  },
  feeExempt: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Exempt from maintenance fees'
  },
  lastTransactionAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  transactionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  riskLevel: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'low'
  },
  complianceStatus: {
    type: DataTypes.ENUM('compliant', 'under_review', 'flagged', 'suspended'),
    defaultValue: 'compliant'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'wallets',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['virtualAccountNumber'] },
    { fields: ['isActive', 'isFrozen'] },
    { fields: ['complianceStatus'] },
    { fields: ['riskLevel'] }
  ]
});

// Instance methods
Wallet.prototype.canDebit = function(amount) {
  const requestedAmount = parseFloat(amount);
  const totalBalance = parseFloat(this.balance);
  const availableBalance = parseFloat(this.availableBalance);
  
  // If availableBalance is 0 but total balance is sufficient, sync them
  if (availableBalance === 0 && totalBalance >= requestedAmount) {
    this.availableBalance = totalBalance;
    this.save().catch(err => console.error('Failed to sync available balance:', err));
  }
  
  return !this.isFrozen && 
         this.isActive && 
         this.complianceStatus === 'compliant' &&
         (availableBalance >= requestedAmount || totalBalance >= requestedAmount) &&
         this.checkDailyLimit(requestedAmount) &&
         this.checkMonthlyLimit(requestedAmount);
};

Wallet.prototype.checkDailyLimit = function(amount) {
  this.resetDailyLimitIfNeeded();
  return (parseFloat(this.dailySpent) + parseFloat(amount)) <= parseFloat(this.dailyLimit);
};

Wallet.prototype.checkMonthlyLimit = function(amount) {
  this.resetMonthlyLimitIfNeeded();
  return (parseFloat(this.monthlySpent) + parseFloat(amount)) <= parseFloat(this.monthlyLimit);
};

Wallet.prototype.resetDailyLimitIfNeeded = function() {
  const today = new Date().toISOString().split('T')[0];
  if (this.lastResetDate !== today) {
    this.dailySpent = 0.00;
    this.lastResetDate = today;
  }
};

Wallet.prototype.resetMonthlyLimitIfNeeded = function() {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const lastMonth = this.updatedAt ? this.updatedAt.toISOString().substring(0, 7) : currentMonth;
  
  if (currentMonth !== lastMonth) {
    this.monthlySpent = 0.00;
  }
};

Wallet.prototype.updateBalance = async function(amount, type = 'credit', description = '') {
  const transaction = await sequelize.transaction();
  
  try {
    this.previousBalance = this.balance;
    const amountFloat = parseFloat(amount);
    
    if (type === 'credit') {
      this.balance = parseFloat(this.balance) + amountFloat;
      this.availableBalance = parseFloat(this.availableBalance) + amountFloat;
      this.totalCredits = parseFloat(this.totalCredits) + amountFloat;
    } else if (type === 'debit') {
      this.balance = parseFloat(this.balance) - amountFloat;
      this.availableBalance = parseFloat(this.availableBalance) - amountFloat;
      this.totalDebits = parseFloat(this.totalDebits) + amountFloat;
      
      // Update spending limits
      this.resetDailyLimitIfNeeded();
      this.resetMonthlyLimitIfNeeded();
      this.dailySpent = parseFloat(this.dailySpent) + amountFloat;
      this.monthlySpent = parseFloat(this.monthlySpent) + amountFloat;
    }
    
    this.ledgerBalance = this.balance;
    this.lastTransactionAt = new Date();
    this.transactionCount += 1;
    
    await this.save({ transaction });
    await transaction.commit();
    
    return this;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

Wallet.prototype.holdFunds = async function(amount, reason = '') {
  const amountFloat = parseFloat(amount);
  if (this.availableBalance < amountFloat) {
    throw new Error('Insufficient available balance for hold');
  }
  
  this.availableBalance = parseFloat(this.availableBalance) - amountFloat;
  this.pendingBalance = parseFloat(this.pendingBalance) + amountFloat;
  
  return this.save();
};

Wallet.prototype.releaseFunds = async function(amount, reason = '') {
  const amountFloat = parseFloat(amount);
  
  this.availableBalance = parseFloat(this.availableBalance) + amountFloat;
  this.pendingBalance = parseFloat(this.pendingBalance) - amountFloat;
  
  // Ensure pending balance doesn't go negative
  if (this.pendingBalance < 0) {
    this.pendingBalance = 0;
  }
  
  return this.save();
};

Wallet.prototype.freeze = async function(reason, frozenBy = null) {
  this.isFrozen = true;
  this.freezeReason = reason;
  this.frozenAt = new Date();
  this.frozenBy = frozenBy;
  
  return this.save();
};

Wallet.prototype.unfreeze = async function() {
  this.isFrozen = false;
  this.freezeReason = null;
  this.frozenAt = null;
  this.frozenBy = null;
  
  return this.save();
};

Wallet.prototype.updateRiskLevel = async function(level) {
  this.riskLevel = level;
  return this.save();
};

Wallet.prototype.getWalletSummary = function() {
  return {
    balance: parseFloat(this.balance),
    availableBalance: parseFloat(this.availableBalance),
    pendingBalance: parseFloat(this.pendingBalance),
    dailyLimit: parseFloat(this.dailyLimit),
    dailySpent: parseFloat(this.dailySpent),
    dailyRemaining: parseFloat(this.dailyLimit) - parseFloat(this.dailySpent),
    monthlyLimit: parseFloat(this.monthlyLimit),
    monthlySpent: parseFloat(this.monthlySpent),
    monthlyRemaining: parseFloat(this.monthlyLimit) - parseFloat(this.monthlySpent),
    virtualAccount: {
      number: this.virtualAccountNumber,
      bank: this.virtualAccountBank,
      name: this.virtualAccountName
    },
    status: {
      isActive: this.isActive,
      isFrozen: this.isFrozen,
      complianceStatus: this.complianceStatus,
      riskLevel: this.riskLevel
    }
  };
};

module.exports = Wallet;
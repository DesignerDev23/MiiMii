const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const VirtualCard = sequelize.define('VirtualCard', {
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
    },
    onDelete: 'CASCADE'
  },
  cardType: {
    type: DataTypes.ENUM('virtual_debit', 'virtual_credit'),
    allowNull: false,
    defaultValue: 'virtual_debit'
  },
  brand: {
    type: DataTypes.ENUM('visa', 'mastercard', 'verve'),
    allowNull: false,
    defaultValue: 'visa'
  },
  cardNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'SHA256 hash of the actual card number for security'
  },
  maskedCardNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Masked card number for display (e.g., **** **** **** 1234)'
  },
  cvv: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'SHA256 hash of the CVV for security'
  },
  expiryDate: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      is: /^(0[1-9]|1[0-2])\/\d{2}$/ // MM/YY format
    }
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'frozen', 'expired', 'blocked'),
    allowNull: false,
    defaultValue: 'active'
  },
  dailyLimit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 500000.00, // ₦500,000
    validate: {
      min: 0
    }
  },
  monthlyLimit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 5000000.00, // ₦5,000,000
    validate: {
      min: 0
    }
  },
  transactionLimit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 100000.00, // ₦100,000 per transaction
    validate: {
      min: 0
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional card metadata including usage stats, status changes, etc.'
  },
  lastUsed: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last transaction date'
  }
}, {
  tableName: 'virtual_cards',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['cardType']
    },
    {
      fields: ['brand']
    },
    {
      unique: true,
      fields: ['cardNumber']
    }
  ]
});

// Instance methods
VirtualCard.prototype.isActive = function() {
  return this.status === 'active';
};

VirtualCard.prototype.canTransact = function() {
  return ['active', 'inactive'].includes(this.status);
};

VirtualCard.prototype.isExpired = function() {
  const now = new Date();
  const [month, year] = this.expiryDate.split('/');
  const expiryDate = new Date(2000 + parseInt(year), parseInt(month) - 1, 1);
  const lastDayOfMonth = new Date(expiryDate.getFullYear(), expiryDate.getMonth() + 1, 0);
  
  return now > lastDayOfMonth;
};

VirtualCard.prototype.getRemainingBalance = function() {
  return parseFloat(this.balance);
};

VirtualCard.prototype.getUsagePercentage = function(period = 'monthly') {
  const limit = period === 'daily' ? this.dailyLimit : this.monthlyLimit;
  const used = this.metadata?.usage?.[`${period}Spent`] || 0;
  return Math.min((used / parseFloat(limit)) * 100, 100);
};

module.exports = VirtualCard;
const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  whatsappNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      is: /^[\+]?[0-9]+$/
    }
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  middleName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  gender: {
    type: DataTypes.ENUM('male', 'female'),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bvn: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: {
      len: [11, 11]
    }
  },
  kycStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'incomplete'),
    defaultValue: 'incomplete'
  },
  kycData: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isBanned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastSeen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  pin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pinAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  pinLockedUntil: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('pin') && user.pin) {
        user.pin = await bcrypt.hash(user.pin, 12);
      }
    }
  }
});

// Instance methods
User.prototype.validatePin = async function(pin) {
  return await bcrypt.compare(pin, this.pin);
};

User.prototype.isKycComplete = function() {
  return this.kycStatus === 'verified' && 
         this.firstName && 
         this.lastName && 
         this.dateOfBirth && 
         this.bvn;
};

User.prototype.canPerformTransactions = function() {
  return this.isActive && 
         !this.isBanned && 
         this.isKycComplete() &&
         (!this.pinLockedUntil || this.pinLockedUntil < new Date());
};

module.exports = User;
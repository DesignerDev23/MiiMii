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
  bvnVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'Whether BVN has been verified with Rubies API'
  },
  bvnVerificationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when BVN was successfully verified'
  },
  alternatePhone: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Alternate phone number from BVN data'
  },
  bvnData: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional data returned from BVN verification'
  },
  kycStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'incomplete', 'not_required'),
    defaultValue: 'not_required'
  },
  kycData: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  onboardingStep: {
    type: DataTypes.ENUM(
      'initial', 'greeting', 'name_collection', 
      'address_collection', 'bvn_collection', 'virtual_account_creation', 'pin_setup', 'flow_onboarding', 'completed',
      'profile_setup', 'kyc_submission'
    ),
    defaultValue: 'initial'
  },
  conversationState: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Stores current conversation context and expected inputs'
  },
  sessionData: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Temporary session data for ongoing transactions'
  },
  preferredLanguage: {
    type: DataTypes.STRING,
    defaultValue: 'en',
    validate: {
      isIn: [['en', 'ha', 'yo', 'ig']] // English, Hausa, Yoruba, Igbo
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isBanned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  banReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bannedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastSeen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastActivityType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Last activity performed by user'
  },
  lastWelcomedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time user received welcome message'
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Full name from WhatsApp profile'
  },
  profilePicture: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'WhatsApp profile picture URL'
  },
  registrationSource: {
    type: DataTypes.ENUM('whatsapp', 'api', 'admin'),
    defaultValue: 'whatsapp'
  },
  deviceInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Device and WhatsApp client information'
  },
  securitySettings: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      transactionLimits: {
        daily: 50000,
        single: 20000
      },
      notificationPreferences: {
        sms: true,
        whatsapp: true,
        email: false
      }
    }
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
  },
  pinSetAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pinEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    comment: 'Whether PIN is required for transactions (true) or disabled (false)'
  },
  referralCode: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  referredBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  totalReferrals: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lifetimeValue: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    comment: 'Total transaction volume by user'
  },
  riskScore: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 1
    },
    comment: 'Risk assessment score (0.00 - 1.00)'
  },
  lastTransactionAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalTransactionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    { fields: ['whatsappNumber'] },
    { fields: ['kycStatus'] },
    { fields: ['onboardingStep'] },
    { fields: ['referralCode'] },
    { fields: ['referredBy'] },
    { fields: ['isActive', 'isBanned'] },
    { fields: ['lastSeen'] }
  ],
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('pin') && user.pin) {
        user.pin = await bcrypt.hash(user.pin, 12);
        user.pinSetAt = new Date();
      }
      
      // Generate referral code if not exists
      if (!user.referralCode && user.firstName) {
        user.referralCode = `${user.firstName.substring(0, 3).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
         this.onboardingStep === 'completed' &&
         this.pin &&
         (!this.pinLockedUntil || this.pinLockedUntil < new Date());
};

User.prototype.requiresPinForTransactions = function() {
  return this.pinEnabled && this.pin;
};

User.prototype.updateConversationState = async function(state) {
  const logger = require('../utils/logger');
  
  logger.info('Updating conversation state', {
    userId: this.id,
    oldState: this.conversationState,
    newState: state
  });
  
  // If state is null, clear the conversation state
  if (state === null) {
    this.conversationState = null;
  } else {
    // Replace the entire conversation state with the new state
    this.conversationState = state;
  }
  
  const result = await this.save();
  
  logger.info('Conversation state updated successfully', {
    userId: this.id,
    finalState: this.conversationState
  });
  
  return result;
};

User.prototype.clearConversationState = async function() {
  this.conversationState = null;
  this.sessionData = null;
  return this.save();
};

User.prototype.incrementReferrals = async function() {
  this.totalReferrals += 1;
  return this.save();
};

User.prototype.updateRiskScore = async function(score) {
  this.riskScore = Math.max(0, Math.min(1, score));
  return this.save();
};

User.prototype.isOnboardingComplete = function() {
  return this.onboardingStep === 'completed' && !!this.pin;
};

User.prototype.getNextOnboardingStep = function() {
  const steps = {
    'greeting': 'name_collection',
    'name_collection': 'kyc_data',
    'kyc_data': 'bvn_verification',
    'bvn_verification': 'virtual_account_creation',
    'virtual_account_creation': 'pin_setup',
    'pin_setup': 'completed'
  };
  return steps[this.onboardingStep] || 'completed';
};

module.exports = User;
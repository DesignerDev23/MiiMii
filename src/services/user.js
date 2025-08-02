const { User, Wallet } = require('../models');
const logger = require('../utils/logger');

class UserService {
  async getOrCreateUser(whatsappNumber, displayName = null) {
    try {
      // Clean phone number
      const cleanNumber = this.cleanPhoneNumber(whatsappNumber);
      
      // Try to find existing user
      let user = await User.findOne({
        where: { whatsappNumber: cleanNumber },
        include: [{ model: Wallet, as: 'wallet' }]
      });

      if (!user) {
        // Create new user
        user = await User.create({
          whatsappNumber: cleanNumber,
          firstName: displayName,
          isActive: true
        });

        // Create wallet for new user
        const walletService = require('./wallet');
        await walletService.createWallet(user.id);

        logger.info('New user created', { userId: user.id, whatsappNumber: cleanNumber });
      } else {
        // Update display name if provided and not already set
        if (displayName && !user.firstName) {
          await user.update({ firstName: displayName });
        }
      }

      return user;
    } catch (error) {
      logger.error('Failed to get or create user', { error: error.message, whatsappNumber });
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Wallet, as: 'wallet' }]
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Failed to get user by ID', { error: error.message, userId });
      throw error;
    }
  }

  async getUserByPhoneNumber(phoneNumber) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      
      const user = await User.findOne({
        where: { whatsappNumber: cleanNumber },
        include: [{ model: Wallet, as: 'wallet' }]
      });

      return user;
    } catch (error) {
      logger.error('Failed to get user by phone number', { error: error.message, phoneNumber });
      throw error;
    }
  }

  async updateUser(userId, updateData) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      await user.update(updateData);
      
      logger.info('User updated', { userId, updateData });
      
      return user;
    } catch (error) {
      logger.error('Failed to update user', { error: error.message, userId, updateData });
      throw error;
    }
  }

  async banUser(userId, reason = null) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      await user.update({ 
        isBanned: true,
        metadata: {
          ...user.metadata,
          bannedAt: new Date(),
          banReason: reason
        }
      });

      logger.info('User banned', { userId, reason });
      
      return user;
    } catch (error) {
      logger.error('Failed to ban user', { error: error.message, userId });
      throw error;
    }
  }

  async unbanUser(userId) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      await user.update({ 
        isBanned: false,
        metadata: {
          ...user.metadata,
          unbannedAt: new Date()
        }
      });

      logger.info('User unbanned', { userId });
      
      return user;
    } catch (error) {
      logger.error('Failed to unban user', { error: error.message, userId });
      throw error;
    }
  }

  async setUserPin(userId, pin) {
    try {
      if (!/^\d{4}$/.test(pin)) {
        throw new Error('PIN must be 4 digits');
      }

      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      await user.update({ 
        pin,
        pinAttempts: 0,
        pinLockedUntil: null
      });

      logger.info('User PIN set', { userId });
      
      return user;
    } catch (error) {
      logger.error('Failed to set user PIN', { error: error.message, userId });
      throw error;
    }
  }

  async validateUserPin(userId, pin) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.pin) {
        throw new Error('PIN not set');
      }

      // Check if PIN is locked
      if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
        const lockMinutes = Math.ceil((user.pinLockedUntil - new Date()) / 60000);
        throw new Error(`PIN locked for ${lockMinutes} more minutes`);
      }

      const isValid = await user.validatePin(pin);

      if (isValid) {
        // Reset PIN attempts on successful validation
        await user.update({ pinAttempts: 0, pinLockedUntil: null });
        return true;
      } else {
        // Increment PIN attempts
        const newAttempts = user.pinAttempts + 1;
        let pinLockedUntil = null;

        // Lock PIN after 3 failed attempts for 15 minutes
        if (newAttempts >= 3) {
          pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }

        await user.update({ pinAttempts: newAttempts, pinLockedUntil });

        if (pinLockedUntil) {
          throw new Error('PIN locked for 15 minutes due to too many failed attempts');
        } else {
          throw new Error(`Invalid PIN. ${3 - newAttempts} attempts remaining`);
        }
      }
    } catch (error) {
      logger.error('PIN validation failed', { error: error.message, userId });
      throw error;
    }
  }

  async getUserStats(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [
          { model: Wallet, as: 'wallet' },
          { model: require('../models').Transaction, as: 'transactions' }
        ]
      });

      if (!user) {
        throw new Error('User not found');
      }

      const stats = {
        totalTransactions: user.transactions.length,
        successfulTransactions: user.transactions.filter(t => t.status === 'completed').length,
        totalSpent: user.transactions
          .filter(t => t.type === 'debit' && t.status === 'completed')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        totalReceived: user.transactions
          .filter(t => t.type === 'credit' && t.status === 'completed')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        currentBalance: parseFloat(user.wallet?.balance || 0),
        accountAge: Math.floor((new Date() - user.createdAt) / (1000 * 60 * 60 * 24)), // days
        lastActive: user.lastSeen
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get user stats', { error: error.message, userId });
      throw error;
    }
  }

  cleanPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Convert +234 format to 0 format
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      cleaned = '0' + cleaned.slice(3);
    }
    
    // Ensure it starts with 0 and is 11 digits
    if (!cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '0' + cleaned;
    }
    
    if (cleaned.length !== 11 || !cleaned.startsWith('0')) {
      throw new Error('Invalid phone number format');
    }
    
    return cleaned;
  }

  formatPhoneNumber(phoneNumber) {
    const cleaned = this.cleanPhoneNumber(phoneNumber);
    return `+234${cleaned.slice(1)}`;
  }

  validatePhoneNumber(phoneNumber) {
    try {
      this.cleanPhoneNumber(phoneNumber);
      return true;
    } catch (error) {
      return false;
    }
  }

  async searchUsers(query, limit = 10) {
    try {
      const users = await User.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { firstName: { [require('sequelize').Op.iLike]: `%${query}%` } },
            { lastName: { [require('sequelize').Op.iLike]: `%${query}%` } },
            { whatsappNumber: { [require('sequelize').Op.like]: `%${query}%` } }
          ]
        },
        include: [{ model: Wallet, as: 'wallet' }],
        limit,
        order: [['lastSeen', 'DESC']]
      });

      return users;
    } catch (error) {
      logger.error('User search failed', { error: error.message, query });
      throw error;
    }
  }
}

module.exports = new UserService();
const { User, Wallet } = require('../models');
const logger = require('../utils/logger');
const databaseService = require('./database');
const { Op } = require('sequelize');

class UserService {
  async getOrCreateUser(whatsappNumber, displayName = null) {
    try {
      // Clean phone number
      const cleanNumber = this.cleanPhoneNumber(whatsappNumber);
      
      // Try to find existing user using retry logic
      let user = await databaseService.findOneWithRetry(User, {
        where: { whatsappNumber: cleanNumber },
        include: [{ model: Wallet, as: 'wallet' }]
      }, { operationName: 'find user by WhatsApp number' });

      if (!user) {
        // Create new user using retry logic
        user = await databaseService.createWithRetry(User, {
          whatsappNumber: cleanNumber,
          firstName: displayName,
          isActive: true
        }, {}, { operationName: 'create new user' });

        // Create wallet for new user
        const walletService = require('./wallet');
        await walletService.createWallet(user.id);

        logger.info('New user created', { userId: user.id, whatsappNumber: cleanNumber });
      } else {
        // Update display name if provided and not already set
        if (displayName && !user.firstName) {
          await databaseService.executeWithRetry(
            () => user.update({ firstName: displayName }),
            { operationName: 'update user display name' }
          );
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
      const user = await databaseService.findByPkWithRetry(User, userId, {
        include: [{ model: Wallet, as: 'wallet' }]
      }, { operationName: 'find user by ID' });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      return user;
    } catch (error) {
      logger.error('Failed to get user by ID', { error: error.message, userId });
      throw error;
    }
  }

  async getUserByWhatsappNumber(whatsappNumber) {
    try {
      const cleanNumber = this.cleanPhoneNumber(whatsappNumber);
      
      const user = await databaseService.findOneWithRetry(User, {
        where: { whatsappNumber: cleanNumber },
        include: [{ model: Wallet, as: 'wallet' }]
      }, { operationName: 'find user by WhatsApp number' });

      return user;
    } catch (error) {
      logger.error('Failed to get user by WhatsApp number', { error: error.message, whatsappNumber });
      throw error;
    }
  }

  async updateUser(userId, updateData) {
    try {
      const [updatedRowsCount] = await databaseService.updateWithRetry(User, updateData, {
        where: { id: userId }
      }, { operationName: 'update user' });

      if (updatedRowsCount === 0) {
        throw new Error('User not found or no changes made');
      }

      // Fetch and return the updated user
      return await this.getUserById(userId);
    } catch (error) {
      logger.error('Failed to update user', { error: error.message, userId, updateData });
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      const deletedRowsCount = await databaseService.destroyWithRetry(User, {
        where: { id: userId }
      }, { operationName: 'delete user' });

      if (deletedRowsCount === 0) {
        throw new Error('User not found');
      }

      logger.info('User deleted successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to delete user', { error: error.message, userId });
      throw error;
    }
  }

  async getAllUsers(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        isActive = null,
        kycStatus = null
      } = options;

      const offset = (page - 1) * limit;
      const whereClause = {};

      if (isActive !== null) {
        whereClause.isActive = isActive;
      }

      if (kycStatus !== null) {
        whereClause.kycStatus = kycStatus;
      }

      const users = await databaseService.findWithRetry(User, {
        where: whereClause,
        include: [{ model: Wallet, as: 'wallet' }],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      }, { operationName: 'get all users' });

      return users;
    } catch (error) {
      logger.error('Failed to get all users', { error: error.message, options });
      throw error;
    }
  }

  async searchUsers(searchTerm, options = {}) {
    try {
      const { limit = 20 } = options;
      const cleanSearchTerm = this.cleanPhoneNumber(searchTerm);

      const users = await databaseService.findWithRetry(User, {
        where: {
          [Op.or]: [
            { whatsappNumber: { [Op.like]: `%${cleanSearchTerm}%` } },
            { firstName: { [Op.iLike]: `%${searchTerm}%` } },
            { lastName: { [Op.iLike]: `%${searchTerm}%` } },
            { email: { [Op.iLike]: `%${searchTerm}%` } }
          ]
        },
        include: [{ model: Wallet, as: 'wallet' }],
        limit,
        order: [['createdAt', 'DESC']]
      }, { operationName: 'search users' });

      return users;
    } catch (error) {
      logger.error('Failed to search users', { error: error.message, searchTerm });
      throw error;
    }
  }

  async updateUserKYCStatus(userId, kycStatus, reviewNotes = null) {
    try {
      const updateData = { 
        kycStatus,
        kycUpdatedAt: new Date()
      };

      if (reviewNotes) {
        updateData.kycReviewNotes = reviewNotes;
      }

      const [updatedRowsCount] = await databaseService.updateWithRetry(User, updateData, {
        where: { id: userId }
      }, { operationName: 'update user KYC status' });

      if (updatedRowsCount === 0) {
        throw new Error('User not found');
      }

      logger.info('User KYC status updated', { userId, kycStatus, reviewNotes });
      return await this.getUserById(userId);
    } catch (error) {
      logger.error('Failed to update user KYC status', { error: error.message, userId, kycStatus });
      throw error;
    }
  }

  async banUser(userId, reason = null, bannedBy = null) {
    try {
      const updateData = {
        isActive: false,
        isBanned: true,
        bannedAt: new Date(),
        banReason: reason,
        bannedBy: bannedBy
      };

      const [updatedRowsCount] = await databaseService.updateWithRetry(User, updateData, {
        where: { id: userId }
      }, { operationName: 'ban user' });

      if (updatedRowsCount === 0) {
        throw new Error('User not found');
      }

      logger.info('User banned', { userId, reason, bannedBy });
      return await this.getUserById(userId);
    } catch (error) {
      logger.error('Failed to ban user', { error: error.message, userId, reason });
      throw error;
    }
  }

  async unbanUser(userId, unbannedBy = null) {
    try {
      const updateData = {
        isActive: true,
        isBanned: false,
        bannedAt: null,
        banReason: null,
        bannedBy: null,
        unbannedAt: new Date(),
        unbannedBy: unbannedBy
      };

      const [updatedRowsCount] = await databaseService.updateWithRetry(User, updateData, {
        where: { id: userId }
      }, { operationName: 'unban user' });

      if (updatedRowsCount === 0) {
        throw new Error('User not found');
      }

      logger.info('User unbanned', { userId, unbannedBy });
      return await this.getUserById(userId);
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

  async getUserStats() {
    try {
      const stats = await databaseService.safeExecute(async () => {
        const [results] = await databaseService.queryWithRetry(`
          SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN "isActive" = true THEN 1 END) as active_users,
            COUNT(CASE WHEN "isBanned" = true THEN 1 END) as banned_users,
            COUNT(CASE WHEN "kycStatus" = 'verified' THEN 1 END) as verified_users,
            COUNT(CASE WHEN "createdAt" >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
          FROM "Users"
        `, { type: require('sequelize').QueryTypes.SELECT });

        return results[0];
      }, {
        operationName: 'get user statistics',
        fallbackValue: {
          total_users: 0,
          active_users: 0,
          banned_users: 0,
          verified_users: 0,
          new_users_30d: 0
        }
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get user stats', { error: error.message });
      return {
        total_users: 0,
        active_users: 0,
        banned_users: 0,
        verified_users: 0,
        new_users_30d: 0
      };
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
}

module.exports = new UserService();
const { 
  User, 
  Wallet,
  Transaction,
  Beneficiary,
  BankAccount,
  VirtualCard,
  SupportTicket,
  ActivityLog
} = require('../models');
const logger = require('../utils/logger');
const databaseService = require('./database');
const { Op } = require('sequelize');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class UserService {
  async getOrCreateUser(whatsappNumber, displayName = null) {
    try {
      if (!whatsappNumber) {
        throw new Error('WhatsApp number is required');
      }

      // Clean phone number
      let cleanNumber;
      try {
        cleanNumber = this.cleanPhoneNumber(whatsappNumber);
      } catch (cleanError) {
        logger.error('Phone number cleaning failed', { 
          error: cleanError?.message || 'Unknown error',
          whatsappNumber,
          errorType: typeof cleanError
        });
        throw new Error(`Invalid phone number format: ${whatsappNumber}. ${cleanError?.message || 'Please check the phone number format.'}`);
      }
      
      // Try to find existing user using retry logic
      let user;
      try {
        user = await databaseService.findOneWithRetry(User, {
          where: { whatsappNumber: cleanNumber },
          include: [{ model: Wallet, as: 'wallet' }]
        }, { operationName: 'find user by WhatsApp number' });
      } catch (findError) {
        logger.error('Database find operation failed', {
          error: findError?.message || 'Unknown error',
          cleanNumber,
          errorType: typeof findError,
          stack: findError?.stack
        });
        throw findError;
      }

      if (!user) {
        // Create new user using retry logic
        try {
          user = await databaseService.createWithRetry(User, {
            whatsappNumber: cleanNumber,
            fullName: displayName || null,
            isActive: true
          }, {}, { operationName: 'create new user' });

          // Create wallet for new user
          const walletService = require('./wallet');
          await walletService.createWallet(user.id);

          logger.info('New user created', { userId: user.id, whatsappNumber: cleanNumber });
        } catch (createError) {
          logger.error('User creation failed', {
            error: createError?.message || 'Unknown error',
            cleanNumber,
            errorType: typeof createError,
            stack: createError?.stack
          });
          throw createError;
        }
      } else {
        // Update display name if provided and not already set
        if (displayName && !user.fullName) {
          try {
            await databaseService.executeWithRetry(
              () => user.update({ fullName: displayName }),
              { operationName: 'update user display name' }
            );
          } catch (updateError) {
            // Non-critical error, log but don't fail
            logger.warn('Failed to update display name', {
              error: updateError?.message || 'Unknown error',
              userId: user.id
            });
          }
        }
      }

      return user;
    } catch (error) {
      // Ensure we always have an error object
      const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      const errorStack = error?.stack || (error instanceof Error ? error.stack : undefined);
      
      logger.error('Failed to get or create user', { 
        error: errorMessage,
        stack: errorStack,
        whatsappNumber,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        isError: error instanceof Error
      });
      
      // Re-throw as Error object if it's not already one
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(errorMessage);
      }
    }
  }

  async createUser(data) {
    try {
      return await databaseService.createWithRetry(User, data, {}, { operationName: 'create user' });
    } catch (error) {
      logger.error('Failed to create user', { error: error?.message || 'Unknown error', stack: error?.stack, data });
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
      logger.error('Failed to get user by ID', { error: error?.message || 'Unknown error', stack: error?.stack, userId });
      throw error;
    }
  }

  /**
   * Check if user has completed onboarding (virtual account creation)
   */
  async checkUserOnboardingStatus(userId) {
    try {
      const user = await this.getUserById(userId);
      const walletService = require('./wallet');
      
      // Get user's wallet
      const wallet = await walletService.getUserWallet(userId);
      
      // Check if user has virtual account
      const hasVirtualAccount = !!(wallet?.virtualAccountNumber);
      
      // Check if user has completed all required onboarding steps
      const requiredFields = ['firstName', 'lastName', 'bvn', 'gender', 'dateOfBirth'];
      const missingFields = requiredFields.filter(field => !user[field]);
      
      // Check onboarding step
      const isOnboardingComplete = user.onboardingStep === 'completed';
      
      // User is considered fully onboarded if:
      // 1. They have a virtual account number
      // 2. All required fields are filled
      // 3. Onboarding step is marked as completed
      const isComplete = hasVirtualAccount && missingFields.length === 0 && isOnboardingComplete;
      
      return {
        isComplete,
        hasVirtualAccount,
        isOnboardingComplete,
        missingFields,
        onboardingStep: user.onboardingStep,
        wallet: wallet ? {
          id: wallet.id,
          hasVirtualAccount: !!wallet.virtualAccountNumber,
          virtualAccountNumber: wallet.virtualAccountNumber
        } : null
      };
    } catch (error) {
      logger.error('Error checking user onboarding status', { 
        error: error.message, 
        userId 
      });
      
      // Default to incomplete if we can't check
      return {
        isComplete: false,
        hasVirtualAccount: false,
        isOnboardingComplete: false,
        missingFields: ['firstName', 'lastName', 'bvn', 'gender', 'dateOfBirth'],
        onboardingStep: 'initial',
        wallet: null
      };
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

  async findByAppEmail(email) {
    try {
      if (!email) return null;
      return await databaseService.findOneWithRetry(User, {
        where: { appEmail: email.toLowerCase() }
      }, { operationName: 'find user by appEmail' });
    } catch (error) {
      logger.error('Failed to get user by app email', { error: error.message, email });
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

  async deleteUser(userId, options = {}) {
    const { force = false, deletedBy = null, reason = null } = options;
    
    try {
      const result = await databaseService.transaction(async (transaction) => {
        const user = await User.findByPk(userId, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!user) {
          throw new Error('User not found');
        }

        const wallet = await Wallet.findOne({
          where: { userId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        const walletBalance = wallet ? parseFloat(wallet.balance || 0) : 0;
        const pendingBalance = wallet ? parseFloat(wallet.pendingBalance || 0) : 0;

        if (!force && (walletBalance !== 0 || pendingBalance !== 0)) {
          throw new Error('User wallet must have zero balance and no pending funds before deletion');
        }

        const destroyByUserId = async (model) => {
          await model.destroy({ where: { userId }, transaction, individualHooks: true });
        };

        await Promise.all([
          destroyByUserId(VirtualCard),
          destroyByUserId(Beneficiary),
          destroyByUserId(BankAccount),
          destroyByUserId(SupportTicket),
          destroyByUserId(ActivityLog),
          destroyByUserId(Transaction)
        ]);

        if (wallet) {
          await Wallet.destroy({ where: { id: wallet.id }, transaction });
        }

        const snapshot = {
          id: user.id,
          whatsappNumber: user.whatsappNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        };

        await User.destroy({ where: { id: userId }, transaction });

        await ActivityLog.create({
          userId: null,
          activityType: 'admin_action',
          action: 'user_deleted',
          description: reason || 'User account permanently deleted by admin',
          metadata: {
            deletedBy,
            reason,
            targetUserId: userId,
            userSnapshot: snapshot
          },
          source: 'admin',
          tags: ['admin', 'user_delete']
        }, { transaction });

        return snapshot;
      });

      logger.info('User deleted successfully', { userId, deletedBy, force });
      return result;
    } catch (error) {
      logger.error('Failed to delete user', { error: error.message, userId, deletedBy, force });
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

      // Check if PIN is disabled - no validation required
      if (!user.pinEnabled) {
        logger.info('PIN validation skipped - PIN is disabled', { userId });
        return true;
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

  async incrementAppLoginAttempts(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;
      const attempts = (user.appLoginAttempts || 0) + 1;
      const updates = { appLoginAttempts: attempts };
      if (attempts >= 5) {
        updates.appLockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.update(updates);
    } catch (error) {
      logger.error('Failed to increment app login attempts', { error: error.message, userId });
    }
  }

  async resetAppLoginAttempts(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;
      await user.update({ appLoginAttempts: 0, appLockUntil: null });
    } catch (error) {
      logger.error('Failed to reset app login attempts', { error: error.message, userId });
    }
  }

  async generatePasswordResetOTP(email) {
    try {
      const user = await this.findByAppEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        return { success: true, message: 'If the email exists, an OTP has been sent' };
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      await user.update({
        appPasswordResetOTP: otp,
        appPasswordResetOTPExpiry: otpExpiry,
        appPasswordResetOTPAttempts: 0
      });

      logger.info('Password reset OTP generated', { userId: user.id, email });

      // Send OTP via email
      try {
        const emailService = require('./emailService');
        const emailResult = await emailService.sendPasswordResetOTP(email, otp);
        if (!emailResult.success) {
          logger.warn('Failed to send password reset OTP email', {
            error: emailResult.error,
            userId: user.id
          });
          // Still return success but log the email failure
        }
      } catch (emailError) {
        logger.warn('Email service error during password reset OTP', {
          error: emailError.message,
          userId: user.id
        });
        // Continue even if email fails - OTP is still generated
      }

      // In production, remove OTP from response and send via email only
      return {
        success: true,
        message: 'If the email exists, an OTP has been sent',
        // Remove this in production - OTP should only be sent via email
        ...(process.env.NODE_ENV !== 'production' && { otp }) // Only for development/testing
      };
    } catch (error) {
      logger.error('Failed to generate password reset OTP', { error: error.message, email });
      throw error;
    }
  }

  async verifyPasswordResetOTP(email, otp) {
    try {
      const user = await this.findByAppEmail(email);
      if (!user) {
        return { valid: false, error: 'Invalid email or OTP' };
      }

      // Check if OTP exists and is not expired
      if (!user.appPasswordResetOTP || !user.appPasswordResetOTPExpiry) {
        return { valid: false, error: 'No OTP found. Please request a new one.' };
      }

      if (user.appPasswordResetOTPExpiry < new Date()) {
        // Clear expired OTP
        await user.update({
          appPasswordResetOTP: null,
          appPasswordResetOTPExpiry: null,
          appPasswordResetOTPAttempts: 0
        });
        return { valid: false, error: 'OTP has expired. Please request a new one.' };
      }

      // Check attempt limit (max 5 attempts)
      if (user.appPasswordResetOTPAttempts >= 5) {
        // Clear OTP after max attempts
        await user.update({
          appPasswordResetOTP: null,
          appPasswordResetOTPExpiry: null,
          appPasswordResetOTPAttempts: 0
        });
        return { valid: false, error: 'Too many failed attempts. Please request a new OTP.' };
      }

      // Verify OTP
      if (user.appPasswordResetOTP !== otp) {
        // Increment attempt counter
        await user.update({
          appPasswordResetOTPAttempts: (user.appPasswordResetOTPAttempts || 0) + 1
        });
        const remainingAttempts = 5 - (user.appPasswordResetOTPAttempts + 1);
        return { 
          valid: false, 
          error: `Invalid OTP. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : 'Please request a new OTP.'}` 
        };
      }

      // OTP is valid
      return { valid: true, user };
    } catch (error) {
      logger.error('Failed to verify password reset OTP', { error: error.message });
      return { valid: false, error: 'OTP verification failed' };
    }
  }

  async resetPasswordWithOTP(email, otp, newPassword) {
    try {
      const verification = await this.verifyPasswordResetOTP(email, otp);
      if (!verification.valid) {
        throw new Error(verification.error || 'Invalid or expired OTP');
      }

      const user = verification.user;

      // Hash new password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password and clear OTP
      await user.update({
        appPasswordHash: passwordHash,
        appPasswordResetOTP: null,
        appPasswordResetOTPExpiry: null,
        appPasswordResetOTPAttempts: 0,
        appLoginAttempts: 0,
        appLockUntil: null
      });

      logger.info('Password reset successful with OTP', { userId: user.id });

      return { success: true, message: 'Password reset successful' };
    } catch (error) {
      logger.error('Failed to reset password with OTP', { error: error.message });
      throw error;
    }
  }

  async disableUserPin(userId, confirmationPin) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.pin) {
        throw new Error('PIN not set');
      }

      // Validate the confirmation PIN
      const isValidPin = await user.validatePin(confirmationPin);
      if (!isValidPin) {
        throw new Error('Invalid PIN provided for confirmation');
      }

      // Disable PIN
      await user.update({ pinEnabled: false });

      logger.info('PIN disabled for user', { userId, pinEnabled: false });
      
      return {
        success: true,
        message: 'PIN has been successfully disabled. Transactions will no longer require PIN verification.',
        pinEnabled: false
      };
    } catch (error) {
      logger.error('Failed to disable PIN', { error: error.message, userId });
      throw error;
    }
  }

  async enableUserPin(userId, confirmationPin) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.pin) {
        throw new Error('PIN not set');
      }

      // Validate the confirmation PIN
      const isValidPin = await user.validatePin(confirmationPin);
      if (!isValidPin) {
        throw new Error('Invalid PIN provided for confirmation');
      }

      // Enable PIN
      await user.update({ pinEnabled: true });

      logger.info('PIN enabled for user', { userId, pinEnabled: true });
      
      return {
        success: true,
        message: 'PIN has been successfully enabled. Transactions will now require PIN verification.',
        pinEnabled: true
      };
    } catch (error) {
      logger.error('Failed to enable PIN', { error: error.message, userId });
      throw error;
    }
  }

  async getPinStatus(userId) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return {
        hasPin: !!user.pin,
        pinEnabled: user.pinEnabled,
        pinLocked: user.pinLockedUntil && user.pinLockedUntil > new Date(),
        pinLockedUntil: user.pinLockedUntil
      };
    } catch (error) {
      logger.error('Failed to get PIN status', { error: error.message, userId });
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
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Convert to string if not already
    const phoneStr = String(phoneNumber).trim();
    if (!phoneStr) {
      throw new Error('Phone number cannot be empty');
    }

    // Remove all non-digit characters
    let cleaned = phoneStr.replace(/\D/g, '');
    
    if (!cleaned || cleaned.length === 0) {
      throw new Error(`Invalid phone number: ${phoneNumber} - no digits found`);
    }
    
    // Handle different input formats and convert to E.164
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      // Already in +234 format without the + (e.g., 2349072874728)
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      // Nigerian local format (e.g., 08012345678)
      return `+234${cleaned.slice(1)}`;
    } else if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
      // 10-digit Nigerian number without leading 0 (e.g., 8012345678)
      return `+234${cleaned}`;
    } else if (phoneStr.startsWith('+234') && cleaned.length === 13) {
      // Already properly formatted
      return phoneStr;
    } else if (phoneStr.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 15) {
      // Other international numbers already in E.164 format
      return phoneStr;
    }
    
    // If none of the above patterns match, assume it's a Nigerian number without country code
    if (cleaned.length === 10) {
      return `+234${cleaned}`;
    }
    
    // If it's 13 digits starting with 234, add +
    if (cleaned.length === 13 && cleaned.startsWith('234')) {
      return `+${cleaned}`;
    }
    
    throw new Error(`Invalid phone number format: ${phoneNumber}. Expected Nigerian format (08012345678) or international E.164 format (+234...). Got: ${cleaned.length} digits`);
  }

  formatPhoneNumber(phoneNumber) {
    // cleanPhoneNumber now returns E.164 format, so just return it
    return this.cleanPhoneNumber(phoneNumber);
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
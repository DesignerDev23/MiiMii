const { Wallet, Transaction, User, ActivityLog } = require('../models');
const { sequelize } = require('../database/connection');
const bellBankService = require('./bellbank');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize'); // Added Op for date range queries
const userService = require('./user'); // Added userService for getUserById

class WalletService {
  async createWallet(userId) {
    const transaction = await sequelize.transaction();
    
    try {
      // Check if wallet already exists
      const existingWallet = await Wallet.findOne({ where: { userId } });
      if (existingWallet) {
        await transaction.rollback();
        return existingWallet;
      }

      // Create wallet
      const wallet = await Wallet.create({
        userId,
        balance: 0.00,
        ledgerBalance: 0.00,
        currency: 'NGN'
      }, { transaction });

      // Get user for virtual account creation
      const user = await User.findByPk(userId);
      
      // Create virtual account with BellBank immediately (provider validates BVN)
      try {
        const virtualAccount = await bellBankService.createVirtualAccount({
          firstName: user.firstName,
          lastName: user.lastName,
          middleName: user.middleName,
          phoneNumber: user.whatsappNumber,
          address: user.address,
          bvn: user.bvn,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          userId: user.id
        });
        
        await wallet.update({
          virtualAccountNumber: virtualAccount.accountNumber,
          virtualAccountBank: virtualAccount.bankName,
          virtualAccountName: virtualAccount.accountName,
          bankCode: virtualAccount.bankCode,
          accountReference: virtualAccount.reference
        }, { transaction });
      } catch (error) {
        logger.warn('Failed to create virtual account during wallet creation', {
          error: error.message,
          userId
        });
        // Continue without virtual account - can be created later
      }

      await transaction.commit();
      
      logger.info('Wallet created successfully', {
        userId,
        walletId: wallet.id,
        hasVirtualAccount: !!wallet.virtualAccountNumber
      });

      return wallet;
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to create wallet', { error: error.message, userId });
      throw error;
    }
  }

  async getUserWallet(userId) {
    try {
      let wallet = await Wallet.findOne({ where: { userId } });
      
      if (!wallet) {
        wallet = await this.createWallet(userId);
      }

      return wallet;
    } catch (error) {
      logger.error('Failed to get user wallet', { error: error.message, userId });
      throw error;
    }
  }

  async creditWallet(userId, amount, description, metadata = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      const wallet = await this.getUserWallet(userId);
      const user = await User.findByPk(userId);

      if (!wallet.isActive) {
        throw new Error('Wallet is inactive');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const creditAmount = parseFloat(amount);
      const balanceAfter = balanceBefore + creditAmount;

      // Create transaction record
      const txnRecord = await Transaction.create({
        reference: this.generateReference(),
        userId,
        type: 'credit',
        category: metadata.category || 'wallet_funding',
        amount: creditAmount,
        fee: 0,
        totalAmount: creditAmount,
        status: 'completed',
        description,
        balanceBefore,
        balanceAfter,
        metadata,
        processedAt: new Date()
      }, { transaction });

      // Update wallet balance
      await wallet.update({
        previousBalance: balanceBefore,
        balance: balanceAfter,
        availableBalance: parseFloat(wallet.availableBalance || 0) + creditAmount,
        ledgerBalance: balanceAfter,
        totalCredits: parseFloat(wallet.totalCredits || 0) + creditAmount
      }, { transaction });

      await transaction.commit();

      logger.info('Wallet credited successfully', {
        userId,
        amount: creditAmount,
        reference: txnRecord.reference,
        newBalance: balanceAfter
      });

      return {
        transaction: txnRecord,
        newBalance: balanceAfter,
        previousBalance: balanceBefore
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to credit wallet', { error: error.message, userId, amount });
      throw error;
    }
  }

  async debitWallet(userId, amount, description, metadata = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      const wallet = await this.getUserWallet(userId);
      const user = await User.findByPk(userId);

      if (!wallet.isActive) {
        throw new Error('Wallet is inactive');
      }

      if (wallet.isFrozen) {
        throw new Error('Wallet is frozen');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const debitAmount = parseFloat(amount);
      
      if (balanceBefore < debitAmount) {
        throw new Error('Insufficient balance');
      }

      const balanceAfter = balanceBefore - debitAmount;

      // Create transaction record
      const txnRecord = await Transaction.create({
        reference: this.generateReference(),
        userId,
        type: 'debit',
        category: metadata.category || 'wallet_transfer',
        amount: debitAmount,
        fee: metadata.fee || 0,
        totalAmount: debitAmount + (metadata.fee || 0),
        status: 'completed',
        description,
        balanceBefore,
        balanceAfter,
        metadata,
        processedAt: new Date()
      }, { transaction });

      // Update wallet balance
      await wallet.update({
        previousBalance: balanceBefore,
        balance: balanceAfter,
        availableBalance: parseFloat(wallet.availableBalance || 0) - debitAmount,
        ledgerBalance: balanceAfter,
        totalDebits: parseFloat(wallet.totalDebits || 0) + debitAmount
      }, { transaction });

      await transaction.commit();

      logger.info('Wallet debited successfully', {
        userId,
        amount: debitAmount,
        reference: txnRecord.reference,
        newBalance: balanceAfter
      });

      return {
        transaction: txnRecord,
        newBalance: balanceAfter,
        previousBalance: balanceBefore
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to debit wallet', { error: error.message, userId, amount });
      throw error;
    }
  }

  async transferBetweenWallets(fromUserId, toUserId, amount, description = 'Wallet transfer') {
    const transaction = await sequelize.transaction();
    
    try {
      const fromUser = await User.findByPk(fromUserId);
      const toUser = await User.findByPk(toUserId);

      if (!fromUser || !toUser) {
        throw new Error('User not found');
      }

      if (!fromUser.canPerformTransactions()) {
        throw new Error('Sender cannot perform transactions');
      }

      const transferAmount = parseFloat(amount);
      const reference = this.generateReference();

      // Debit sender
      await this.debitWallet(fromUserId, transferAmount, description, {
        category: 'wallet_transfer',
        recipientUserId: toUserId,
        recipientPhone: toUser.whatsappNumber,
        transferReference: reference
      });

      // Credit receiver
      await this.creditWallet(toUserId, transferAmount, description, {
        category: 'wallet_funding',
        senderUserId: fromUserId,
        senderPhone: fromUser.whatsappNumber,
        transferReference: reference
      });

      await transaction.commit();

      logger.info('Wallet to wallet transfer completed', {
        fromUserId,
        toUserId,
        amount: transferAmount,
        reference
      });

      return {
        reference,
        amount: transferAmount,
        sender: fromUser.whatsappNumber,
        recipient: toUser.whatsappNumber
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Wallet transfer failed', { 
        error: error.message, 
        fromUserId, 
        toUserId, 
        amount 
      });
      throw error;
    }
  }

  async creditWalletFromVirtualAccount(webhookData) {
    try {
      const { customer_id, amount, reference, sender_name, sender_bank } = webhookData;
      
      // Find user by customer_id (which should be the user ID)
      const user = await User.findByPk(customer_id);
      if (!user) {
        throw new Error('User not found for virtual account credit');
      }

      // Apply transfer fee logic
      const creditAmount = parseFloat(amount);
      let finalAmount = creditAmount;
      let fee = 0;

      // Apply incoming transfer fees based on amount
      if (creditAmount > 1000) {
        fee = Math.round(creditAmount * 0.005); // 0.5% for amounts above ₦1,000
        finalAmount = creditAmount - fee;
      }
      // Amounts ₦0-₦500 are free, ₦501-₦1000 are also free for now

      const description = `Transfer from ${sender_name} (${sender_bank})`;

      // Credit the wallet
      const result = await this.creditWallet(user.id, finalAmount, description, {
        category: 'wallet_funding',
        virtualAccountCredit: true,
        originalAmount: creditAmount,
        fee,
        senderName: sender_name,
        senderBank: sender_bank,
        providerReference: reference
      });

      // Send notification to user
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `💰 *Money Received!*\n\n` +
        `Amount: ₦${finalAmount.toLocaleString()}\n` +
        `From: ${sender_name}\n` +
        `New Balance: ₦${result.newBalance.toLocaleString()}\n\n` +
        `${fee > 0 ? `Fee: ₦${fee.toLocaleString()}\n` : ''}` +
        `Reference: ${result.transaction.reference}`
      );

      logger.info('Virtual account credit processed', {
        userId: user.id,
        originalAmount: creditAmount,
        finalAmount,
        fee,
        reference
      });

      return result;
    } catch (error) {
      logger.error('Failed to process virtual account credit', {
        error: error.message,
        webhookData
      });
      throw error;
    }
  }

  async freezeWallet(userId, reason = null) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      await wallet.update({
        isFrozen: true,
        metadata: {
          ...wallet.metadata,
          frozenAt: new Date(),
          freezeReason: reason
        }
      });

      logger.info('Wallet frozen', { userId, reason });
      
      return wallet;
    } catch (error) {
      logger.error('Failed to freeze wallet', { error: error.message, userId });
      throw error;
    }
  }

  async unfreezeWallet(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      await wallet.update({
        isFrozen: false,
        metadata: {
          ...wallet.metadata,
          unfrozenAt: new Date()
        }
      });

      logger.info('Wallet unfrozen', { userId });
      
      return wallet;
    } catch (error) {
      logger.error('Failed to unfreeze wallet', { error: error.message, userId });
      throw error;
    }
  }

  async createVirtualAccountForWallet(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const wallet = await this.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Check if virtual account already exists
      if (wallet.virtualAccountNumber) {
        logger.info('Virtual account already exists for wallet', {
          userId,
          accountNumber: wallet.virtualAccountNumber,
          bankName: wallet.virtualAccountBank,
          accountName: wallet.virtualAccountName
        });
        return {
          success: true,
          accountNumber: wallet.virtualAccountNumber,
          bankName: wallet.virtualAccountBank,
          accountName: wallet.virtualAccountName
        };
      }

      // Validate required user data for virtual account creation
      const requiredFields = ['firstName', 'lastName', 'whatsappNumber', 'bvn', 'gender', 'dateOfBirth'];
      const missingFields = requiredFields.filter(field => !user[field]);
      
      if (missingFields.length > 0) {
        logger.error('Missing required fields for virtual account creation', {
          userId,
          missingFields,
          userData: {
            hasFirstName: !!user.firstName,
            hasLastName: !!user.lastName,
            hasWhatsappNumber: !!user.whatsappNumber,
            hasBvn: !!user.bvn,
            hasGender: !!user.gender,
            hasDateOfBirth: !!user.dateOfBirth
          }
        });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      logger.info('Attempting to create virtual account with BellBank', {
        userId,
        phoneNumber: user.whatsappNumber,
        hasBvn: !!user.bvn,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth
      });

      const bellBankService = require('./bellbank');
      
      const virtualAccount = await bellBankService.createVirtualAccount({
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phoneNumber: user.whatsappNumber,
        address: user.address,
        bvn: user.bvn,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        userId: user.id
      });
      
      await wallet.update({
        virtualAccountNumber: virtualAccount.accountNumber,
        virtualAccountBank: virtualAccount.bankName,
        virtualAccountName: virtualAccount.accountName
      });

      // Send AI-generated welcome message with bank details
      try {
        const aiAssistant = require('./aiAssistant');
        const whatsappService = require('./whatsapp');
        
        const accountDetails = {
          accountNumber: virtualAccount.accountNumber,
          accountName: virtualAccount.accountName,
          bankName: virtualAccount.bankName || 'BellBank'
        };
        
        const welcomeMessage = await aiAssistant.generateWelcomeMessage(user, accountDetails);
        await whatsappService.sendTextMessage(user.whatsappNumber, welcomeMessage);
        
        logger.info('AI welcome message sent for wallet virtual account', { userId });
      } catch (welcomeError) {
        logger.error('Failed to send AI welcome message for wallet', { userId, error: welcomeError.message });
      }

      logger.info('Virtual account created successfully for wallet', {
        userId,
        accountNumber: virtualAccount.accountNumber,
        bankName: virtualAccount.bankName,
        accountName: virtualAccount.accountName
      });

      return virtualAccount;
    } catch (error) {
      // Handle specific BellBank API errors
      const isBellBankError = error.message && (
        error.message.includes('504') || 
        error.message.includes('Gateway time-out') ||
        error.message.includes('BellBank') ||
        error.message.includes('HTTP 5')
      );

      if (isBellBankError) {
        logger.error('BellBank API error during virtual account creation', {
          userId,
          error: error.message,
          errorType: 'bellbank_api_error',
          stack: error.stack
        });

        // Log activity for BellBank API failure
        try {
          await ActivityLog.logUserActivity(
            userId,
            'wallet_funding',
            'virtual_account_creation_bellbank_error',
            {
              description: 'Virtual account creation failed due to BellBank API error',
              provider: 'bellbank',
              success: false,
              error: error.message,
              errorType: 'bellbank_api_error',
              source: 'api'
            }
          );
        } catch (logError) {
          logger.error('Failed to log BellBank error activity', { userId, logError: logError.message });
        }

        // Return a structured error that can be handled by the calling service
        const bellBankError = new Error(`BellBank API temporarily unavailable: ${error.message}`);
        bellBankError.name = 'BellBankAPIError';
        bellBankError.isRetryable = true;
        bellBankError.originalError = error;
        throw bellBankError;
      }

      // Handle other errors
      logger.error('Failed to create virtual account for wallet', {
        error: error.message,
        userId,
        errorType: 'general_error',
        stack: error.stack
      });

      // Log activity for general failure
      try {
        await ActivityLog.logUserActivity(
          userId,
          'wallet_funding',
          'virtual_account_creation_failed',
          {
            description: 'Virtual account creation failed',
            provider: 'bellbank',
            success: false,
            error: error.message,
            errorType: 'general_error',
            source: 'api'
          }
        );
      } catch (logError) {
        logger.error('Failed to log general error activity', { userId, logError: logError.message });
      }

      throw error;
    }
  }

  async chargeMaintenanceFee(userId) {
    try {
      const user = await User.findByPk(userId);
      const wallet = await this.getUserWallet(userId);

      if (!user.isActive || user.isBanned) {
        return null; // Skip maintenance fee for inactive/banned users
      }

      const maintenanceFee = parseFloat(process.env.MAINTENANCE_FEE) || 100;
      const lastCharge = wallet.lastMaintenanceFee;
      const now = new Date();

      // Check if maintenance fee is due (monthly)
      if (lastCharge) {
        const nextDue = new Date(lastCharge);
        nextDue.setMonth(nextDue.getMonth() + 1);
        
        if (now < nextDue) {
          return null; // Not due yet
        }
      }

      // Check if wallet has sufficient balance
      if (parseFloat(wallet.balance) < maintenanceFee) {
        logger.warn('Insufficient balance for maintenance fee', {
          userId,
          balance: wallet.balance,
          fee: maintenanceFee
        });
        return null; // Skip if insufficient balance
      }

      // Charge maintenance fee
      const result = await this.debitWallet(
        userId,
        maintenanceFee,
        'Monthly maintenance fee',
        {
          category: 'fee_charge',
          feeType: 'maintenance'
        }
      );

      // Update last maintenance fee date
      await wallet.update({ lastMaintenanceFee: now });

      // Send notification
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `📋 *Maintenance Fee Charged*\n\n` +
        `Amount: ₦${maintenanceFee.toLocaleString()}\n` +
        `New Balance: ₦${result.newBalance.toLocaleString()}\n\n` +
        `This is your monthly account maintenance fee.`
      );

      logger.info('Maintenance fee charged', {
        userId,
        fee: maintenanceFee,
        newBalance: result.newBalance
      });

      return result;
    } catch (error) {
      logger.error('Failed to charge maintenance fee', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  generateReference() {
    return `MII_${Date.now()}_${uuidv4().slice(0, 8).toUpperCase()}`;
  }

  async getWalletBalance(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      return {
        available: parseFloat(wallet.availableBalance),
        total: parseFloat(wallet.balance),
        ledger: parseFloat(wallet.ledgerBalance),
        pending: parseFloat(wallet.pendingBalance),
        currency: wallet.currency
      };
    } catch (error) {
      logger.error('Failed to get wallet balance', { error: error.message, userId });
      throw error;
    }
  }

  async getWalletTransactions(userId, limit = 10, offset = 0) {
    try {
      const transactions = await Transaction.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      return transactions;
    } catch (error) {
      logger.error('Failed to get wallet transactions', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  async updateTransactionMetadata(userId, requestId, metadata) {
    try {
      // Find the transaction by user ID and metadata containing the requestId
      const transaction = await Transaction.findOne({
        where: {
          userId,
          metadata: {
            requestId: requestId
          }
        },
        order: [['createdAt', 'DESC']]
      });

      if (!transaction) {
        logger.warn('Transaction not found for metadata update', {
          userId,
          requestId
        });
        return null;
      }

      // Update metadata by merging with existing metadata
      const updatedMetadata = {
        ...transaction.metadata,
        ...metadata,
        updatedAt: new Date().toISOString()
      };

      await transaction.update({
        metadata: updatedMetadata
      });

      logger.info('Transaction metadata updated', {
        userId,
        requestId,
        transactionId: transaction.id,
        updatedFields: Object.keys(metadata)
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to update transaction metadata', {
        error: error.message,
        userId,
        requestId,
        metadata
      });
      throw error;
    }
  }

  // Get comprehensive wallet details
  async getWalletDetails(userId) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const wallet = await this.getUserWallet(userId);
      const limits = await this.getTransactionLimits(userId);
      const recentTransactions = await this.getWalletTransactions(userId, 3);

      return {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          whatsappNumber: user.whatsappNumber,
          accountNumber: wallet.virtualAccountNumber || user.accountNumber || this.generateAccountNumber(user.id),
          accountName: wallet.virtualAccountName || `${user.firstName} ${user.lastName || ''}`.trim(),
          bankName: wallet.virtualAccountBank || 'BellBank'
        },
        wallet: {
          balance: parseFloat(wallet.balance),
          currency: wallet.currency,
          status: wallet.status,
          lastUpdated: wallet.updatedAt
        },
        limits: {
          daily: limits.daily,
          monthly: limits.monthly,
          single: limits.single,
          dailyUsed: limits.dailyUsed,
          monthlyUsed: limits.monthlyUsed
        },
        recentTransactions: recentTransactions.map(tx => ({
          type: tx.type,
          amount: parseFloat(tx.amount),
          description: tx.description,
          status: tx.status,
          date: tx.createdAt
        }))
      };
    } catch (error) {
      logger.error('Failed to get wallet details', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  // Generate account number for user
  generateAccountNumber(userId) {
    // Generate a 10-digit account number based on user ID
    const hash = require('crypto').createHash('md5').update(userId).digest('hex');
    const numericHash = parseInt(hash.substring(0, 8), 16);
    return (numericHash % 9000000000 + 1000000000).toString();
  }

  // Get transaction limits for user
  async getTransactionLimits(userId) {
    try {
      // Get user's transaction history for today and this month
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const todayTransactions = await Transaction.findAll({
        where: {
          userId,
          createdAt: {
            [Op.gte]: today
          },
          type: 'debit'
        }
      });

      const monthTransactions = await Transaction.findAll({
        where: {
          userId,
          createdAt: {
            [Op.gte]: firstDayOfMonth
          },
          type: 'debit'
        }
      });

      const dailyUsed = todayTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
      const monthlyUsed = monthTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

      return {
        daily: 5000000, // 5 million naira daily limit
        monthly: 50000000, // 50 million naira monthly limit
        single: 1000000, // 1 million naira single transaction limit
        dailyUsed,
        monthlyUsed,
        dailyRemaining: 5000000 - dailyUsed,
        monthlyRemaining: 50000000 - monthlyUsed
      };
    } catch (error) {
      logger.error('Failed to get transaction limits', {
        error: error.message,
        userId
      });
      
      // Return default limits
      return {
        daily: 5000000,
        monthly: 50000000,
        single: 1000000,
        dailyUsed: 0,
        monthlyUsed: 0,
        dailyRemaining: 5000000,
        monthlyRemaining: 50000000
      };
    }
  }
}

module.exports = new WalletService();
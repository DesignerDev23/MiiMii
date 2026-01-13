const { supabase } = require('../database/connection');
const rubiesService = require('./rubies');
const rubiesWalletService = require('./rubiesWalletService');
const logger = require('../utils/logger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { v4: uuidv4 } = require('uuid');
const activityLogger = require('./activityLogger');
// Note: userService is loaded lazily to avoid circular dependency

class WalletService {
  async createWallet(userId) {
    try {
      // Check if wallet already exists using Supabase
      const existingWallet = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('wallets', { userId });
      });
      
      if (existingWallet) {
        return existingWallet;
      }

      // Create wallet using Supabase
      const walletData = {
        id: uuidv4(),
        userId,
        balance: 0.00,
        ledgerBalance: 0.00,
        currency: 'NGN',
        availableBalance: 0.00,
        previousBalance: 0.00,
        totalCredits: 0.00,
        totalDebits: 0.00,
        isActive: true
      };

      const wallet = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('wallets', walletData);
      });

      // Get user for virtual account creation
      const user = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('users', userId);
      });
      
      // Only create Rubies wallet if user has completed onboarding
      if (user && user.onboardingStep === 'completed' && user.firstName && user.lastName && user.bvn && user.gender && user.dateOfBirth) {
        try {
          const rubiesWallet = await rubiesWalletService.createRubiesWallet(userId);
          
          if (rubiesWallet.success) {
            await databaseService.executeWithRetry(async () => {
              return await supabaseHelper.update('wallets', {
                rubiesAccountNumber: rubiesWallet.accountNumber,
                rubiesCustomerId: rubiesWallet.customerId,
                rubiesWalletStatus: 'ACTIVE'
              }, { id: wallet.id });
            });
            
            wallet.rubiesAccountNumber = rubiesWallet.accountNumber;
            wallet.rubiesCustomerId = rubiesWallet.customerId;
            wallet.rubiesWalletStatus = 'ACTIVE';
            
            logger.info('Rubies wallet created successfully', {
              userId,
              accountNumber: rubiesWallet.accountNumber,
              customerId: rubiesWallet.customerId
            });
          } else {
            logger.warn('Failed to create Rubies wallet', {
              error: rubiesWallet.error,
              userId
            });
          }
        } catch (error) {
          logger.warn('Failed to create Rubies wallet during wallet creation', {
            error: error.message,
            userId
          });
          // Continue without Rubies wallet - can be created later
        }
      } else {
        logger.info('Skipping Rubies wallet creation - user not fully onboarded', {
          userId,
          onboardingStep: user?.onboardingStep,
          hasFirstName: !!user?.firstName,
          hasLastName: !!user?.lastName,
          hasBvn: !!user?.bvn,
          hasGender: !!user?.gender,
          hasDateOfBirth: !!user?.dateOfBirth
        });
      }
      
      logger.info('Wallet created successfully', {
        userId,
        walletId: wallet.id,
        hasRubiesWallet: !!wallet.rubiesAccountNumber
      });

      return wallet;
    } catch (error) {
      logger.error('Failed to create wallet', { error: error.message, userId });
      throw error;
    }
  }

  async getUserWallet(userId) {
    try {
      let wallet = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('wallets', { userId });
      });
      
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
    try {
      const wallet = await this.getUserWallet(userId);
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const user = await userService.getUserById(userId);

      if (!wallet.isActive) {
        throw new Error('Wallet is inactive');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const creditAmount = parseFloat(amount);
      const balanceAfter = balanceBefore + creditAmount;
      const reference = this.generateReference();

      // Create transaction record using Supabase
      const txnRecord = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('transactions', {
          id: uuidv4(),
          reference,
          userId,
          type: 'credit',
          category: metadata.category || 'wallet_funding',
          amount: creditAmount,
          fee: 0,
          totalAmount: creditAmount,
          status: 'completed',
          description,
          metadata: {
            ...metadata,
            balanceBefore,
            balanceAfter,
            processedAt: new Date().toISOString() // Store in metadata since column doesn't exist
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      // Update wallet balance using Supabase
      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('wallets')
          .update({
            previousBalance: balanceBefore,
            balance: balanceAfter,
            availableBalance: parseFloat(wallet.availableBalance || 0) + creditAmount,
            ledgerBalance: balanceAfter,
            totalCredits: parseFloat(wallet.totalCredits || 0) + creditAmount,
            updatedAt: new Date().toISOString()
          })
          .eq('id', wallet.id);
        
        if (error) throw error;
      });

      logger.info('Wallet credited successfully', {
        userId,
        amount: creditAmount,
        reference: txnRecord.reference,
        newBalance: balanceAfter
      });

      // Sync balance with Rubies after credit transaction
      try {
        await this.syncBalanceWithRubies(userId);
      } catch (syncError) {
        logger.warn('Failed to sync balance with Rubies after credit', {
          userId,
          error: syncError.message
        });
        // Don't throw - transaction is already successful
      }

      // Create mobile app notification for incoming transfers/wallet funding
      try {
        const notificationService = require('./notificationService');
        await notificationService.createTransactionNotification(userId, txnRecord, 'credit');
      } catch (notifyError) {
        logger.warn('Failed to create credit notification', {
          userId,
          error: notifyError.message
        });
      }

      // Optional WhatsApp notification (for admin credits or when explicitly requested)
      try {
        if (metadata && (metadata.notify === true || metadata.adminCredit === true)) {
          const whatsappService = require('./whatsapp');
          const amountStr = `₦${creditAmount.toLocaleString()}`;
          const balanceStr = `₦${balanceAfter.toLocaleString()}`;
          const note = description ? `\n• Note: ${description}` : '';
          const by = metadata.creditedBy ? `\n• Credited By: ${metadata.creditedBy}` : '';
          const message = `💳 *Wallet Credited*\n\n` +
            `You just received ${amountStr} in your MiiMii wallet.\n\n` +
            `• Reference: ${txnRecord.reference}${note}${by}\n` +
            `• New Balance: ${balanceStr}\n\n` +
            `Thanks for using MiiMii!`;
          await whatsappService.sendTextMessage(user.whatsappNumber, message);
        }
      } catch (notifyError) {
        logger.warn('Failed to send credit notification', {
          userId,
          error: notifyError.message
        });
      }

      return {
        transaction: txnRecord,
        newBalance: balanceAfter,
        previousBalance: balanceBefore
      };
    } catch (error) {
      logger.error('Failed to credit wallet', { error: error.message, userId, amount });
      throw error;
    }
  }

  async debitWallet(userId, amount, description, metadata = {}) {
    try {
      const wallet = await this.getUserWallet(userId);
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const user = await userService.getUserById(userId);

      if (!wallet.isActive) {
        throw new Error('Wallet is inactive');
      }

      if (wallet.isFrozen) {
        throw new Error('Wallet is frozen');
      }

      const balanceBefore = parseFloat(wallet.balance);
      const debitAmount = parseFloat(amount);
      
      // For general debits we require sufficient funds, but allow negative for maintenance fee
      const isMaintenanceFee = metadata && (metadata.feeType === 'maintenance' || metadata.category === 'maintenance_fee' || description?.toLowerCase().includes('maintenance'));
      if (!isMaintenanceFee && balanceBefore < debitAmount) {
        throw new Error('Insufficient balance');
      }

      const balanceAfter = balanceBefore - debitAmount;
      const reference = this.generateReference();

      // Create transaction record using Supabase
      const txnRecord = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('transactions', {
          id: uuidv4(),
          reference,
          userId,
          type: 'debit',
          category: metadata.category || 'wallet_transfer',
          amount: debitAmount,
          fee: metadata.fee || 0,
          totalAmount: debitAmount + (metadata.fee || 0),
          status: 'completed',
          description,
          metadata: {
            ...metadata,
            balanceBefore,
            balanceAfter,
            processedAt: new Date().toISOString() // Store in metadata since column doesn't exist
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      // Update wallet balance using Supabase
      const newAvailable = Math.max(0, parseFloat(wallet.availableBalance || 0) - debitAmount);
      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('wallets')
          .update({
            previousBalance: balanceBefore,
            balance: balanceAfter,
            availableBalance: newAvailable,
            ledgerBalance: balanceAfter,
            totalDebits: parseFloat(wallet.totalDebits || 0) + debitAmount,
            updatedAt: new Date().toISOString()
          })
          .eq('id', wallet.id);
        
        if (error) throw error;
      });

      logger.info('Wallet debited successfully', {
        userId,
        amount: debitAmount,
        reference: txnRecord.reference,
        newBalance: balanceAfter
      });

      // Sync balance with Rubies after debit transaction
      try {
        await this.syncBalanceWithRubies(userId);
      } catch (syncError) {
        logger.warn('Failed to sync balance with Rubies after debit', {
          userId,
          error: syncError.message
        });
        // Don't throw - transaction is already successful
      }

      return {
        transaction: txnRecord,
        newBalance: balanceAfter,
        previousBalance: balanceBefore
      };
    } catch (error) {
      logger.error('Failed to debit wallet', { error: error.message, userId, amount });
      throw error;
    }
  }

  async transferBetweenWallets(fromUserId, toUserId, amount, description = 'Wallet transfer') {
    try {
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const fromUser = await userService.getUserById(fromUserId);
      const toUser = await userService.getUserById(toUserId);

      if (!fromUser || !toUser) {
        throw new Error('User not found');
      }

      // Check if user can perform transactions (basic checks)
      if (!fromUser.isActive || fromUser.isBanned) {
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

      logger.info('Wallet to wallet transfer completed', {
        fromUserId,
        toUserId,
        amount: transferAmount,
        reference
      });

      // Sync both wallets with Rubies after transfer
      try {
        await Promise.all([
          this.syncBalanceWithRubies(fromUserId),
          this.syncBalanceWithRubies(toUserId)
        ]);
      } catch (syncError) {
        logger.warn('Failed to sync balances with Rubies after wallet transfer', {
          error: syncError.message,
          fromUserId,
          toUserId
        });
        // Don't throw - transfer is already successful
      }

      return {
        reference,
        amount: transferAmount,
        sender: fromUser.whatsappNumber,
        recipient: toUser.whatsappNumber
      };
    } catch (error) {
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
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const user = await userService.getUserById(customer_id);
      if (!user) {
        throw new Error('User not found for virtual account credit');
      }

      // No fees for incoming transfers - users should receive the full amount
      const creditAmount = parseFloat(amount);
      const finalAmount = creditAmount; // No fee deduction for incoming transfers
      const fee = 0; // No fees for incoming transfers

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
        `🌟 *You've got an incoming transfer!*\n\n` +
        `Amount: ₦${finalAmount.toLocaleString()}\n` +
        `From: ${sender_name}\n` +
        `Bank: ${sender_bank}\n` +
        `New Balance: ₦${result.newBalance.toLocaleString()}\n\n` +
        `Reference: ${result.transaction.reference}`
      );

      logger.info('Virtual account credit processed', {
        userId: user.id,
        originalAmount: creditAmount,
        finalAmount,
        fee,
        reference
      });

      // Sync balance with Rubies after webhook credit (creditWallet already syncs, but double-check)
      try {
        await this.syncBalanceWithRubies(user.id);
      } catch (syncError) {
        logger.warn('Failed to sync balance with Rubies after webhook credit', {
          userId: user.id,
          error: syncError.message
        });
        // Don't throw - transaction is already successful
      }

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
      
      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('wallets')
          .update({
            isFrozen: true,
            frozenAt: new Date().toISOString(),
            freezeReason: reason,
            metadata: {
              ...(wallet.metadata || {}),
              frozenAt: new Date().toISOString(),
              freezeReason: reason
            },
            updatedAt: new Date().toISOString()
          })
          .eq('id', wallet.id);
        
        if (error) throw error;
      });

      logger.info('Wallet frozen', { userId, reason });
      
      // Return updated wallet
      return await this.getUserWallet(userId);
    } catch (error) {
      logger.error('Failed to freeze wallet', { error: error.message, userId });
      throw error;
    }
  }

  async unfreezeWallet(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('wallets')
          .update({
            isFrozen: false,
            frozenAt: null,
            freezeReason: null,
            metadata: {
              ...(wallet.metadata || {}),
              unfrozenAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
          })
          .eq('id', wallet.id);
        
        if (error) throw error;
      });

      logger.info('Wallet unfrozen', { userId });
      
      // Return updated wallet
      return await this.getUserWallet(userId);
    } catch (error) {
      logger.error('Failed to unfreeze wallet', { error: error.message, userId });
      throw error;
    }
  }

  async createVirtualAccountForWallet(userId) {
    try {
      // Get user using Supabase
      const user = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('users', userId);
      });
      
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

      // Check for duplicate account numbers across all wallets using Supabase
      const { data: existingWallets, error: findError } = await supabase
        .from('wallets')
        .select('*')
        .not('virtualAccountNumber', 'is', null)
        .neq('userId', userId)
        .limit(1);
      
      if (findError) {
        logger.warn('Error checking for duplicate account numbers', { error: findError.message });
      }

      if (existingWallets && existingWallets.length > 0) {
        const existingWallet = existingWallets[0];
        logger.warn('Potential duplicate account number detected', {
          userId,
          existingAccountNumber: existingWallet.virtualAccountNumber,
          existingUserId: existingWallet.userId
        });
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

      const rubiesWalletResult = await rubiesWalletService.createRubiesWallet(userId);
      
      if (!rubiesWalletResult.success) {
        logger.error('Rubies wallet creation failed', {
          userId,
          error: rubiesWalletResult.error,
          message: rubiesWalletResult.message
        });
        throw new Error(rubiesWalletResult.message || 'Failed to create Rubies wallet');
      }

      // Check for duplicate account numbers after creation using Supabase
      const { data: duplicateWallets, error: duplicateError } = await supabase
        .from('wallets')
        .select('*')
        .eq('virtualAccountNumber', rubiesWalletResult.accountNumber)
        .neq('userId', userId)
        .limit(1);
      
      if (duplicateError) {
        logger.warn('Error checking for duplicate account numbers after creation', { error: duplicateError.message });
      }

      if (duplicateWallets && duplicateWallets.length > 0) {
        const duplicateWallet = duplicateWallets[0];
        logger.error('Duplicate Rubies account number detected after creation', {
          userId,
          accountNumber: rubiesWalletResult.accountNumber,
          duplicateUserId: duplicateWallet.userId,
          duplicateWalletId: duplicateWallet.id
        });
        throw new Error('Rubies account number already exists for another user. Please contact support.');
      }
      
      // Update wallet using Supabase
      await databaseService.executeWithRetry(async () => {
        const { error: updateError } = await supabase
          .from('wallets')
          .update({
            virtualAccountNumber: rubiesWalletResult.accountNumber,
            virtualAccountBank: 'Rubies MFB',
            virtualAccountName: `${user.firstName} ${user.lastName}`,
            accountReference: rubiesWalletResult.customerId,
            updatedAt: new Date().toISOString()
          })
          .eq('id', wallet.id);
        
        if (updateError) throw updateError;
      });

      // Mark user onboarding as completed since Rubies wallet is created using Supabase
      await databaseService.executeWithRetry(async () => {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            onboardingStep: 'completed',
            updatedAt: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (updateError) throw updateError;
      });

      logger.info('Rubies wallet created successfully for wallet', {
        userId,
        accountNumber: rubiesWalletResult.accountNumber,
        customerId: rubiesWalletResult.customerId,
        onboardingStep: 'completed'
      });

      return {
        success: true,
        accountNumber: rubiesWalletResult.accountNumber,
        customerId: rubiesWalletResult.customerId,
        message: 'Rubies wallet created successfully'
      };
    } catch (error) {
      // Handle specific Rubies API errors
      const isRubiesError = error.message && (
        error.message.includes('504') || 
        error.message.includes('Gateway time-out') ||
        error.message.includes('Rubies') ||
        error.message.includes('HTTP 5') ||
        error.message.includes('Account parent does not belong to this user')
      );

      if (isRubiesError) {
        logger.error('Rubies API error during wallet creation', {
          userId,
          error: error.message,
          errorType: 'rubies_api_error',
          stack: error.stack
        });

        // Log activity for Rubies API failure
        try {
          await activityLogger.logUserActivity(
            userId,
            'wallet_funding',
            'rubies_wallet_creation_error',
            {
              description: 'Rubies wallet creation failed due to Rubies API error',
              provider: 'rubies',
              success: false,
              error: error.message,
              errorType: 'rubies_api_error',
              source: 'api'
            }
          );
        } catch (logError) {
          logger.error('Failed to log Rubies error activity', { userId, logError: logError.message });
        }

        // Return a structured error that can be handled by the calling service
        const rubiesError = new Error(`Rubies API temporarily unavailable: ${error.message}`);
        rubiesError.name = 'RubiesAPIError';
        rubiesError.isRetryable = true;
        rubiesError.originalError = error;
        throw rubiesError;
      }

      // Handle other errors
      logger.error('Failed to create Rubies wallet for wallet', {
        error: error.message,
        userId,
        errorType: 'general_error',
        stack: error.stack
      });

      // Log activity for general failure
      try {
        await activityLogger.logUserActivity(
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
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const user = await userService.getUserById(userId);
      const wallet = await this.getUserWallet(userId);

      if (!user.isActive || user.isBanned) {
        return null; // Skip maintenance fee for inactive/banned users
      }

      const maintenanceFee = 50; // Fixed ₦50 per requirements
      const lastCharge = wallet.lastMaintenanceFee ? new Date(wallet.lastMaintenanceFee) : new Date(user.createdAt); // start counting from onboarding
      const now = new Date();

      // Determine months due since last charge
      const monthsDue = (now.getFullYear() - lastCharge.getFullYear()) * 12 + (now.getMonth() - lastCharge.getMonth());
      if (monthsDue < 1) {
        return null; // Not due yet
      }

      // Total fee for all missed months
      const totalFee = maintenanceFee * monthsDue;
      const result = await this.debitWallet(userId, totalFee, `Monthly maintenance fee (${monthsDue} month${monthsDue>1?'s':''})`, {
        category: 'maintenance_fee',
        feeType: 'maintenance',
        monthsDue
      });

      // Update last maintenance fee date
      await wallet.update({ lastMaintenanceFee: now });

      // Send notification
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `📋 *Maintenance Fee Charged*\n\n` +
        `Amount: ₦${totalFee.toLocaleString()} (${monthsDue} month${monthsDue>1?'s':''})\n` +
        `New Balance: ₦${result.newBalance.toLocaleString()}\n\n` +
        `Your monthly maintenance fee of ₦50 has been applied. If your balance is negative, the fee will be deducted when you fund your wallet.`
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

  // Check maintenance fee status for admin
  async getMaintenanceFeeStatus(userId) {
    try {
      // Lazy load to avoid circular dependency
      const userService = require('./user');
      const user = await userService.getUserById(userId);
      const wallet = await this.getUserWallet(userId);

      if (!user || !user.isActive || user.isBanned) {
        return {
          isDue: false,
          status: 'inactive_user',
          message: 'User is inactive or banned'
        };
      }

      const maintenanceFee = 50; // Fixed ₦50 per requirements
      const lastCharge = wallet.lastMaintenanceFee ? new Date(wallet.lastMaintenanceFee) : new Date(user.createdAt);
      const now = new Date();

      // Check if current month's fee has been paid
      const currentMonth = now.getFullYear() * 12 + now.getMonth();
      const lastChargeMonth = lastCharge.getFullYear() * 12 + lastCharge.getMonth();

      const isCurrentMonthPaid = currentMonth === lastChargeMonth;
      const monthsOverdue = currentMonth - lastChargeMonth;

      if (isCurrentMonthPaid) {
        return {
          isDue: false,
          status: 'paid',
          message: 'Current month maintenance fee is paid',
          lastPaidDate: lastCharge,
          nextDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        };
      } else if (monthsOverdue > 0) {
        const totalOverdue = maintenanceFee * monthsOverdue;
        return {
          isDue: true,
          status: 'overdue',
          message: `${monthsOverdue} month(s) overdue`,
          monthsOverdue,
          totalOverdue,
          lastPaidDate: lastCharge,
          nextDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        };
      }

      return {
        isDue: false,
        status: 'up_to_date',
        message: 'Maintenance fee is up to date',
        lastPaidDate: lastCharge,
        nextDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1)
      };
    } catch (error) {
      logger.error('Failed to get maintenance fee status', {
        error: error.message,
        userId
      });
      return {
        isDue: false,
        status: 'error',
        message: 'Failed to check maintenance fee status'
      };
    }
  }

  generateReference() {
    return `MII_${Date.now()}_${uuidv4().slice(0, 8).toUpperCase()}`;
  }

  // Helper method to sync balance with Rubies and update database
  async syncBalanceWithRubies(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      if (!wallet || !wallet.virtualAccountNumber || wallet.virtualAccountBank !== 'Rubies MFB') {
        return; // No Rubies account to sync
      }

      const rubiesBalance = await rubiesService.retrieveWalletDetails(wallet.virtualAccountNumber);
      
      if (rubiesBalance.success) {
        const rubiesBalanceAmount = parseFloat(rubiesBalance.accountBalance || 0);
        const rubiesLedgerBalance = parseFloat(rubiesBalance.accountLedgerBalance || 0);
        const currentBalance = parseFloat(wallet.balance || 0);
        
        // Update local wallet balance to match Rubies balance if different
        if (Math.abs(currentBalance - rubiesBalanceAmount) > 0.01) { // Allow small floating point differences
          logger.info('Syncing wallet balance with Rubies after transaction', {
            userId,
            oldBalance: currentBalance,
            newBalance: rubiesBalanceAmount,
            difference: rubiesBalanceAmount - currentBalance,
            virtualAccountNumber: wallet.virtualAccountNumber
          });
          
          await databaseService.executeWithRetry(async () => {
            return await supabaseHelper.update('wallets', {
              balance: rubiesBalanceAmount,
              ledgerBalance: rubiesLedgerBalance,
              availableBalance: rubiesBalanceAmount,
              updatedAt: new Date().toISOString()
            }, { id: wallet.id });
          });
          
          logger.info('Wallet balance synced with Rubies successfully', {
            userId,
            newBalance: rubiesBalanceAmount,
            virtualAccountNumber: wallet.virtualAccountNumber
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to sync balance with Rubies', {
        error: error.message,
        userId
      });
      // Don't throw - this is a background sync operation
    }
  }

  async getWalletBalance(userId, syncWithRubies = true) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      // If user has a Rubies virtual account, sync balance from Rubies
      if (syncWithRubies && wallet.virtualAccountNumber && wallet.virtualAccountBank === 'Rubies MFB') {
        try {
          const rubiesBalance = await rubiesService.retrieveWalletDetails(wallet.virtualAccountNumber);
          
          if (rubiesBalance.success) {
            const rubiesBalanceAmount = rubiesBalance.accountBalance || 0;
            const rubiesLedgerBalance = rubiesBalance.accountLedgerBalance || 0;
            
            // Update local wallet balance to match Rubies balance
            if (parseFloat(wallet.balance) !== rubiesBalanceAmount) {
              logger.info('Syncing wallet balance with Rubies', {
                userId,
                oldBalance: wallet.balance,
                newBalance: rubiesBalanceAmount,
                virtualAccountNumber: wallet.virtualAccountNumber
              });
              
              await databaseService.executeWithRetry(async () => {
                return await supabaseHelper.update('wallets', {
                  balance: rubiesBalanceAmount,
                  ledgerBalance: rubiesLedgerBalance,
                  availableBalance: rubiesBalanceAmount,
                  updatedAt: new Date().toISOString()
                }, { id: wallet.id });
              });
              
              // Update wallet object
              wallet.balance = rubiesBalanceAmount;
              wallet.ledgerBalance = rubiesLedgerBalance;
              wallet.availableBalance = rubiesBalanceAmount;
            }
          }
        } catch (rubiesError) {
          logger.warn('Failed to sync balance with Rubies, using local balance', {
            error: rubiesError.message,
            userId,
            virtualAccountNumber: wallet.virtualAccountNumber
          });
          // Continue with local balance if Rubies sync fails
        }
      }
      
      return {
        available: parseFloat(wallet.availableBalance || wallet.balance || 0),
        total: parseFloat(wallet.balance || 0),
        ledger: parseFloat(wallet.ledgerBalance || wallet.balance || 0),
        pending: parseFloat(wallet.pendingBalance || 0),
        currency: wallet.currency || 'NGN'
      };
    } catch (error) {
      logger.error('Failed to get wallet balance', { error: error.message, userId });
      throw error;
    }
  }

  async getWalletTransactions(userId, limit = 10, offset = 0) {
    try {
      const transactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', { userId }, {
          orderBy: 'createdAt',
          order: 'desc',
          limit,
          offset
        });
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
      const allTransactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', { userId }, {
          orderBy: 'createdAt',
          order: 'desc'
        });
      });
      
      // Filter by requestId in metadata
      const transaction = allTransactions.find(tx => tx.metadata?.requestId === requestId);

      if (!transaction) {
        logger.warn('Transaction not found for metadata update', {
          userId,
          requestId
        });
        return null;
      }

      // Update metadata by merging with existing metadata
      const updatedMetadata = {
        ...(transaction.metadata || {}),
        ...metadata,
        updatedAt: new Date().toISOString()
      };

      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('transactions')
          .update({
            metadata: updatedMetadata,
            updatedAt: new Date().toISOString()
          })
          .eq('id', transaction.id);
        
        if (error) throw error;
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
      // Lazy load to avoid circular dependency
      const userService = require('./user');
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
      
      // Get all debit transactions and filter by date
      const allDebitTransactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', {
          userId,
          type: 'debit'
        });
      });
      
      const todayTransactions = allDebitTransactions.filter(tx => {
        const txDate = new Date(tx.createdAt);
        return txDate >= today;
      });

      const monthTransactions = allDebitTransactions.filter(tx => {
        const txDate = new Date(tx.createdAt);
        return txDate >= firstDayOfMonth;
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

  // Sync wallet balance with Rubies
  async syncWalletBalanceWithRubies(userId) {
    try {
      const wallet = await this.getUserWallet(userId);
      
      if (!wallet.rubiesAccountNumber) {
        throw new Error('No Rubies wallet found for user');
      }

      const syncResult = await rubiesWalletService.syncWalletBalance(userId);
      
      if (syncResult.success) {
        logger.info('Wallet balance synced with Rubies', {
          userId,
          balance: syncResult.balance,
          ledgerBalance: syncResult.ledgerBalance
        });

        return {
          success: true,
          balance: syncResult.balance,
          ledgerBalance: syncResult.ledgerBalance,
          message: 'Wallet balance synced successfully'
        };
      } else {
        throw new Error(syncResult.error || 'Failed to sync wallet balance');
      }
    } catch (error) {
      logger.error('Failed to sync wallet balance with Rubies', {
        userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to sync wallet balance'
      };
    }
  }

  // Check if user has Rubies wallet
  async hasRubiesWallet(userId) {
    try {
      return await rubiesWalletService.hasRubiesWallet(userId);
    } catch (error) {
      logger.error('Failed to check Rubies wallet status', {
        userId,
        error: error.message
      });
      return false;
    }
  }

  // Get Rubies wallet status
  async getRubiesWalletStatus(userId) {
    try {
      return await rubiesWalletService.getRubiesWalletStatus(userId);
    } catch (error) {
      logger.error('Failed to get Rubies wallet status', {
        userId,
        error: error.message
      });

      return {
        hasWallet: false,
        status: 'ERROR',
        message: 'Failed to check wallet status'
      };
    }
  }
}

module.exports = new WalletService();
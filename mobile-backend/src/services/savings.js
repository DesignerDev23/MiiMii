const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');

class SavingsService {
  constructor() {
    // Savings account configuration
    this.savingsConfig = {
      types: {
        FLEXIBLE: 'flexible',
        FIXED: 'fixed',
        TARGET: 'target'
      },
      interestRates: {
        flexible: 8.0, // 8% per annum
        fixed: {
          '3_months': 10.0, // 10% per annum
          '6_months': 12.0, // 12% per annum
          '12_months': 15.0 // 15% per annum
        },
        target: 12.0 // 12% per annum
      },
      limits: {
        minimum: 1000, // ₦1,000
        maximum: 10000000, // ₦10,000,000
        dailyWithdrawalLimit: 100000 // ₦100,000 for flexible savings
      },
      penalties: {
        earlyWithdrawal: 0.02, // 2% penalty for early withdrawal from fixed
        targetMissed: 0.01 // 1% penalty for missing target savings
      },
      fees: {
        creation: 0, // Free account creation
        maintenance: 0, // No maintenance fee
        withdrawal: 25 // ₦25 withdrawal fee
      }
    };

    // Account statuses
    this.accountStatuses = {
      ACTIVE: 'active',
      SUSPENDED: 'suspended',
      MATURED: 'matured',
      CLOSED: 'closed'
    };
  }

  // Create savings account
  async createSavingsAccount(userId, accountData, pin) {
    try {
      const { 
        accountType = 'flexible', 
        targetAmount = null, 
        duration = null, 
        initialDeposit = 0, 
        accountName,
        savingsGoal = null 
      } = accountData;

      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Check if user can create savings accounts
      if (!user.canPerformTransactions()) {
        throw new Error('KYC verification required to create savings accounts');
      }

      // Validate initial deposit
      const depositAmount = parseFloat(initialDeposit || 0);
      if (depositAmount > 0 && depositAmount < this.savingsConfig.limits.minimum) {
        throw new Error(`Minimum initial deposit is ₦${this.savingsConfig.limits.minimum.toLocaleString()}`);
      }

      // Check wallet balance for initial deposit
      if (depositAmount > 0) {
        const walletBalance = await walletService.getWalletBalance(userId);
        if (walletBalance < depositAmount) {
          throw new Error('Insufficient wallet balance for initial deposit');
        }
      }

      // Validate account type specific requirements
      let interestRate;
      let maturityDate = null;

      switch (accountType) {
        case 'flexible':
          interestRate = this.savingsConfig.interestRates.flexible;
          break;
        case 'fixed':
          if (!duration || !['3_months', '6_months', '12_months'].includes(duration)) {
            throw new Error('Valid duration required for fixed savings (3_months, 6_months, 12_months)');
          }
          interestRate = this.savingsConfig.interestRates.fixed[duration];
          maturityDate = this.calculateMaturityDate(duration);
          break;
        case 'target':
          if (!targetAmount || parseFloat(targetAmount) < this.savingsConfig.limits.minimum) {
            throw new Error('Valid target amount required for target savings');
          }
          interestRate = this.savingsConfig.interestRates.target;
          break;
        default:
          throw new Error('Invalid account type');
      }

      // Check user's existing accounts limit (max 5 active savings accounts)
      const { SavingsAccount } = require('../models');
      const activeAccounts = await SavingsAccount.count({
        where: {
          userId,
          status: 'active'
        }
      });

      if (activeAccounts >= 5) {
        throw new Error('Maximum of 5 active savings accounts allowed per user');
      }

      // Generate account number
      const accountNumber = this.generateAccountNumber();

      // Create savings account
      const savingsAccount = await SavingsAccount.create({
        userId,
        accountNumber,
        accountName: accountName || `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} Savings`,
        accountType,
        balance: depositAmount,
        targetAmount: targetAmount ? parseFloat(targetAmount) : null,
        interestRate,
        duration,
        maturityDate,
        status: this.accountStatuses.ACTIVE,
        savingsGoal,
        metadata: {
          createdDate: new Date(),
          totalDeposits: depositAmount,
          totalWithdrawals: 0,
          interestEarned: 0,
          lastInterestCalculation: new Date(),
          transactionCount: depositAmount > 0 ? 1 : 0
        }
      });

      // Process initial deposit if any
      if (depositAmount > 0) {
        // Debit main wallet
        await walletService.debitWallet(userId, depositAmount, 
          `Initial deposit to ${accountName || 'savings account'}`, {
          category: 'savings_deposit',
          savingsAccountId: savingsAccount.id
        });

        // Create transaction record
        await transactionService.createTransaction(userId, {
          type: 'debit',
          category: 'savings_deposit',
          amount: depositAmount,
          fee: 0,
          totalAmount: depositAmount,
          description: `Initial deposit to savings account`,
          reference: `SAV_DEP_${Date.now()}`,
          metadata: {
            service: 'savings',
            action: 'deposit',
            savingsAccountId: savingsAccount.id,
            accountNumber: savingsAccount.accountNumber
          }
        });
      }

      logger.info('Savings account created successfully', {
        userId,
        accountId: savingsAccount.id,
        accountType,
        initialDeposit: depositAmount
      });

      return {
        success: true,
        account: {
          id: savingsAccount.id,
          accountNumber: savingsAccount.accountNumber,
          accountName: savingsAccount.accountName,
          accountType: savingsAccount.accountType,
          balance: parseFloat(savingsAccount.balance),
          targetAmount: savingsAccount.targetAmount ? parseFloat(savingsAccount.targetAmount) : null,
          interestRate: savingsAccount.interestRate,
          duration: savingsAccount.duration,
          maturityDate: savingsAccount.maturityDate,
          status: savingsAccount.status,
          savingsGoal: savingsAccount.savingsGoal,
          createdAt: savingsAccount.createdAt
        }
      };
    } catch (error) {
      logger.error('Savings account creation failed', { error: error.message, userId, accountData });
      throw error;
    }
  }

  // Generate account number
  generateAccountNumber() {
    const prefix = '4'; // Savings account prefix
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return prefix + timestamp + random;
  }

  // Calculate maturity date
  calculateMaturityDate(duration) {
    const now = new Date();
    switch (duration) {
      case '3_months':
        return new Date(now.setMonth(now.getMonth() + 3));
      case '6_months':
        return new Date(now.setMonth(now.getMonth() + 6));
      case '12_months':
        return new Date(now.setFullYear(now.getFullYear() + 1));
      default:
        return null;
    }
  }

  // Get user's savings accounts
  async getUserSavingsAccounts(userId) {
    try {
      const { SavingsAccount } = require('../models');
      
      const accounts = await SavingsAccount.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']]
      });

      return accounts.map(account => ({
        id: account.id,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        accountType: account.accountType,
        balance: parseFloat(account.balance),
        targetAmount: account.targetAmount ? parseFloat(account.targetAmount) : null,
        interestRate: account.interestRate,
        duration: account.duration,
        maturityDate: account.maturityDate,
        status: account.status,
        savingsGoal: account.savingsGoal,
        metadata: account.metadata,
        createdAt: account.createdAt,
        progressPercentage: this.calculateProgress(account)
      }));
    } catch (error) {
      logger.error('Failed to get user savings accounts', { error: error.message, userId });
      throw error;
    }
  }

  // Calculate savings progress
  calculateProgress(account) {
    if (account.accountType === 'target' && account.targetAmount) {
      return Math.min((parseFloat(account.balance) / parseFloat(account.targetAmount)) * 100, 100);
    }
    if (account.accountType === 'fixed' && account.maturityDate) {
      const now = new Date();
      const created = new Date(account.createdAt);
      const maturity = new Date(account.maturityDate);
      const totalDuration = maturity.getTime() - created.getTime();
      const elapsed = now.getTime() - created.getTime();
      return Math.min((elapsed / totalDuration) * 100, 100);
    }
    return 0;
  }

  // Deposit to savings account
  async depositToSavings(userId, accountId, amount, pin) {
    try {
      // Validate user and PIN
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userService.validateUserPin(userId, pin);

      // Get savings account
      const { SavingsAccount } = require('../models');
      const account = await SavingsAccount.findOne({
        where: { id: accountId, userId }
      });

      if (!account) {
        throw new Error('Savings account not found');
      }

      if (account.status !== this.accountStatuses.ACTIVE) {
        throw new Error('Account is not active');
      }

      const depositAmount = parseFloat(amount);
      if (depositAmount < 100) {
        throw new Error('Minimum deposit amount is ₦100');
      }

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < depositAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Update account balance
      const newBalance = parseFloat(account.balance) + depositAmount;
      const updatedMetadata = {
        ...account.metadata,
        totalDeposits: (account.metadata.totalDeposits || 0) + depositAmount,
        transactionCount: (account.metadata.transactionCount || 0) + 1,
        lastTransaction: new Date()
      };

      await account.update({ 
        balance: newBalance,
        metadata: updatedMetadata
      });

      // Debit wallet
      await walletService.debitWallet(userId, depositAmount, 
        `Deposit to ${account.accountName}`, {
        category: 'savings_deposit',
        savingsAccountId: account.id
      });

      // Create transaction record
      await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'savings_deposit',
        amount: depositAmount,
        fee: 0,
        totalAmount: depositAmount,
        description: `Deposit to savings account - ${account.accountName}`,
        reference: `SAV_DEP_${Date.now()}`,
        metadata: {
          service: 'savings',
          action: 'deposit',
          savingsAccountId: account.id,
          accountNumber: account.accountNumber,
          previousBalance: parseFloat(account.balance),
          newBalance: newBalance
        }
      });

      logger.info('Savings deposit completed successfully', {
        userId,
        accountId,
        amount: depositAmount,
        newBalance
      });

      return {
        success: true,
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          previousBalance: parseFloat(account.balance),
          depositAmount,
          newBalance
        }
      };
    } catch (error) {
      logger.error('Savings deposit failed', { error: error.message, userId, accountId, amount });
      throw error;
    }
  }

  // Withdraw from savings account
  async withdrawFromSavings(userId, accountId, amount, pin) {
    try {
      // Validate user and PIN
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userService.validateUserPin(userId, pin);

      // Get savings account
      const { SavingsAccount } = require('../models');
      const account = await SavingsAccount.findOne({
        where: { id: accountId, userId }
      });

      if (!account) {
        throw new Error('Savings account not found');
      }

      if (account.status !== this.accountStatuses.ACTIVE) {
        throw new Error('Account is not active');
      }

      const withdrawalAmount = parseFloat(amount);
      const withdrawalFee = this.savingsConfig.fees.withdrawal;
      let penalty = 0;
      let penaltyReason = null;

      // Check withdrawal rules based on account type
      if (account.accountType === 'fixed') {
        const now = new Date();
        const maturityDate = new Date(account.maturityDate);
        
        if (now < maturityDate) {
          penalty = Math.ceil(withdrawalAmount * this.savingsConfig.penalties.earlyWithdrawal);
          penaltyReason = 'Early withdrawal penalty for fixed savings';
        }
      }

      if (account.accountType === 'flexible') {
        // Check daily withdrawal limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { Transaction } = require('../models');
        const dailyWithdrawals = await Transaction.sum('amount', {
          where: {
            userId,
            category: 'savings_withdrawal',
            'metadata.savingsAccountId': accountId,
            createdAt: {
              [require('sequelize').Op.gte]: today
            }
          }
        });

        if ((dailyWithdrawals || 0) + withdrawalAmount > this.savingsConfig.limits.dailyWithdrawalLimit) {
          throw new Error(`Daily withdrawal limit of ₦${this.savingsConfig.limits.dailyWithdrawalLimit.toLocaleString()} exceeded`);
        }
      }

      const totalDeduction = withdrawalAmount + withdrawalFee + penalty;

      // Check account balance
      if (parseFloat(account.balance) < totalDeduction) {
        throw new Error('Insufficient savings account balance');
      }

      // Update account balance
      const newBalance = parseFloat(account.balance) - totalDeduction;
      const updatedMetadata = {
        ...account.metadata,
        totalWithdrawals: (account.metadata.totalWithdrawals || 0) + withdrawalAmount,
        transactionCount: (account.metadata.transactionCount || 0) + 1,
        lastTransaction: new Date()
      };

      await account.update({ 
        balance: newBalance,
        metadata: updatedMetadata
      });

      // Credit wallet (withdrawal amount only, fees and penalties stay in savings)
      await walletService.creditWallet(userId, withdrawalAmount, 
        `Withdrawal from ${account.accountName}`, {
        category: 'savings_withdrawal',
        savingsAccountId: account.id
      });

      // Create transaction record
      await transactionService.createTransaction(userId, {
        type: 'credit',
        category: 'savings_withdrawal',
        amount: withdrawalAmount,
        fee: withdrawalFee + penalty,
        totalAmount: withdrawalAmount,
        description: `Withdrawal from savings account - ${account.accountName}`,
        reference: `SAV_WD_${Date.now()}`,
        metadata: {
          service: 'savings',
          action: 'withdrawal',
          savingsAccountId: account.id,
          accountNumber: account.accountNumber,
          previousBalance: parseFloat(account.balance),
          newBalance: newBalance,
          withdrawalFee,
          penalty,
          penaltyReason,
          totalDeducted: totalDeduction
        }
      });

      logger.info('Savings withdrawal completed successfully', {
        userId,
        accountId,
        amount: withdrawalAmount,
        fee: withdrawalFee,
        penalty,
        newBalance
      });

      return {
        success: true,
        withdrawal: {
          id: account.id,
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          withdrawalAmount,
          withdrawalFee,
          penalty,
          penaltyReason,
          totalDeducted: totalDeduction,
          newBalance,
          previousBalance: parseFloat(account.balance)
        }
      };
    } catch (error) {
      logger.error('Savings withdrawal failed', { error: error.message, userId, accountId, amount });
      throw error;
    }
  }

  // Calculate and credit interest
  async calculateInterest(accountId) {
    try {
      const { SavingsAccount } = require('../models');
      const account = await SavingsAccount.findByPk(accountId);

      if (!account || account.status !== this.accountStatuses.ACTIVE) {
        return null;
      }

      const now = new Date();
      const lastCalculation = new Date(account.metadata.lastInterestCalculation || account.createdAt);
      const daysDiff = Math.floor((now - lastCalculation) / (1000 * 60 * 60 * 24));

      if (daysDiff < 30) { // Calculate interest monthly
        return null;
      }

      const monthlyRate = account.interestRate / 12 / 100;
      const interest = parseFloat(account.balance) * monthlyRate;

      if (interest > 0) {
        // Credit interest to account
        const newBalance = parseFloat(account.balance) + interest;
        const updatedMetadata = {
          ...account.metadata,
          interestEarned: (account.metadata.interestEarned || 0) + interest,
          lastInterestCalculation: now
        };

        await account.update({ 
          balance: newBalance,
          metadata: updatedMetadata
        });

        // Create transaction record for interest
        await transactionService.createTransaction(account.userId, {
          type: 'credit',
          category: 'savings_interest',
          amount: interest,
          fee: 0,
          totalAmount: interest,
          description: `Interest earned - ${account.accountName}`,
          reference: `INT_${Date.now()}`,
          metadata: {
            service: 'savings',
            action: 'interest',
            savingsAccountId: account.id,
            accountNumber: account.accountNumber,
            interestRate: account.interestRate,
            monthlyRate,
            previousBalance: parseFloat(account.balance),
            newBalance
          }
        });

        logger.info('Interest calculated and credited', {
          accountId,
          interest,
          newBalance
        });

        return { interest, newBalance };
      }

      return null;
    } catch (error) {
      logger.error('Interest calculation failed', { error: error.message, accountId });
      throw error;
    }
  }

  // Get savings account transactions
  async getSavingsTransactions(userId, accountId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      // Verify account belongs to user
      const { SavingsAccount } = require('../models');
      const account = await SavingsAccount.findOne({
        where: { id: accountId, userId }
      });

      if (!account) {
        throw new Error('Savings account not found');
      }

      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          'metadata.savingsAccountId': accountId,
          category: ['savings_deposit', 'savings_withdrawal', 'savings_interest']
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return {
        transactions: transactions.rows.map(tx => ({
          reference: tx.reference,
          type: tx.type,
          category: tx.category,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          description: tx.description,
          status: tx.status,
          createdAt: tx.createdAt,
          metadata: tx.metadata
        })),
        pagination: {
          total: transactions.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(transactions.count / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get savings transactions', { error: error.message, userId, accountId });
      throw error;
    }
  }

  // Get savings summary
  async getSavingsSummary(userId) {
    try {
      const accounts = await this.getUserSavingsAccounts(userId);
      
      const summary = {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(acc => acc.status === 'active').length,
        totalBalance: accounts.reduce((sum, acc) => sum + acc.balance, 0),
        totalInterestEarned: accounts.reduce((sum, acc) => sum + (acc.metadata.interestEarned || 0), 0),
        accountsByType: accounts.reduce((acc, account) => {
          acc[account.accountType] = (acc[account.accountType] || 0) + 1;
          return acc;
        }, {}),
        targetAccounts: accounts.filter(acc => acc.accountType === 'target'),
        maturedAccounts: accounts.filter(acc => acc.status === 'matured').length
      };

      return summary;
    } catch (error) {
      logger.error('Failed to get savings summary', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new SavingsService();
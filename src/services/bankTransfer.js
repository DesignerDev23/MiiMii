const axios = require('axios');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');
const bellbankService = require('./bellbank');

class BankTransferService {
  constructor() {
    // Transfer limits and fees
    this.limits = {
      minimum: 100,
      maximum: 1000000, // 1 million naira
      dailyLimit: 5000000, // 5 million naira
      monthlyLimit: 50000000 // 50 million naira
    };

    // Transfer fees structure
    this.fees = {
      sameBankFee: 10, // Fixed fee for same bank transfers
      otherBankFee: 50, // Fixed fee for other bank transfers
      percentageFee: 0.005, // 0.5% for amounts above certain threshold
      freeThreshold: 10000 // No percentage fee below this amount
    };

    // Transfer types
    this.transferTypes = {
      SAME_BANK: 'same_bank',
      OTHER_BANK: 'other_bank',
      WALLET_TO_BANK: 'wallet_to_bank',
      BANK_TO_WALLET: 'bank_to_wallet'
    };
  }

  // Get all supported banks
  async getSupportedBanks() {
    try {
      // Get banks from BellBank API
      const banks = await bellbankService.getBankList();
      
      if (banks && banks.length > 0) {
        return banks.map(bank => ({
          code: bank.code,
          name: bank.name,
          slug: bank.slug || bank.code,
          type: 'commercial',
          category: 'deposit_money_bank'
        }));
      }

      // Fallback to static bank list if API fails
      return this.getStaticBankList();
    } catch (error) {
      logger.error('Failed to get banks from API, using static list', { error: error.message });
      return this.getStaticBankList();
    }
  }

  // Static bank list fallback
  getStaticBankList() {
    return [
      { code: '044', name: 'Access Bank', slug: 'access-bank', type: 'commercial' },
      { code: '014', name: 'Afribank Nigeria Plc', slug: 'afribank', type: 'commercial' },
      { code: '023', name: 'Citibank Nigeria Limited', slug: 'citibank', type: 'commercial' },
      { code: '050', name: 'Ecobank Nigeria Plc', slug: 'ecobank', type: 'commercial' },
      { code: '011', name: 'First Bank of Nigeria Limited', slug: 'first-bank', type: 'commercial' },
      { code: '214', name: 'First City Monument Bank Limited', slug: 'fcmb', type: 'commercial' },
      { code: '070', name: 'Fidelity Bank Plc', slug: 'fidelity-bank', type: 'commercial' },
      { code: '058', name: 'Guaranty Trust Bank Plc', slug: 'gtbank', type: 'commercial' },
      { code: '030', name: 'Heritage Banking Company Ltd', slug: 'heritage-bank', type: 'commercial' },
      { code: '082', name: 'Keystone Bank Limited', slug: 'keystone-bank', type: 'commercial' },
      { code: '221', name: 'Stanbic IBTC Bank Plc', slug: 'stanbic-ibtc', type: 'commercial' },
      { code: '068', name: 'Standard Chartered Bank Nigeria Ltd', slug: 'standard-chartered', type: 'commercial' },
      { code: '232', name: 'Sterling Bank Plc', slug: 'sterling-bank', type: 'commercial' },
      { code: '033', name: 'United Bank For Africa Plc', slug: 'uba', type: 'commercial' },
      { code: '032', name: 'Union Bank of Nigeria Plc', slug: 'union-bank', type: 'commercial' },
      { code: '035', name: 'Wema Bank Plc', slug: 'wema-bank', type: 'commercial' },
      { code: '057', name: 'Zenith Bank Plc', slug: 'zenith-bank', type: 'commercial' },
      { code: '215', name: 'Unity Bank Plc', slug: 'unity-bank', type: 'commercial' },
      { code: '076', name: 'Skye Bank Plc', slug: 'skye-bank', type: 'commercial' },
      { code: '084', name: 'Enterprise Bank Limited', slug: 'enterprise-bank', type: 'commercial' }
    ];
  }

  // Validate account number and get account name
  async validateBankAccount(accountNumber, bankCode) {
    try {
      if (!accountNumber || !bankCode) {
        throw new Error('Account number and bank code are required');
      }

      // Validate account number format (10 digits for Nigerian banks)
      if (!/^\d{10}$/.test(accountNumber)) {
        throw new Error('Account number must be 10 digits');
      }

      // Use BellBank API for account validation
      const accountDetails = await bellbankService.validateBankAccount(accountNumber, bankCode);
      
      if (accountDetails && accountDetails.account_name) {
        return {
          valid: true,
          accountNumber,
          bankCode,
          accountName: accountDetails.account_name,
          bank: accountDetails.bank_name || this.getBankNameByCode(bankCode),
          currency: 'NGN'
        };
      }

      // Mock validation for testing when API is not available
      if (!process.env.BELLBANK_CONSUMER_KEY) {
        logger.warn('BellBank API not configured, using mock validation');
        return {
          valid: true,
          accountNumber,
          bankCode,
          accountName: 'JOHN DOE (MOCK)',
          bank: this.getBankNameByCode(bankCode),
          currency: 'NGN',
          mock: true
        };
      }

      return {
        valid: false,
        message: 'Could not validate account details'
      };
    } catch (error) {
      logger.error('Account validation failed', { error: error.message, accountNumber, bankCode });
      throw error;
    }
  }

  // Get bank name by code
  getBankNameByCode(bankCode) {
    const banks = this.getStaticBankList();
    const bank = banks.find(b => b.code === bankCode);
    return bank ? bank.name : 'Unknown Bank';
  }

  // Calculate transfer fees
  calculateTransferFee(amount, transferType, sameBank = false) {
    const numAmount = parseFloat(amount);
    let baseFee = sameBank ? this.fees.sameBankFee : this.fees.otherBankFee;
    let percentageFee = 0;

    // Add percentage fee for larger amounts
    if (numAmount > this.fees.freeThreshold) {
      percentageFee = Math.ceil(numAmount * this.fees.percentageFee);
    }

    const totalFee = baseFee + percentageFee;
    
    return {
      baseFee,
      percentageFee,
      totalFee,
      amount: numAmount,
      totalAmount: numAmount + totalFee
    };
  }

  // Validate transfer limits
  async validateTransferLimits(userId, amount) {
    try {
      const numAmount = parseFloat(amount);
      
      // Check basic limits
      if (numAmount < this.limits.minimum) {
        throw new Error(`Minimum transfer amount is ₦${this.limits.minimum.toLocaleString()}`);
      }

      if (numAmount > this.limits.maximum) {
        throw new Error(`Maximum transfer amount is ₦${this.limits.maximum.toLocaleString()}`);
      }

      // Check daily limits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { Transaction } = require('../models');
      const dailyTransfers = await Transaction.sum('amount', {
        where: {
          userId,
          category: 'bank_transfer',
          status: 'completed',
          createdAt: {
            [require('sequelize').Op.gte]: today
          }
        }
      });

      const totalDailyAmount = (dailyTransfers || 0) + numAmount;
      if (totalDailyAmount > this.limits.dailyLimit) {
        throw new Error(`Daily transfer limit of ₦${this.limits.dailyLimit.toLocaleString()} exceeded`);
      }

      // Check monthly limits
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthlyTransfers = await Transaction.sum('amount', {
        where: {
          userId,
          category: 'bank_transfer',
          status: 'completed',
          createdAt: {
            [require('sequelize').Op.gte]: monthStart
          }
        }
      });

      const totalMonthlyAmount = (monthlyTransfers || 0) + numAmount;
      if (totalMonthlyAmount > this.limits.monthlyLimit) {
        throw new Error(`Monthly transfer limit of ₦${this.limits.monthlyLimit.toLocaleString()} exceeded`);
      }

      return {
        valid: true,
        dailyUsed: dailyTransfers || 0,
        monthlyUsed: monthlyTransfers || 0,
        dailyRemaining: this.limits.dailyLimit - (dailyTransfers || 0),
        monthlyRemaining: this.limits.monthlyLimit - (monthlyTransfers || 0)
      };
    } catch (error) {
      logger.error('Transfer limit validation failed', { error: error.message, userId, amount });
      throw error;
    }
  }

  // Process bank transfer
  async processBankTransfer(userId, transferData, pin) {
    try {
      const { accountNumber, bankCode, amount, narration, reference } = transferData;

      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate account
      const accountValidation = await this.validateBankAccount(accountNumber, bankCode);
      if (!accountValidation.valid) {
        throw new Error('Invalid bank account details');
      }

      // Validate transfer limits
      await this.validateTransferLimits(userId, amount);

      // Calculate fees
      const feeCalculation = this.calculateTransferFee(amount, this.transferTypes.WALLET_TO_BANK);
      
      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < feeCalculation.totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'bank_transfer',
        amount: feeCalculation.amount,
        fee: feeCalculation.totalFee,
        totalAmount: feeCalculation.totalAmount,
        description: `Bank transfer to ${accountValidation.accountName}`,
        reference: reference || `TXN${Date.now()}`,
        recipientDetails: {
          accountNumber: accountValidation.accountNumber,
          accountName: accountValidation.accountName,
          bankCode: accountValidation.bankCode,
          bankName: accountValidation.bank,
          narration: narration || 'Wallet transfer'
        },
        metadata: {
          service: 'bank_transfer',
          transferType: this.transferTypes.WALLET_TO_BANK,
          feeBreakdown: feeCalculation,
          accountValidation
        }
      });

      try {
        // Process transfer through BellBank API
        const transferResult = await this.processBellBankTransfer({
          accountNumber: accountValidation.accountNumber,
          bankCode: accountValidation.bankCode,
          amount: feeCalculation.amount,
          narration: narration || 'Wallet transfer',
          reference: transaction.reference,
          senderName: `${user.firstName} ${user.lastName}`.trim() || user.whatsappNumber
        });

        if (transferResult.success) {
          // Debit wallet
          await walletService.debitWallet(userId, feeCalculation.totalAmount, 
            `Bank transfer to ${accountValidation.accountName}`, {
            category: 'bank_transfer',
            transactionId: transaction.id
          });

          // Update transaction status
          await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
            providerReference: transferResult.reference,
            providerResponse: transferResult.response,
            sessionId: transferResult.sessionId
          });

          logger.info('Bank transfer completed successfully', {
            userId,
            accountNumber: accountValidation.accountNumber,
            amount: feeCalculation.amount,
            fee: feeCalculation.totalFee,
            reference: transaction.reference
          });

          return {
            success: true,
            transaction: {
              reference: transaction.reference,
              amount: feeCalculation.amount,
              fee: feeCalculation.totalFee,
              totalAmount: feeCalculation.totalAmount,
              accountNumber: accountValidation.accountNumber,
              accountName: accountValidation.accountName,
              bankName: accountValidation.bank,
              status: 'completed',
              estimatedArrival: '5-15 minutes'
            },
            provider: transferResult
          };
        } else {
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: transferResult.message || 'Transfer failed'
          });

          throw new Error(transferResult.message || 'Bank transfer failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

        throw new Error(`Bank transfer failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Bank transfer failed', { error: error.message, userId, transferData });
      throw error;
    }
  }

  // Process transfer through BellBank API
  async processBellBankTransfer(transferData) {
    try {
      if (!process.env.BELLBANK_CONSUMER_KEY) {
        // Mock response for testing
        logger.warn('BellBank API not configured, using mock response');
        return {
          success: true,
          reference: `MOCK_TRANSFER_${Date.now()}`,
          sessionId: `SESSION_${Date.now()}`,
          message: 'Transfer successful (mock)',
          response: {
            status: 'success',
            ...transferData
          }
        };
      }

      // Use BellBank service for actual transfer
      const result = await bellbankService.initiateTransfer(transferData);
      
      return {
        success: result.success || result.status === 'success',
        reference: result.reference || result.transaction_id,
        sessionId: result.session_id,
        message: result.message || 'Transfer processed',
        response: result
      };
    } catch (error) {
      logger.error('BellBank transfer failed', { error: error.message, transferData });
      
      return {
        success: false,
        message: error.message || 'Transfer processing failed',
        response: error.response?.data
      };
    }
  }

  // Get transfer history
  async getTransferHistory(userId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          category: 'bank_transfer',
          type: 'debit'
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return {
        transactions: transactions.rows.map(tx => ({
          reference: tx.reference,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          totalAmount: parseFloat(tx.totalAmount),
          accountNumber: tx.recipientDetails?.accountNumber,
          accountName: tx.recipientDetails?.accountName,
          bankName: tx.recipientDetails?.bankName,
          narration: tx.recipientDetails?.narration,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.processedAt,
          estimatedArrival: tx.status === 'completed' ? 'Delivered' : '5-15 minutes'
        })),
        pagination: {
          total: transactions.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(transactions.count / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get transfer history', { error: error.message, userId });
      throw error;
    }
  }

  // Get transfer limits for user
  async getTransferLimits(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const { Transaction } = require('../models');

      const [dailyUsed, monthlyUsed] = await Promise.all([
        Transaction.sum('amount', {
          where: {
            userId,
            category: 'bank_transfer',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: today }
          }
        }),
        Transaction.sum('amount', {
          where: {
            userId,
            category: 'bank_transfer',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: monthStart }
          }
        })
      ]);

      return {
        limits: this.limits,
        usage: {
          dailyUsed: dailyUsed || 0,
          monthlyUsed: monthlyUsed || 0,
          dailyRemaining: this.limits.dailyLimit - (dailyUsed || 0),
          monthlyRemaining: this.limits.monthlyLimit - (monthlyUsed || 0)
        },
        fees: this.fees
      };
    } catch (error) {
      logger.error('Failed to get transfer limits', { error: error.message, userId });
      throw error;
    }
  }

  // Get recent beneficiaries
  async getRecentBeneficiaries(userId, limit = 5) {
    try {
      const { Transaction } = require('../models');

      const transactions = await Transaction.findAll({
        where: {
          userId,
          category: 'bank_transfer',
          type: 'debit',
          status: 'completed'
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit) * 2, // Get more to filter duplicates
        attributes: ['recipientDetails', 'createdAt', 'amount']
      });

      // Remove duplicates based on account number
      const uniqueBeneficiaries = [];
      const seen = new Set();

      for (const tx of transactions) {
        const accountNumber = tx.recipientDetails?.accountNumber;
        if (!seen.has(accountNumber) && accountNumber) {
          seen.add(accountNumber);
          uniqueBeneficiaries.push({
            accountNumber,
            accountName: tx.recipientDetails.accountName,
            bankCode: tx.recipientDetails.bankCode,
            bankName: tx.recipientDetails.bankName,
            lastAmount: parseFloat(tx.amount),
            lastTransfer: tx.createdAt
          });
          
          if (uniqueBeneficiaries.length >= limit) break;
        }
      }

      return uniqueBeneficiaries;
    } catch (error) {
      logger.error('Failed to get recent beneficiaries', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new BankTransferService();
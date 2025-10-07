const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');

class AirtimeService {
  constructor() {
    // Bilal API configuration for airtime services
    this.baseURL = process.env.BILAL_BASE_URL;
    this.apiKey = process.env.BILAL_API_KEY;
    this.serviceId = process.env.BILAL_SERVICE_ID;
    
    // Nigerian network operators
    this.networks = {
      MTN: 'mtn',
      AIRTEL: 'airtel',
      GLO: 'glo',
      '9MOBILE': '9mobile'
    };

    // Airtime minimum and maximum amounts
    this.limits = {
      minimum: 50,
      maximum: 50000
    };

    // Supported amounts for quick selection
    this.quickAmounts = [100, 200, 500, 1000, 2000, 5000, 10000];
  }

  // Get all available networks
  async getNetworks() {
    try {
      return Object.keys(this.networks).map(name => ({
        name,
        code: this.networks[name],
        label: name === '9MOBILE' ? '9mobile' : name.charAt(0) + name.slice(1).toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to get networks', { error: error.message });
      throw error;
    }
  }

  // Get airtime limits and quick amounts
  async getAirtimeLimits() {
    try {
      return {
        limits: this.limits,
        quickAmounts: this.quickAmounts,
        supportedNetworks: await this.getNetworks()
      };
    } catch (error) {
      logger.error('Failed to get airtime limits', { error: error.message });
      throw error;
    }
  }

  // Clean phone number for processing (removed network validation - let provider API handle it)
  async cleanPhoneNumber(phoneNumber) {
    try {
      const cleanNumber = userService.cleanPhoneNumber(phoneNumber);
      return { valid: true, cleanNumber };
    } catch (error) {
      logger.error('Phone number cleaning failed', { error: error.message, phoneNumber });
      throw error;
    }
  }

  // Validate airtime amount
  validateAmount(amount) {
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (numAmount < this.limits.minimum) {
      throw new Error(`Minimum airtime amount is ₦${this.limits.minimum}`);
    }
    
    if (numAmount > this.limits.maximum) {
      throw new Error(`Maximum airtime amount is ₦${this.limits.maximum}`);
    }
    
    return numAmount;
  }

  // Purchase airtime
  async purchaseAirtime(userId, phoneNumber, network, amount, pin) {
    try {
      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate amount
      const validAmount = this.validateAmount(amount);

      // Clean phone number for processing
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
      // Calculate fee (typically 0-2% for airtime)
      const fee = Math.ceil(validAmount * 0.01); // 1% fee
      const totalAmount = validAmount + fee;

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'airtime',
        amount: validAmount,
        fee: fee,
        totalAmount: totalAmount,
        description: `Airtime purchase: ₦${validAmount} for ${validation.cleanNumber} (${network})`,
        recipientDetails: {
          phoneNumber: validation.cleanNumber,
          network: validation.network,
          amount: validAmount
        },
        metadata: {
          service: 'airtime',
          network: validation.network,
          amount: validAmount,
          phoneNumber: validation.cleanNumber
        }
      });

      try {
        // Process airtime purchase through Bilal API
        const purchaseResult = await this.processBilalAirtimePurchase(user, validation.cleanNumber, validation.network, validAmount);
        
        if (purchaseResult.success) {
          // Debit wallet
          await walletService.debitWallet(userId, totalAmount, `Airtime purchase: ₦${validAmount}`, {
            category: 'airtime',
            transactionId: transaction.id
          });

          // Update transaction status
          await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
            providerReference: purchaseResult.reference,
            providerResponse: purchaseResult.response
          });

          logger.info('Airtime purchase completed successfully', {
            userId,
            phoneNumber: validation.cleanNumber,
            network: validation.network,
            amount: validAmount,
            fee,
            reference: transaction.reference
          });

          return {
            success: true,
            transaction: {
              reference: transaction.reference,
              amount: validAmount,
              fee,
              totalAmount,
              phoneNumber: validation.cleanNumber,
              network: validation.network,
              status: 'completed'
            },
            provider: purchaseResult
          };
        } else {
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: purchaseResult.message || 'Purchase failed'
          });

          throw new Error(purchaseResult.message || 'Airtime purchase failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

        throw new Error(`Airtime purchase failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId, phoneNumber, network, amount });
      throw error;
    }
  }

  // Process airtime purchase through Bilal API
  async processBilalAirtimePurchase(user, phoneNumber, network, amount) {
    try {
      const bilalService = require('./bilal');
      
      logger.info('Processing airtime purchase through Bilal API', {
        userId: user.id,
        phoneNumber,
        network,
        amount
      });

      const airtimeData = {
        phoneNumber,
        network,
        amount,
        pin: '0000' // Dummy PIN - validation will be handled by the calling method
      };

      const result = await bilalService.purchaseAirtime(user, airtimeData, phoneNumber);
      
      logger.info('Bilal airtime purchase completed', {
        success: result.success,
        userId: user.id,
        phoneNumber,
        network,
        amount,
        reference: result.reference
      });

      return result;
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId: user.id, phoneNumber, network, amount });
      throw error;
    }
  }

  // Get airtime purchase history for user
  async getAirtimePurchaseHistory(userId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          category: 'airtime',
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
          phoneNumber: tx.recipientDetails?.phoneNumber,
          network: tx.recipientDetails?.network,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.processedAt
        })),
        pagination: {
          total: transactions.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(transactions.count / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get airtime purchase history', { error: error.message, userId });
      throw error;
    }
  }

  // Get network from phone number
  async detectNetwork(phoneNumber) {
    try {
      const cleanNumber = userService.cleanPhoneNumber(phoneNumber);
      
      // Nigerian network prefixes
      const prefixes = {
        mtn: ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906'],
        airtel: ['0802', '0808', '0708', '0812', '0701', '0902', '0907', '0901', '0904'], // Added 0904 for AIRTEL
        glo: ['0805', '0807', '0705', '0815', '0811', '0905'],
        '9mobile': ['0809', '0818', '0817', '0909', '0908']
      };

      const prefix = cleanNumber.substring(0, 4);
      
      for (const [network, networkPrefixes] of Object.entries(prefixes)) {
        if (networkPrefixes.includes(prefix)) {
          return {
            phoneNumber: cleanNumber,
            network,
            networkName: network === '9mobile' ? '9mobile' : network.toUpperCase()
          };
        }
      }

      throw new Error('Unable to detect network for this phone number');
    } catch (error) {
      logger.error('Network detection failed', { error: error.message, phoneNumber });
      throw error;
    }
  }

  // Check airtime balance (if supported by network)
  async checkAirtimeBalance(phoneNumber, network) {
    try {
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
      // Most Nigerian networks don't provide balance check APIs
      // Users typically dial network-specific codes
      const balanceCodes = {
        mtn: '*556#',
        airtel: '*123#',
        glo: '*124#',
        '9mobile': '*232#'
      };

      return {
        phoneNumber: validation.cleanNumber,
        network: validation.network,
        balanceCode: balanceCodes[validation.network],
        message: `To check your airtime balance, dial ${balanceCodes[validation.network]} from your phone.`
      };
    } catch (error) {
      logger.error('Airtime balance check failed', { error: error.message, phoneNumber, network });
      throw error;
    }
  }
}

module.exports = new AirtimeService();
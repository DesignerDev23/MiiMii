const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');

class UtilityService {
  constructor() {
    // Bilal API configuration for utility services
    this.baseURL = process.env.BILAL_BASE_URL;
    this.apiKey = process.env.BILAL_API_KEY;
    this.serviceId = process.env.BILAL_SERVICE_ID;
    
    // Utility categories and providers with logo URLs
    this.utilities = {
      electricity: {
        name: 'Electricity',
        icon: '⚡',
        providers: {
          'aedc': { 
            name: 'Abuja Electricity Distribution Company', 
            code: 'aedc',
            logo: 'https://via.placeholder.com/120x120/0066CC/FFFFFF?text=AEDC'
          },
          'ekedc': { 
            name: 'Eko Electricity Distribution Company', 
            code: 'ekedc',
            logo: 'https://via.placeholder.com/120x120/FF6600/FFFFFF?text=EKEDC'
          },
          'ikedc': { 
            name: 'Ikeja Electricity Distribution Company', 
            code: 'ikedc',
            logo: 'https://via.placeholder.com/120x120/00AA00/FFFFFF?text=IKEDC'
          },
          'kedco': { 
            name: 'Kano Electricity Distribution Company', 
            code: 'kedco',
            logo: 'https://via.placeholder.com/120x120/CC0000/FFFFFF?text=KEDCO'
          },
          'phed': { 
            name: 'Port Harcourt Electricity Distribution', 
            code: 'phed',
            logo: 'https://via.placeholder.com/120x120/006699/FFFFFF?text=PHED'
          },
          'iedc': { 
            name: 'Ibadan Electricity Distribution Company', 
            code: 'iedc',
            logo: 'https://via.placeholder.com/120x120/FF9900/FFFFFF?text=IBEDC'
          },
          'eedc': { 
            name: 'Enugu Electricity Distribution Company', 
            code: 'eedc',
            logo: 'https://via.placeholder.com/120x120/009900/FFFFFF?text=EEDC'
          },
          'kaedco': { 
            name: 'Kaduna Electricity Distribution Company', 
            code: 'kaedco',
            logo: 'https://via.placeholder.com/120x120/9900CC/FFFFFF?text=KAEDCO'
          },
          'jedc': { 
            name: 'Jos Electricity Distribution Company', 
            code: 'jedc',
            logo: 'https://via.placeholder.com/120x120/FF3300/FFFFFF?text=JEDC'
          },
          'bedc': { 
            name: 'Benin Electricity Distribution Company', 
            code: 'bedc',
            logo: 'https://via.placeholder.com/120x120/0066FF/FFFFFF?text=BEDC'
          }
        }
      },
      cable: {
        name: 'Cable TV',
        icon: '📺',
        providers: {
          'dstv': { 
            name: 'DStv', 
            code: 'dstv',
            logo: 'https://via.placeholder.com/120x120/000000/FFFFFF?text=DSTV'
          },
          'gotv': { 
            name: 'GOtv', 
            code: 'gotv',
            logo: 'https://via.placeholder.com/120x120/FF6600/FFFFFF?text=GOTV'
          },
          'startimes': { 
            name: 'StarTimes', 
            code: 'startimes',
            logo: 'https://via.placeholder.com/120x120/FF0000/FFFFFF?text=STAR'
          },
          'strong': { 
            name: 'Strong', 
            code: 'strong',
            logo: 'https://via.placeholder.com/120x120/0066CC/FFFFFF?text=STRONG'
          }
        }
      },
      internet: {
        name: 'Internet',
        icon: '🌐',
        providers: {
          'smile': { 
            name: 'Smile Communications', 
            code: 'smile',
            logo: 'https://via.placeholder.com/120x120/FF0066/FFFFFF?text=SMILE'
          },
          'spectranet': { 
            name: 'Spectranet', 
            code: 'spectranet',
            logo: 'https://via.placeholder.com/120x120/0099FF/FFFFFF?text=SPECTRA'
          },
          'swift': { 
            name: 'Swift Networks', 
            code: 'swift',
            logo: 'https://via.placeholder.com/120x120/FF6600/FFFFFF?text=SWIFT'
          },
          'coollink': { 
            name: 'Coollink', 
            code: 'coollink',
            logo: 'https://via.placeholder.com/120x120/00CCFF/FFFFFF?text=COOL'
          }
        }
      },
      water: {
        name: 'Water',
        icon: '💧',
        providers: {
          'lawma': { 
            name: 'Lagos Water Corporation', 
            code: 'lawma',
            logo: 'https://via.placeholder.com/120x120/0066CC/FFFFFF?text=LAWMA'
          },
          'kwsc': { 
            name: 'Kaduna Water Service Company', 
            code: 'kwsc',
            logo: 'https://via.placeholder.com/120x120/0099FF/FFFFFF?text=KWSC'
          },
          'fwc': { 
            name: 'Federal Water Corporation', 
            code: 'fwc',
            logo: 'https://via.placeholder.com/120x120/006699/FFFFFF?text=FWC'
          }
        }
      }
    };

    // Package plans for cable TV providers
    this.cablePlans = {
      dstv: [
        { id: 'dstv-padi', name: 'DStv Padi', price: 2150, duration: '30 days' },
        { id: 'dstv-yanga', name: 'DStv Yanga', price: 2950, duration: '30 days' },
        { id: 'dstv-confam', name: 'DStv Confam', price: 5300, duration: '30 days' },
        { id: 'dstv-compact', name: 'DStv Compact', price: 9000, duration: '30 days' },
        { id: 'dstv-compact-plus', name: 'DStv Compact Plus', price: 14250, duration: '30 days' },
        { id: 'dstv-premium', name: 'DStv Premium', price: 21000, duration: '30 days' }
      ],
      gotv: [
        { id: 'gotv-smallie', name: 'GOtv Smallie', price: 900, duration: '30 days' },
        { id: 'gotv-jinja', name: 'GOtv Jinja', price: 1900, duration: '30 days' },
        { id: 'gotv-jolli', name: 'GOtv Jolli', price: 2800, duration: '30 days' },
        { id: 'gotv-max', name: 'GOtv Max', price: 4150, duration: '30 days' },
        { id: 'gotv-supa', name: 'GOtv Supa', price: 5500, duration: '30 days' }
      ],
      startimes: [
        { id: 'startimes-nova', name: 'StarTimes Nova', price: 900, duration: '30 days' },
        { id: 'startimes-basic', name: 'StarTimes Basic', price: 1800, duration: '30 days' },
        { id: 'startimes-smart', name: 'StarTimes Smart', price: 2400, duration: '30 days' },
        { id: 'startimes-classic', name: 'StarTimes Classic', price: 2750, duration: '30 days' },
        { id: 'startimes-super', name: 'StarTimes Super', price: 4900, duration: '30 days' }
      ]
    };
  }

  // Get all utility categories
  async getUtilityCategories() {
    try {
      return Object.keys(this.utilities).map(key => ({
        id: key,
        name: this.utilities[key].name,
        icon: this.utilities[key].icon,
        providerCount: Object.keys(this.utilities[key].providers).length
      }));
    } catch (error) {
      logger.error('Failed to get utility categories', { error: error.message });
      throw error;
    }
  }

  // Get providers for a specific utility category
  async getProviders(category) {
    try {
      if (!this.utilities[category]) {
        throw new Error('Invalid utility category');
      }

      const categoryData = this.utilities[category];
      return {
        category,
        name: categoryData.name,
        icon: categoryData.icon,
        providers: Object.values(categoryData.providers)
      };
    } catch (error) {
      logger.error('Failed to get providers', { error: error.message, category });
      throw error;
    }
  }

  // Get cable TV plans for a provider
  async getCablePlans(provider) {
    try {
      // Normalize provider to lowercase for case-insensitive matching
      const normalizedProvider = provider.toLowerCase();
      if (!this.cablePlans[normalizedProvider]) {
        throw new Error('Cable plans not available for this provider');
      }

      const providerInfo = this.utilities.cable.providers[normalizedProvider];
      return {
        provider: providerInfo?.code || normalizedProvider,
        providerName: providerInfo?.name || provider,
        plans: this.cablePlans[normalizedProvider]
      };
    } catch (error) {
      logger.error('Failed to get cable plans', { error: error.message, provider });
      throw error;
    }
  }

  // Validate customer details
  async validateCustomer(category, provider, customerNumber) {
    try {
      if (!this.utilities[category]) {
        throw new Error('Invalid utility category');
      }

      // Normalize provider to lowercase for case-insensitive matching
      const normalizedProvider = provider.toLowerCase();
      if (!this.utilities[category].providers[normalizedProvider]) {
        throw new Error('Invalid provider for this category');
      }
      
      // Use the normalized provider code
      const providerCode = this.utilities[category].providers[normalizedProvider].code;

      // For testing purposes, simulate validation
      if (!this.baseURL || !this.apiKey) {
        logger.warn('Bilal API credentials not configured, using mock validation');
        return {
          valid: true,
          customerNumber,
          customerName: 'John Doe (Mock Customer)',
          address: '123 Mock Street, Lagos',
          category,
          provider: providerCode,
          balance: category === 'electricity' ? Math.floor(Math.random() * 5000) : null
        };
      }

      // Call Bilal API for validation
      const response = await axios.post(`${this.baseURL}/api/validate-customer`, {
        category,
        provider: providerCode,
        customer_number: customerNumber
      }, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success && response.data.customer) {
        return {
          valid: true,
          customerNumber,
          customerName: response.data.customer.name,
          address: response.data.customer.address,
          category,
          provider: providerCode,
          balance: response.data.customer.balance || null
        };
      } else {
        return {
          valid: false,
          message: response.data.message || 'Customer validation failed'
        };
      }
    } catch (error) {
      logger.error('Customer validation failed', { error: error.message, category, provider, customerNumber });
      
      if (error.response) {
        return {
          valid: false,
          message: error.response.data.message || 'Validation service unavailable'
        };
      }
      
      throw error;
    }
  }

  // Pay utility bill
  async payBill(userId, category, provider, customerNumber, amount, pin, planId = null) {
    try {
      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate category and provider (normalize to lowercase)
      const normalizedProvider = provider.toLowerCase();
      if (!this.utilities[category] || !this.utilities[category].providers[normalizedProvider]) {
        throw new Error('Invalid utility provider');
      }
      
      const providerCode = this.utilities[category].providers[normalizedProvider].code;

      // Validate customer
      const customerValidation = await this.validateCustomer(category, provider, customerNumber);
      if (!customerValidation.valid) {
        throw new Error(customerValidation.message || 'Invalid customer details');
      }

      let billAmount = parseFloat(amount);
      let planDetails = null;

      // For cable TV, validate plan if provided
      if (category === 'cable' && planId) {
        const plans = this.cablePlans[providerCode];
        if (!plans) {
          throw new Error('Plans not available for this provider');
        }
        
        planDetails = plans.find(plan => plan.id === planId);
        if (!planDetails) {
          throw new Error('Invalid plan selected');
        }
        
        billAmount = planDetails.price;
      }

      // Validate amount
      if (isNaN(billAmount) || billAmount <= 0) {
        throw new Error('Invalid amount');
      }

      if (billAmount < 100) {
        throw new Error('Minimum bill amount is ₦100');
      }

      if (billAmount > 100000) {
        throw new Error('Maximum bill amount is ₦100,000');
      }

      // Calculate fee (1-2% for utility bills)
      const feeRate = category === 'electricity' ? 0.015 : 0.02; // 1.5% for electricity, 2% for others
      const fee = Math.ceil(billAmount * feeRate);
      const totalAmount = billAmount + fee;

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'utility',
        amount: billAmount,
        fee: fee,
        totalAmount: totalAmount,
        description: `${this.utilities[category].name} bill payment - ${this.utilities[category].providers[normalizedProvider].name}`,
        recipientDetails: {
          category,
          provider: providerCode,
          customerNumber,
          customerName: customerValidation.customerName,
          planId,
          planDetails
        },
        metadata: {
          service: 'utility',
          category,
          provider: providerCode,
          customerNumber,
          planId,
          customerValidation
        }
      });

      try {
        // Process bill payment through Bilal API
        const paymentResult = await this.processBilalBillPayment(
          category, 
          providerCode, 
          customerNumber, 
          billAmount, 
          planId
        );
        
        if (paymentResult.success) {
          // Debit wallet
          await walletService.debitWallet(userId, totalAmount, `Utility bill payment: ${this.utilities[category].name}`, {
            category: 'utility',
            transactionId: transaction.id
          });

          // Update transaction status
          await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
            providerReference: paymentResult.reference,
            providerResponse: paymentResult.response
          });

          logger.info('Utility bill payment completed successfully', {
            userId,
            category,
            provider: providerCode,
            customerNumber,
            amount: billAmount,
            fee,
            reference: transaction.reference
          });

          return {
            success: true,
            transaction: {
              reference: transaction.reference,
              amount: billAmount,
              fee,
              totalAmount,
              category,
              provider,
              customerNumber,
              customerName: customerValidation.customerName,
              planDetails,
              status: 'completed'
            },
            provider: paymentResult
          };
        } else {
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: paymentResult.message || 'Payment failed'
          });

          throw new Error(paymentResult.message || 'Bill payment failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

        throw new Error(`Bill payment failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Utility bill payment failed', { error: error.message, userId, category, provider, customerNumber, amount });
      throw error;
    }
  }

  // Process bill payment through Bilal API
  async processBilalBillPayment(category, provider, customerNumber, amount, planId = null) {
    try {
      if (!this.baseURL || !this.apiKey) {
        // Mock response for testing when API credentials are not configured
        logger.warn('Bilal API credentials not configured, using mock response');
        return {
          success: true,
          reference: `MOCK_UTILITY_${Date.now()}`,
          message: 'Bill payment successful (mock)',
          response: {
            status: 'success',
            category,
            provider,
            customerNumber,
            amount,
            planId
          }
        };
      }

      const payload = {
        category,
        provider,
        customer_number: customerNumber,
        amount: amount
      };

      if (planId) {
        payload.plan_id = planId;
      }

      const response = await axios.post(`${this.baseURL}/api/utility/pay`, payload, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success || response.data.status === 'success') {
        return {
          success: true,
          reference: response.data.reference || response.data.transaction_id,
          message: response.data.message || 'Bill payment successful',
          response: response.data
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Bill payment failed',
          response: response.data
        };
      }
    } catch (error) {
      logger.error('Bilal API bill payment failed', { error: error.message, category, provider, customerNumber, amount });
      
      if (error.response) {
        return {
          success: false,
          message: error.response.data.message || 'API request failed',
          response: error.response.data
        };
      }
      
      throw error;
    }
  }

  // Get utility payment history for user
  async getUtilityPaymentHistory(userId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          category: 'utility',
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
          category: tx.recipientDetails?.category,
          provider: tx.recipientDetails?.provider,
          customerNumber: tx.recipientDetails?.customerNumber,
          customerName: tx.recipientDetails?.customerName,
          planDetails: tx.recipientDetails?.planDetails,
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
      logger.error('Failed to get utility payment history', { error: error.message, userId });
      throw error;
    }
  }

  // Get recent customers for a user (for quick payment)
  async getRecentCustomers(userId, category = null, limit = 5) {
    try {
      const { Transaction } = require('../models');
      
      const where = {
        userId,
        category: 'utility',
        type: 'debit',
        status: 'completed'
      };

      if (category) {
        // Add filter for specific utility category
        where['$recipientDetails.category$'] = category;
      }

      const transactions = await Transaction.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        attributes: ['recipientDetails', 'createdAt']
      });

      // Remove duplicates based on customer number and provider
      const uniqueCustomers = [];
      const seen = new Set();

      for (const tx of transactions) {
        const key = `${tx.recipientDetails?.provider}-${tx.recipientDetails?.customerNumber}`;
        if (!seen.has(key) && tx.recipientDetails?.customerNumber) {
          seen.add(key);
          uniqueCustomers.push({
            category: tx.recipientDetails.category,
            provider: tx.recipientDetails.provider,
            customerNumber: tx.recipientDetails.customerNumber,
            customerName: tx.recipientDetails.customerName,
            lastPayment: tx.createdAt
          });
        }
      }

      return uniqueCustomers;
    } catch (error) {
      logger.error('Failed to get recent customers', { error: error.message, userId, category });
      throw error;
    }
  }
}

module.exports = new UtilityService();
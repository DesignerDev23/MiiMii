const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');

class DataService {
  constructor() {
    // Bilal API configuration for data services
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
    
    // Data plans for each network (in GB and price in NGN)
    this.dataPlans = {
      mtn: [
        { id: 'mtn-100mb-100', size: '100MB', price: 100, duration: '1 day', code: '1' },
        { id: 'mtn-500mb-200', size: '500MB', price: 200, duration: '1 day', code: '2' },
        { id: 'mtn-1gb-300', size: '1GB', price: 300, duration: '1 day', code: '3' },
        { id: 'mtn-2gb-500', size: '2GB', price: 500, duration: '1 day', code: '4' },
        { id: 'mtn-1gb-500', size: '1GB', price: 500, duration: '7 days', code: '5' },
        { id: 'mtn-2gb-1000', size: '2GB', price: 1000, duration: '30 days', code: '6' },
        { id: 'mtn-3gb-1500', size: '3GB', price: 1500, duration: '30 days', code: '7' },
        { id: 'mtn-5gb-2500', size: '5GB', price: 2500, duration: '30 days', code: '8' },
        { id: 'mtn-10gb-5000', size: '10GB', price: 5000, duration: '30 days', code: '9' },
        { id: 'mtn-15gb-7500', size: '15GB', price: 7500, duration: '30 days', code: '10' },
        { id: 'mtn-20gb-10000', size: '20GB', price: 10000, duration: '30 days', code: '11' }
      ],
      airtel: [
        { id: 'airtel-100mb-100', size: '100MB', price: 100, duration: '1 day', code: '1' },
        { id: 'airtel-500mb-200', size: '500MB', price: 200, duration: '1 day', code: '2' },
        { id: 'airtel-1gb-350', size: '1GB', price: 350, duration: '1 day', code: '3' },
        { id: 'airtel-2gb-700', size: '2GB', price: 700, duration: '3 days', code: '4' },
        { id: 'airtel-1-5gb-1200', size: '1.5GB', price: 1200, duration: '30 days', code: '5' },
        { id: 'airtel-3gb-1500', size: '3GB', price: 1500, duration: '30 days', code: '6' },
        { id: 'airtel-6gb-2500', size: '6GB', price: 2500, duration: '30 days', code: '7' },
        { id: 'airtel-10gb-4000', size: '10GB', price: 4000, duration: '30 days', code: '8' },
        { id: 'airtel-15gb-5000', size: '15GB', price: 5000, duration: '30 days', code: '9' },
        { id: 'airtel-25gb-8000', size: '25GB', price: 8000, duration: '30 days', code: '10' }
      ],
      glo: [
        { id: 'glo-200mb-200', size: '200MB', price: 200, duration: '1 day', code: '1' },
        { id: 'glo-500mb-250', size: '500MB', price: 250, duration: '1 day', code: '2' },
        { id: 'glo-1gb-350', size: '1GB', price: 350, duration: '1 day', code: '3' },
        { id: 'glo-2-5gb-1000', size: '2.5GB', price: 1000, duration: '2 days', code: '4' },
        { id: 'glo-1-35gb-500', size: '1.35GB', price: 500, duration: '14 days', code: '5' },
        { id: 'glo-2-9gb-1000', size: '2.9GB', price: 1000, duration: '30 days', code: '6' },
        { id: 'glo-5-8gb-2000', size: '5.8GB', price: 2000, duration: '30 days', code: '7' },
        { id: 'glo-7-7gb-2500', size: '7.7GB', price: 2500, duration: '30 days', code: '8' },
        { id: 'glo-10gb-3000', size: '10GB', price: 3000, duration: '30 days', code: '9' },
        { id: 'glo-13-25gb-4000', size: '13.25GB', price: 4000, duration: '30 days', code: '10' }
      ],
      '9mobile': [
        { id: '9mobile-100mb-100', size: '100MB', price: 100, duration: '1 day', code: '1' },
        { id: '9mobile-650mb-300', size: '650MB', price: 300, duration: '1 day', code: '2' },
        { id: '9mobile-1gb-500', size: '1GB', price: 500, duration: '1 day', code: '3' },
        { id: '9mobile-2gb-1000', size: '2GB', price: 1000, duration: '2 days', code: '4' },
        { id: '9mobile-1-5gb-1200', size: '1.5GB', price: 1200, duration: '30 days', code: '5' },
        { id: '9mobile-4-5gb-2000', size: '4.5GB', price: 2000, duration: '30 days', code: '6' },
        { id: '9mobile-11gb-4000', size: '11GB', price: 4000, duration: '30 days', code: '7' },
        { id: '9mobile-15gb-5000', size: '15GB', price: 5000, duration: '30 days', code: '8' },
        { id: '9mobile-27-5gb-8000', size: '27.5GB', price: 8000, duration: '30 days', code: '9' },
        { id: '9mobile-110gb-15000', size: '110GB', price: 15000, duration: '30 days', code: '10' }
      ]
    };
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

  // Get data plans for a specific network (with admin-set selling prices)
  async getDataPlans(network) {
    try {
      // Use the DATA_PLANS from flowEndpoint which has the current plan structure
      const { DATA_PLANS } = require('../routes/flowEndpoint');
      const networkPlans = DATA_PLANS[network.toUpperCase()] || [];
      
      if (networkPlans.length === 0) {
        throw new Error('Unsupported network or no plans available');
      }

      // Fetch admin-set selling prices from KVStore
      let overrides = {};
      try {
        const KVStore = require('../models/KVStore');
        const record = await KVStore.findByPk('data_pricing_overrides');
        overrides = record?.value || {};
      } catch (_) {}

      // Return plans with admin-set selling prices (what users see)
      return networkPlans.map(plan => {
        const adminSellingPrice = overrides?.[network.toUpperCase()]?.[plan.id];
        const sellingPrice = typeof adminSellingPrice === 'number' ? adminSellingPrice : plan.price;
        
        return {
          id: plan.id,
          title: plan.title,
          validity: plan.validity,
          type: plan.type,
          price: sellingPrice, // This is what users see (admin-set selling price)
          retailPrice: plan.price, // Provider's retail price (for internal use)
          network: network.toUpperCase(),
          margin: sellingPrice - plan.price
        };
      });
    } catch (error) {
      logger.error('Failed to get data plans', { error: error.message, network });
      throw error;
    }
  }

  // Get all data plans for all networks
  async getAllDataPlans() {
    try {
      const allPlans = {};
      // Fetch overrides once
      let overrides = {};
      try {
        const KVStore = require('../models/KVStore');
        const record = await KVStore.findByPk('data_pricing_overrides');
        overrides = record?.value || {};
      } catch (_) {}
      
      for (const [networkName, networkCode] of Object.entries(this.networks)) {
        allPlans[networkCode] = this.dataPlans[networkCode].map(plan => {
          const overridePrice = overrides?.[networkCode]?.[plan.id];
          return {
            ...plan,
            price: typeof overridePrice === 'number' ? overridePrice : plan.price,
            network: networkCode,
            networkName
          };
        });
      }

      return allPlans;
    } catch (error) {
      logger.error('Failed to get all data plans', { error: error.message });
      throw error;
    }
  }

  // Validate phone number for specific network
  async validatePhoneNumber(phoneNumber, network) {
    try {
      const cleanNumber = userService.cleanPhoneNumber(phoneNumber);
      const networkCode = this.networks[network.toUpperCase()];
      
      if (!networkCode) {
        throw new Error('Unsupported network');
      }

      // Nigerian network prefixes
      const prefixes = {
        mtn: ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906'],
        airtel: ['0802', '0808', '0708', '0812', '0701', '0902', '0907', '0901'],
        glo: ['0805', '0807', '0705', '0815', '0811', '0905'],
        '9mobile': ['0809', '0818', '0817', '0909', '0908']
      };

      const prefix = cleanNumber.substring(0, 4);
      const isValid = prefixes[networkCode].includes(prefix);

      if (!isValid) {
        throw new Error(`Phone number ${phoneNumber} does not belong to ${network} network`);
      }

      return { valid: true, cleanNumber, network: networkCode };
    } catch (error) {
      logger.error('Phone number validation failed', { error: error.message, phoneNumber, network });
      throw error;
    }
  }

  // Purchase data
  async purchaseData(userId, phoneNumber, network, planId, pin) {
    try {
      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate phone number and network
      const validation = await this.validatePhoneNumber(phoneNumber, network);
      
      // Get plan details from DATA_PLANS and apply admin-set selling price
      const { DATA_PLANS } = require('../routes/flowEndpoint');
      const networkPlans = DATA_PLANS[network.toUpperCase()] || [];
      const plan = networkPlans.find(p => p.id === parseInt(planId));
      
      if (!plan) {
        throw new Error('Invalid data plan selected');
      }

      // Get admin-set selling price
      let sellingPrice = plan.price; // Default to retail price
      let retailPrice = plan.price; // Provider's retail price
      
      try {
        const KVStore = require('../models/KVStore');
        const record = await KVStore.findByPk('data_pricing_overrides');
        const overrides = record?.value || {};
        const adminSellingPrice = overrides?.[network.toUpperCase()]?.[plan.id];
        if (typeof adminSellingPrice === 'number' && adminSellingPrice > 0) {
          sellingPrice = adminSellingPrice;
        }
      } catch (_) {}

      // Check wallet balance against selling price
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < sellingPrice) {
        throw new Error('Insufficient wallet balance');
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'data_purchase',
        amount: sellingPrice,
        fee: 0,
        totalAmount: sellingPrice,
        description: `Data purchase: ${plan.title} for ${validation.cleanNumber} (${network})`,
        recipientDetails: {
          phoneNumber: validation.cleanNumber,
          network: network.toUpperCase(),
          planId,
          planTitle: plan.title,
          validity: plan.validity
        },
        metadata: {
          service: 'data_purchase',
          network: network.toUpperCase(),
          planId: plan.id,
          planTitle: plan.title,
          planType: plan.type,
          validity: plan.validity,
          retailPrice: retailPrice, // Provider's retail price
          sellingPrice: sellingPrice, // Admin-set selling price
          margin: sellingPrice - retailPrice,
          phoneNumber: validation.cleanNumber
        }
      });

      try {
        // Process data purchase through Bilal API
        const purchaseResult = await this.processBilalDataPurchase(validation.cleanNumber, network.toUpperCase(), plan);
        
        if (purchaseResult.success) {
          // Debit wallet with selling price (our charge to user)
          await walletService.debitWallet(userId, sellingPrice, `Data purchase: ${plan.title}`, {
            category: 'data',
            transactionId: transaction.id
          });

          // Update transaction status
          await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
            providerReference: purchaseResult.reference,
            providerResponse: purchaseResult.response
          });

          logger.info('Data purchase completed successfully', {
            userId,
            phoneNumber: validation.cleanNumber,
            network: networkCode,
            planId,
            amount: plan.price,
            reference: transaction.reference
          });

          return {
            success: true,
            transaction: {
              reference: transaction.reference,
              amount: plan.price,
              phoneNumber: validation.cleanNumber,
              network: networkCode,
              planDetails: plan,
              status: 'completed'
            },
            provider: purchaseResult
          };
        } else {
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: purchaseResult.message || 'Purchase failed'
          });

          throw new Error(purchaseResult.message || 'Data purchase failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

        throw new Error(`Data purchase failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Data purchase failed', { error: error.message, userId, phoneNumber, network, planId });
      throw error;
    }
  }

  // Process data purchase through Bilal API
  async processBilalDataPurchase(phoneNumber, network, plan) {
    try {
      if (!this.baseURL || !this.apiKey) {
        // Mock response for testing when API credentials are not configured
        logger.warn('Bilal API credentials not configured, using mock response');
        return {
          success: true,
          reference: `MOCK_${Date.now()}`,
          message: 'Data purchase successful (mock)',
          response: {
            status: 'success',
            phoneNumber,
            network,
            planDetails: plan
          }
        };
      }

      const payload = {
        phone: phoneNumber,
        network: network,
        plan_id: plan.code,
        amount: plan.price
      };

      const response = await axios.post(`${this.baseURL}/api/data`, payload, {
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
          message: response.data.message || 'Data purchase successful',
          response: response.data
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Data purchase failed',
          response: response.data
        };
      }
    } catch (error) {
      logger.error('Bilal API data purchase failed', { error: error.message, phoneNumber, network, plan });
      
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

  // Get data purchase history for user
  async getDataPurchaseHistory(userId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          category: 'data',
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
          phoneNumber: tx.recipientDetails?.phoneNumber,
          network: tx.recipientDetails?.network,
          planSize: tx.recipientDetails?.planSize,
          duration: tx.recipientDetails?.duration,
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
      logger.error('Failed to get data purchase history', { error: error.message, userId });
      throw error;
    }
  }

  // Check data balance (if supported by network)
  async checkDataBalance(phoneNumber, network) {
    try {
      const validation = await this.validatePhoneNumber(phoneNumber, network);
      
      // Most Nigerian networks don't provide balance check APIs
      // This would need integration with specific network APIs
      return {
        phoneNumber: validation.cleanNumber,
        network: validation.network,
        message: 'Balance check not available for this network. Please dial *131*4# to check your data balance.'
      };
    } catch (error) {
      logger.error('Data balance check failed', { error: error.message, phoneNumber, network });
      throw error;
    }
  }
}

module.exports = new DataService();
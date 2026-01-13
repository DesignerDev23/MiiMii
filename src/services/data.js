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

  // Get data plans for a specific network from database
  async getDataPlans(network) {
    try {
      logger.info('Fetching data plans from database', { network });
      
      // Get plans from database using DataPlanService
      const dataPlanService = require('./dataPlanService');
      const plans = await dataPlanService.getDataPlansByNetwork(network);
      
      if (plans.length === 0) {
        throw new Error('No data plans available for this network');
      }

      // Format plans for WhatsApp display
      const formattedPlans = plans.map(plan => {
        // Map database fields to expected format
        const price = parseFloat(plan.price || 0);
        const sellingPrice = plan.sellingPrice || price;
        const retailPrice = plan.retailPrice || price;
        const validity = plan.validityDays ? `${plan.validityDays} days` : plan.validity || 'N/A';
        const planType = plan.type || plan.planType || 'SME';
        const networkCode = plan.providerCode || plan.networkCode;
        
        return {
          id: plan.providerPlanId || plan.id,
          title: `${plan.dataSize} - ₦${sellingPrice.toLocaleString()}`,
          validity: validity,
          type: planType,
          price: sellingPrice, // Admin-set selling price (what users see)
          retailPrice: retailPrice, // Provider's retail price
          network: plan.network,
          margin: sellingPrice - retailPrice,
          dataSize: plan.dataSize,
          planType: planType,
          networkCode: networkCode
        };
      });

      logger.info(`Retrieved ${formattedPlans.length} data plans for ${network}`, {
        network,
        plansCount: formattedPlans.length
      });

      return formattedPlans;
    } catch (error) {
      logger.error('Failed to get data plans from database', { error: error.message, network });
      throw error;
    }
  }

  // Get all data plans for all networks from database
  async getAllDataPlans() {
    try {
      logger.info('Fetching all data plans from database');
      
      // Get all plans from database using DataPlanService
      const dataPlanService = require('./dataPlanService');
      const result = await dataPlanService.getAllDataPlans({
        isActive: true,
        orderBy: 'sellingPrice',
        orderDirection: 'ASC'
      });
      
      // Group plans by network
      const allPlans = {};
      const networks = ['MTN', 'AIRTEL', 'GLO', '9MOBILE'];
      
      for (const network of networks) {
        const networkPlans = result.plans.filter(plan => plan.network === network);
        allPlans[network] = networkPlans.map(plan => ({
          id: plan.providerPlanId || plan.id,
          title: `${plan.dataSize} - ₦${plan.sellingPrice.toLocaleString()}`,
          validity: plan.validity,
          type: plan.planType,
          price: plan.sellingPrice, // Admin-set selling price (what users see)
          retailPrice: plan.retailPrice, // Provider's retail price
          network: plan.network,
          margin: plan.sellingPrice - plan.retailPrice,
          dataSize: plan.dataSize,
          planType: plan.planType,
          networkCode: plan.networkCode
        }));
      }

      logger.info(`Retrieved data plans for all networks`, {
        totalPlans: result.total,
        networks: Object.keys(allPlans).map(network => ({
          network,
          count: allPlans[network].length
        }))
      });

      return allPlans;
    } catch (error) {
      logger.error('Failed to get all data plans from database', { error: error.message });
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

      // Clean phone number for processing
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
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
        // Step 1: Check provider (Bilal) balance BEFORE any transfers/debits
        // Use retail price (what provider charges) not selling price (what we charge user)
        const bilalService = require('./bilal');
        await bilalService.checkProviderBalance(plan.price || retailPrice);
        
        // Step 2: Transfer amount to parent account
        const bankTransferService = require('./bankTransfer');
        await bankTransferService.transferToParentAccount(userId, sellingPrice, 'data', transaction.reference);
        
        // Step 3: Sync and check Rubies wallet balance
        const walletBalance = await walletService.getWalletBalance(userId, true);
        if (walletBalance.available < sellingPrice) {
          throw new Error('Insufficient wallet balance');
        }
        
        // Step 4: Debit wallet with selling price (our charge to user)
        await walletService.debitWallet(userId, sellingPrice, `Data purchase: ${plan.title}`, {
          category: 'data',
          transactionId: transaction.id,
          parentAccountTransferred: true
        });

        // Step 5: Process data purchase through Bilal API
        const purchaseResult = await this.processBilalDataPurchase(validation.cleanNumber, network.toUpperCase(), plan);
        
        if (purchaseResult.success) {
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
              amount: sellingPrice,
              phoneNumber: validation.cleanNumber,
              network: networkCode,
              planDetails: plan,
              status: 'completed'
            },
            provider: purchaseResult
          };
        } else {
          // Provider failed - refund user wallet (should be rare now with balance check)
          await walletService.creditWallet(userId, sellingPrice, `Refund: Data purchase failed - ${transaction.reference}`, {
            category: 'refund',
            parentTransactionId: transaction.id,
            refundReason: purchaseResult.message || 'Provider purchase failed'
          });
          
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: purchaseResult.message || 'Purchase failed',
            refunded: true
          });

          throw new Error(purchaseResult.message || 'Data purchase failed');
        }
      } catch (providerError) {
        // Provider error - check if it's a balance check error (before debit) or actual provider error
        const isBalanceCheckError = providerError.message && providerError.message.includes('Provider has insufficient balance');
        
        if (!isBalanceCheckError) {
          // Only refund if user was already debited (actual provider error after debit)
          // The webhook will handle the actual refund
          logger.warn('Data purchase error - webhook will handle refund if needed', {
            userId,
            transactionReference: transaction.reference,
            error: providerError.message
          });
        } else {
          // Balance check failed - user was never debited, no refund needed
          logger.info('Data purchase rejected due to insufficient provider balance', {
            userId,
            transactionReference: transaction.reference,
            error: providerError.message
          });
        }
        
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message,
          awaitingRefund: !isBalanceCheckError // Only await refund if user was debited
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
      const { supabase } = require('../database/connection');
      const { data: transactions, error, count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('userId', userId)
        .eq('category', 'data_purchase')
        .eq('type', 'debit')
        .order('createdAt', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;

      return {
        transactions: (transactions || []).map(tx => ({
          reference: tx.reference,
          amount: parseFloat(tx.amount || 0),
          phoneNumber: tx.metadata?.recipientDetails?.phoneNumber,
          network: tx.metadata?.recipientDetails?.network,
          planSize: tx.metadata?.recipientDetails?.planSize,
          duration: tx.metadata?.recipientDetails?.duration,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.metadata?.processedAt || null
        })),
        pagination: {
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil((count || 0) / limit)
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
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
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
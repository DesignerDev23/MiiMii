const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');
const bellbankService = require('./bellbank');
const feesService = require('./fees');
const RetryHelper = require('../utils/retryHelper');
const ActivityLog = require('../models/ActivityLog'); // Added missing import

class BilalService {
  constructor() {
    this.baseURL = 'https://bilalsadasub.com/api';
    this.username = process.env.BILAL_USERNAME;
    this.password = process.env.BILAL_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    
    // Bilal's virtual account details for payments
    this.bilalAccount = {
      accountNumber: '5212208183',
      bankCode: '000027', // 9PSB bank code
      bankName: '9PSB',
      accountName: 'BILALSADASUB'
    };
  }

  async generateToken() {
    try {
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      // Use Basic Authentication as per Bilal documentation
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      
      const response = await axios.post(`${this.baseURL}/user`, {}, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.status === 'success') {
        this.token = response.data.AccessToken;
        // Set expiry to 23 hours (tokens typically last 24 hours)
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        
        logger.info('Bilal token generated successfully', {
          username: response.data.username,
          balance: response.data.balance
        });
        
        return {
          token: this.token,
          balance: response.data.balance,
          username: response.data.username
        };
      } else {
        throw new Error('Failed to generate token');
      }
    } catch (error) {
      logger.error('Failed to generate Bilal token', { error: error.message });
      throw error;
    }
  }

  async getBalance() {
    try {
      const tokenData = await this.generateToken();
      return {
        balance: parseFloat(tokenData.balance),
        currency: 'NGN'
      };
    } catch (error) {
      logger.error('Failed to get Bilal balance', { error: error.message });
      throw error;
    }
  }

  async transferToBilalAccount(user, amount, narration, requestId) {
    try {
      logger.info('Transferring funds to Bilal account', {
        userId: user.id,
        amount,
        requestId
      });

      const transferData = {
        amount: parseFloat(amount),
        accountNumber: this.bilalAccount.accountNumber,
        bankCode: this.bilalAccount.bankCode,
        narration: narration.substring(0, 30), // BellBank limit
        reference: `BILAL_${requestId}`,
        sessionId: `SESSION_${Date.now()}`,
        userId: user.id,
        transactionId: requestId
      };

      const transferResult = await bellbankService.transferFunds(transferData);

      if (transferResult.success) {
        logger.info('Transfer to Bilal account successful', {
          userId: user.id,
          amount,
          requestId,
          providerReference: transferResult.providerReference
        });

        return {
          success: true,
          transferReference: transferResult.providerReference,
          bilalReference: `BILAL_${requestId}`
        };
      } else {
        throw new Error(`Transfer to Bilal account failed: ${transferResult.message}`);
      }

    } catch (error) {
      logger.error('Failed to transfer funds to Bilal account', {
        error: error.message,
        userId: user.id,
        amount,
        requestId
      });
      throw error;
    }
  }

  async purchaseAirtime(user, purchaseData, userPhoneNumber) {
    try {
      const tokenData = await this.generateToken();
      
      // Validate required fields
      const { network, phone, amount } = purchaseData;
      if (!network || !phone || !amount) {
        throw new Error('Missing required fields: network, phone, amount');
      }

      // Generate unique request ID
      const requestId = `Airtime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Build payload according to Bilal documentation
      const payload = {
        network: this.getNetworkId(phone), // Use phone number for network ID
        phone: phone,
        plan_type: 'VTU',
        amount: parseInt(amount),
        bypass: false,
        'request-id': requestId
      };

      logger.info('Purchasing airtime with Bilal', {
        userId: user.id,
        network,
        phone,
        amount,
        requestId
      });

      // Transfer funds to Bilal account first
      await this.transferToBilalAccount(user, amount, `Airtime purchase for ${phone}`, requestId);

      // Make the airtime purchase request
      const response = await this.makeRequest('POST', '/topup', payload, tokenData.token);

      if (response.status === 'success') {
        logger.info('Airtime purchase successful', {
          userId: user.id,
          requestId: response['request-id'],
          amount: response.amount,
          phoneNumber: response.phone_number,
          message: response.message
        });

        // Log activity
        await ActivityLog.create({
          userId: user.id,
          action: 'airtime_purchase',
          details: {
            network,
            phone,
            amount: response.amount,
            requestId: response['request-id'],
            status: 'success',
            provider: 'bilal',
            message: response.message
          }
        });

        return {
          success: true,
          requestId: response['request-id'],
          amount: response.amount,
          phoneNumber: response.phone_number,
          message: response.message,
          oldBalance: response.oldbal,
          newBalance: response.newbal
        };
      } else {
        logger.error('Airtime purchase failed', {
          userId: user.id,
          requestId,
          response: response
        });

        // Log activity
        await ActivityLog.create({
          userId: user.id,
          action: 'airtime_purchase',
          details: {
            network,
            phone,
            amount,
          requestId,
            status: 'failed',
            provider: 'bilal',
            error: response.message || 'Unknown error'
          }
        });

        throw new Error(response.message || 'Airtime purchase failed');
      }
    } catch (error) {
      logger.error('Airtime purchase error', {
        userId: user.id,
        error: error.message, 
        stack: error.stack
      });

      // Log activity
      await ActivityLog.create({
        userId: user.id,
        action: 'airtime_purchase',
        details: {
          network: purchaseData.network,
          phone: purchaseData.phone,
          amount: purchaseData.amount,
          status: 'error',
          provider: 'bilal',
          error: error.message
        }
      });
      
      throw error;
    }
  }

  async purchaseData(user, purchaseData, userPhoneNumber) {
    try {
      const tokenData = await this.generateToken();
      
      // Validate required fields
      const { network, phone, dataPlan } = purchaseData;
      if (!network || !phone || !dataPlan) {
        throw new Error('Missing required fields: network, phone, dataPlan');
      }

      // Generate unique request ID
      const requestId = `Data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Build payload according to Bilal documentation
      const payload = {
        network: this.getNetworkId(phone), // Use phone number for network ID
        phone: phone,
        data_plan: dataPlan,
        bypass: false,
        'request-id': requestId
      };

      logger.info('Purchasing data with Bilal', {
        userId: user.id,
        network,
        phone,
        dataPlan,
        requestId
      });

      // Get data plan details to get amount
      const dataPlans = await this.getDataPlans(network);
      const selectedPlan = dataPlans.find(plan => plan.id == dataPlan);
      if (!selectedPlan) {
        throw new Error(`Data plan ${dataPlan} not found for ${network}`);
      }

      // Transfer funds to Bilal account first
      await this.transferToBilalAccount(user, selectedPlan.price, `Data purchase for ${phone}`, requestId);

      // Make the data purchase request
      const response = await this.makeRequest('POST', '/data', payload, tokenData.token);

      if (response.status === 'success') {
        logger.info('Data purchase successful', {
          userId: user.id,
          requestId: response['request-id'],
          amount: response.amount,
          dataplan: response.dataplan,
          phoneNumber: response.phone_number,
          message: response.message
        });

        // Log activity
        await ActivityLog.create({
          userId: user.id,
          action: 'data_purchase',
          details: {
            network,
            phone,
            dataPlan: response.dataplan,
            amount: response.amount,
            requestId: response['request-id'],
            status: 'success',
            provider: 'bilal',
            message: response.message
          }
        });

        return {
          success: true,
          requestId: response['request-id'],
          amount: response.amount,
          dataplan: response.dataplan,
          phoneNumber: response.phone_number,
          message: response.message,
          oldBalance: response.oldbal,
          newBalance: response.newbal
        };
      } else {
        logger.error('Data purchase failed', {
          userId: user.id,
          requestId,
          response: response
        });

        // Log activity
        await ActivityLog.create({
          userId: user.id,
          action: 'data_purchase',
          details: {
            network,
            phone,
            dataPlan,
            amount: selectedPlan.price,
          requestId,
            status: 'failed',
            provider: 'bilal',
            error: response.message || 'Unknown error'
          }
        });

        throw new Error(response.message || 'Data purchase failed');
      }
    } catch (error) {
      logger.error('Data purchase error', {
        userId: user.id,
        error: error.message, 
        stack: error.stack
      });

      // Log activity
      await ActivityLog.create({
        userId: user.id,
        action: 'data_purchase',
        details: {
          network: purchaseData.network,
          phone: purchaseData.phone,
          dataPlan: purchaseData.dataPlan,
          status: 'error',
          provider: 'bilal',
          error: error.message
        }
      });
      
      throw error;
    }
  }

  async payCableBill(user, billData, userPhoneNumber) {
    try {
      const { cableProvider, iucNumber, planId, amount } = billData;
      
      const cableId = this.getCableId(cableProvider);
      if (!cableId) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Unsupported cable provider!\n\nSupported providers:\n• DSTV\n• GOTV\n• STARTIME\n\nPlease specify a valid provider.`
        );
        return;
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      const estimatedAmount = amount || 5000; // Default estimate
      
      if (!wallet.canDebit(estimatedAmount)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\nEstimated cost: ₦${estimatedAmount.toLocaleString()}\nAvailable: ₦${parseFloat(wallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Generate unique request ID
      const requestId = `Cable_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Get token
      const tokenData = await this.generateToken();

      // Pay cable bill via Bilal API
      const payload = {
        cable: cableId,
        iuc: iucNumber,
        cable_plan: planId || 1, // Default to first plan if not specified
        bypass: false,
        'request-id': requestId
      };

      const response = await this.makeRequest('POST', '/cable', payload, tokenData.token);

      if (response.status === 'success') {
        // Debit user wallet with actual amount
        const actualAmount = parseFloat(response.amount);
        
        await walletService.debitWallet(
          user.id,
          actualAmount,
          `Cable subscription - ${response.cabl_name} ${response.plan_name} for ${iucNumber}`,
          {
            category: 'cable_payment',
            cableProvider: response.cabl_name,
            iucNumber,
            planName: response.plan_name,
            originalAmount: actualAmount,
            charges: response.charges,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Cable Subscription Successful!*\n\n` +
          `Provider: ${response.cabl_name}\n` +
          `Plan: ${response.plan_name}\n` +
          `IUC: ${response.iuc}\n` +
          `Amount: ₦${response.amount}\n` +
          `Charges: ₦${response.charges}\n` +
          `Reference: ${response['request-id']}\n\n` +
          `${response.message}`
        );

        logger.info('Cable payment successful', {
          userId: user.id,
          provider: response.cabl_name,
          planName: response.plan_name,
          iucNumber,
          amount: actualAmount,
          requestId
        });

        return response;

      } else {
        throw new Error(response.message || 'Cable payment failed');
      }

    } catch (error) {
      logger.error('Cable payment failed', { 
        error: error.message, 
        userId: user.id,
        billData 
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `❌ Cable payment failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`
      );
      
      throw error;
    }
  }

  getNetworkId(phoneNumber) {
    // Extract the first 4 digits to determine network
    const prefix = phoneNumber.substring(0, 4);
    
    // Network mapping according to Bilal documentation
    const networkMap = {
      '0803': { name: 'MTN', id: 1 },
      '0806': { name: 'MTN', id: 1 },
      '0703': { name: 'MTN', id: 1 },
      '0706': { name: 'MTN', id: 1 },
      '0813': { name: 'MTN', id: 1 },
      '0816': { name: 'MTN', id: 1 },
      '0810': { name: 'MTN', id: 1 },
      '0814': { name: 'MTN', id: 1 },
      '0903': { name: 'MTN', id: 1 },
      '0906': { name: 'MTN', id: 1 },
      '0708': { name: 'AIRTEL', id: 2 },
      '0812': { name: 'AIRTEL', id: 2 },
      '0701': { name: 'AIRTEL', id: 2 },
      '0902': { name: 'AIRTEL', id: 2 },
      '0802': { name: 'AIRTEL', id: 2 },
      '0808': { name: 'AIRTEL', id: 2 },
      '0705': { name: 'GLO', id: 3 },
      '0805': { name: 'GLO', id: 3 },
      '0815': { name: 'GLO', id: 3 },
      '0811': { name: 'GLO', id: 3 },
      '0905': { name: 'GLO', id: 3 },
      '0809': { name: '9MOBILE', id: 4 },
      '0817': { name: '9MOBILE', id: 4 },
      '0818': { name: '9MOBILE', id: 4 },
      '0908': { name: '9MOBILE', id: 4 },
      '0909': { name: '9MOBILE', id: 4 }
    };

    // Check for exact prefix match
    if (networkMap[prefix]) {
      return networkMap[prefix].id;
    }

    // Check for 3-digit prefix
    const threeDigitPrefix = phoneNumber.substring(0, 3);
    for (const [fullPrefix, network] of Object.entries(networkMap)) {
      if (fullPrefix.startsWith(threeDigitPrefix)) {
        return network.id;
      }
    }
    
    // Default to MTN if not detected
    return 1;
  }

  getCableId(provider) {
    const cableMap = {
      'GOTV': 1,
      'DSTV': 2,
      'STARTIME': 3
    };

    return cableMap[provider.toUpperCase()] || null;
  }

  async getDataPlans(networkName) {
    // This would typically be fetched from Bilal API, but since it's not in the docs,
    // we'll return common MTN plans as an example
    const commonPlans = {
      'MTN': [
        { id: 1, dataplan: '500MB', amount: '420', validity: '30days to 7days' },
        { id: 2, dataplan: '1GB', amount: '620', validity: '30 days' },
        { id: 3, dataplan: '2GB', amount: '1400', validity: 'Monthly' },
        { id: 4, dataplan: '3GB', amount: '2200', validity: '30days' },
        { id: 5, dataplan: '5GB', amount: '4500', validity: '30days' }
      ],
      'GLO': [
        { id: 1, dataplan: '500MB', amount: '400', validity: '30 days' },
        { id: 2, dataplan: '1GB', amount: '600', validity: '30 days' },
        { id: 3, dataplan: '2GB', amount: '1200', validity: '30 days' },
        { id: 4, dataplan: '3GB', amount: '1800', validity: '30 days' },
        { id: 5, dataplan: '5GB', amount: '3000', validity: '30 days' }
      ],
      'AIRTEL': [
        { id: 1, dataplan: '500MB', amount: '450', validity: '30 days' },
        { id: 2, dataplan: '1GB', amount: '650', validity: '30 days' },
        { id: 3, dataplan: '2GB', amount: '1300', validity: '30 days' },
        { id: 4, dataplan: '3GB', amount: '1950', validity: '30 days' },
        { id: 5, dataplan: '5GB', amount: '3250', validity: '30 days' }
      ],
      '9MOBILE': [
        { id: 1, dataplan: '500MB', amount: '500', validity: '30 days' },
        { id: 2, dataplan: '1GB', amount: '700', validity: '30 days' },
        { id: 3, dataplan: '2GB', amount: '1400', validity: '30 days' },
        { id: 4, dataplan: '3GB', amount: '2100', validity: '30 days' },
        { id: 5, dataplan: '5GB', amount: '3500', validity: '30 days' }
      ]
    };

    return commonPlans[networkName] || commonPlans['MTN'];
  }

  async makeRequest(method, endpoint, data = null, token = null) {
    return await RetryHelper.executeWithRetry(async () => {
      const config = {
        ...axiosConfig,
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          ...axiosConfig.headers,
          'Content-Type': 'application/json'
        }
      };

      if (token) {
        config.headers['Authorization'] = `Token ${token}`;
      }

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);

      return response.data;
    }, {
      maxAttempts: 3,
      baseDelay: 1500,
      operationName: `bilal_${method.toLowerCase()}_${endpoint.replace(/\//g, '_')}`,
      shouldRetry: (error, attempt) => {
        // Don't retry authentication errors
        if (error.response && [401, 403].includes(error.response.status)) {
          return false;
        }
        // Retry on network errors and 5xx errors
        return !error.response || error.response.status >= 500;
      }
    });
  }

  // Handle webhook responses from Bilal
  async handleBilalCallback(webhookData) {
    try {
      const { status, 'request-id': requestId, response: message } = webhookData;
      
      logger.info('Bilal callback received', {
        status,
        requestId,
        message
      });

      // Process the callback based on status
      if (status === 'success') {
        logger.info('Bilal service successful via callback', {
          requestId,
          message
        });
        // Transaction was successful - already processed in initial request
      } else {
        logger.error('Bilal service failed via callback', {
          requestId,
          message
        });
        // Handle failed transaction - could implement refund logic here
      }

      return {
        processed: true,
        status,
        requestId
      };
    } catch (error) {
      logger.error('Failed to handle Bilal callback', {
        error: error.message,
        webhookData
      });
      throw error;
    }
  }

  // Test method for checking service availability
  async testConnection() {
    try {
      const tokenData = await this.generateToken();
      
      return {
        success: true,
        balance: tokenData.balance,
        username: tokenData.username,
        message: 'Bilal API connection successful'
      };
    } catch (error) {
      logger.error('Bilal connection test failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new BilalService();
const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');

class BilalService {
  constructor() {
    this.baseURL = 'https://bilalsadasub.com/api';
    this.username = process.env.BILAL_USERNAME;
    this.password = process.env.BILAL_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
  }

  async generateToken() {
    try {
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

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

  async purchaseAirtime(user, purchaseData, userPhoneNumber) {
    try {
      const { amount, phoneNumber } = purchaseData;
      const network = this.getNetworkId(phoneNumber);
      
      // Check user balance first
      const wallet = await walletService.getUserWallet(user.id);
      const totalCost = parseFloat(amount) + parseFloat(process.env.DATA_PURCHASE_FEE || 10);
      
      if (!wallet.canDebit(totalCost)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\nRequired: ₦${totalCost.toLocaleString()}\nAvailable: ₦${parseFloat(wallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Generate unique request ID
      const requestId = `Airtime_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Get token
      const tokenData = await this.generateToken();

      // Purchase airtime via Bilal API
      const payload = {
        network: network.id,
        phone: phoneNumber,
        plan_type: 'VTU',
        amount: parseFloat(amount),
        bypass: false,
        'request-id': requestId
      };

      const response = await this.makeRequest('POST', '/topup', payload, tokenData.token);

      if (response.status === 'success') {
        // Debit user wallet
        await walletService.debitWallet(
          user.id,
          totalCost,
          `Airtime purchase - ${network.name} ₦${amount} for ${phoneNumber}`,
          {
            category: 'airtime_purchase',
            network: network.name,
            phoneNumber,
            originalAmount: amount,
            fee: process.env.DATA_PURCHASE_FEE || 10,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Airtime Purchase Successful!*\n\n` +
          `Network: ${response.network}\n` +
          `Amount: ₦${response.amount}\n` +
          `Phone: ${response.phone_number}\n` +
          `Reference: ${response['request-id']}\n` +
          `Discount: ₦${response.discount || 0}\n\n` +
          `${response.message}`
        );

        logger.info('Airtime purchase successful', {
          userId: user.id,
          amount,
          phoneNumber,
          network: network.name,
          requestId,
          bilalBalance: response.newbal
        });

        return response;

      } else {
        throw new Error(response.message || 'Airtime purchase failed');
      }

    } catch (error) {
      logger.error('Airtime purchase failed', { 
        error: error.message, 
        userId: user.id,
        purchaseData 
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `❌ Airtime purchase failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`
      );
      
      throw error;
    }
  }

  async purchaseData(user, purchaseData, userPhoneNumber) {
    try {
      const { dataSize, amount, phoneNumber, dataPlanId } = purchaseData;
      const network = this.getNetworkId(phoneNumber);
      
      // Get available data plans for the network if plan ID not provided
      let selectedPlan = null;
      if (dataPlanId) {
        selectedPlan = { id: dataPlanId };
      } else {
        const plans = await this.getDataPlans(network.name);
        
        if (dataSize) {
          // Find plan by data size (e.g., "2GB", "1GB")
          selectedPlan = plans.find(plan => 
            plan.dataplan.toLowerCase().includes(dataSize.toLowerCase())
          );
        } else if (amount) {
          // Find plan by amount
          selectedPlan = plans.find(plan => 
            parseFloat(plan.amount) === parseFloat(amount)
          );
        }

        if (!selectedPlan && plans.length > 0) {
          // Show available plans
          await whatsappService.sendTextMessage(
            userPhoneNumber,
            `❌ Data plan not found!\n\nAvailable plans for ${network.name}:\n` +
            plans.slice(0, 5).map(plan => 
              `• ${plan.dataplan} - ₦${plan.amount} (${plan.validity})`
            ).join('\n') +
            `\n\nPlease specify a valid plan.`
          );
          return;
        }
      }

      // Use default plan if none specified (usually plan 1 for 500MB)
      const planId = selectedPlan?.id || 1;

      // Check user balance (we'll get the actual cost from the plan)
      const wallet = await walletService.getUserWallet(user.id);
      const estimatedCost = amount ? parseFloat(amount) : 500; // Estimate if no amount provided
      const totalCost = estimatedCost + parseFloat(process.env.DATA_PURCHASE_FEE || 10);
      
      if (!wallet.canDebit(totalCost)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\nEstimated cost: ₦${totalCost.toLocaleString()}\nAvailable: ₦${parseFloat(wallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Generate unique request ID
      const requestId = `Data_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Get token
      const tokenData = await this.generateToken();

      // Purchase data via Bilal API
      const payload = {
        network: network.id,
        phone: phoneNumber,
        data_plan: planId,
        bypass: false,
        'request-id': requestId
      };

      const response = await this.makeRequest('POST', '/data', payload, tokenData.token);

      if (response.status === 'success') {
        // Debit user wallet with actual amount
        const actualAmount = parseFloat(response.amount);
        const actualTotalCost = actualAmount + parseFloat(process.env.DATA_PURCHASE_FEE || 10);
        
        await walletService.debitWallet(
          user.id,
          actualTotalCost,
          `Data purchase - ${network.name} ${response.dataplan} for ${phoneNumber}`,
          {
            category: 'data_purchase',
            network: network.name,
            phoneNumber,
            planId,
            dataSize: response.dataplan,
            originalAmount: actualAmount,
            fee: process.env.DATA_PURCHASE_FEE || 10,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Data Purchase Successful!*\n\n` +
          `Network: ${response.network}\n` +
          `Plan: ${response.dataplan}\n` +
          `Phone: ${response.phone_number}\n` +
          `Amount: ₦${response.amount}\n` +
          `Reference: ${response['request-id']}\n\n` +
          `${response.message}`
        );

        logger.info('Data purchase successful', {
          userId: user.id,
          plan: response.dataplan,
          phoneNumber,
          network: network.name,
          requestId,
          bilalBalance: response.newbal
        });

        return response;

      } else {
        throw new Error(response.message || 'Data purchase failed');
      }

    } catch (error) {
      logger.error('Data purchase failed', { 
        error: error.message, 
        userId: user.id,
        purchaseData 
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `❌ Data purchase failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`
      );
      
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
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const prefix = cleanNumber.substring(0, 4);
    
    // Nigerian network prefixes mapped to Bilal IDs
    const networkMap = {
      'MTN': { id: 1, prefixes: ['0803', '0806', '0703', '0706', '0813', '0810', '0814', '0816', '0903', '0906'] },
      'AIRTEL': { id: 2, prefixes: ['0802', '0808', '0708', '0812', '0701', '0902', '0901'] },
      'GLO': { id: 3, prefixes: ['0805', '0807', '0705', '0815', '0811', '0905'] },
      '9MOBILE': { id: 4, prefixes: ['0809', '0817', '0818', '0909', '0908'] }
    };

    for (const [name, network] of Object.entries(networkMap)) {
      if (network.prefixes.includes(prefix)) {
        return { name, id: network.id };
      }
    }
    
    return { name: 'MTN', id: 1 }; // Default to MTN if not detected
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
    try {
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
    } catch (error) {
      if (error.response) {
        const apiError = error.response.data;
        throw new Error(apiError.message || `Bilal API Error: ${error.response.status}`);
      }
      throw error;
    }
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
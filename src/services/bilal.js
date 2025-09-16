const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');
const bellbankService = require('./bellbank');
const feesService = require('./fees');
const RetryHelper = require('../utils/retryHelper');
const { ActivityLog } = require('../models');
const receiptService = require('./receipt');

class BilalService {
  constructor() {
    this.baseURL = process.env.BILAL_BASE_URL || 'https://bilalsadasub.com/api';
    this.username = process.env.PROVIDER_USERNAME;
    this.password = process.env.PROVIDER_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    this.balance = null;
    this.cachedUsername = null;
    
    // Bilal's virtual account details for payments
    this.bilalAccount = {
      accountNumber: '5212208183',
      bankCode: '000027', // 9PSB bank code
      bankName: '9PSB',
      accountName: 'BILALSADASUB'
    };

    // Network mapping according to BILALSADASUB documentation
    this.networkMapping = {
      'MTN': 1,
      'AIRTEL': 2,
      'GLO': 3,
      '9MOBILE': 4
    };

    // Disco mapping for electricity bills
    this.discoMapping = {
      'IKEJA': 1,
      'EKO': 2,
      'KANO': 3,
      'PORT HARCOURT': 4,
      'JOSS': 5,
      'IBADAN': 6,
      'ENUGU': 7,
      'KADUNA': 8,
      'ABUJA': 9,
      'BENIN': 10,
      'PHED': 11
    };
  }

  async generateToken() {
    try {
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return {
          token: this.token,
          balance: this.balance,
          username: this.cachedUsername
        };
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
        this.balance = response.data.balance;
        this.cachedUsername = response.data.username;
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

      const transferResult = await bellbankService.initiateTransfer(transferData);

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

  // AIRTIME SERVICE
  async purchaseAirtime(user, airtimeData, userPhoneNumber) {
    try {
      const { phoneNumber, network, amount, pin } = airtimeData;

      // Require and validate 4-digit transaction PIN for ANY wallet debit
      if (!pin || !/^\d{4}$/.test(String(pin))) {
        throw new Error('Transaction PIN required. Please enter a valid 4-digit PIN.');
      }
      try {
        const userService = require('./user');
        await userService.validateUserPin(user.id, pin);
      } catch (pinErr) {
        throw new Error(pinErr.message || 'Invalid PIN. Please try again.');
      }
      
      // Validate network
      const networkId = this.networkMapping[network.toUpperCase()];
      if (!networkId) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const walletBalance = parseFloat(wallet.balance);
      const requiredAmount = parseFloat(amount);
      
      if (walletBalance < requiredAmount) {
        throw new Error(`Insufficient balance. Required: ₦${requiredAmount}, Available: ₦${walletBalance}`);
      }

      // Generate unique request ID (will be overridden with simple format below)
      const requestId = `Airtime_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Get token
      logger.info('About to generate token for airtime purchase', {
        hasUsername: !!this.username,
        hasPassword: !!this.password,
        baseURL: this.baseURL
      });
      
      let tokenData;
      try {
        tokenData = await this.generateToken();
        
        logger.info('Token generated for airtime purchase', {
          hasToken: !!tokenData.token,
          tokenLength: tokenData.token ? tokenData.token.length : 0,
          hasBalance: !!tokenData.balance,
          hasUsername: !!tokenData.username
        });
      } catch (tokenError) {
        logger.error('Token generation failed for airtime purchase', {
          error: tokenError.message,
          stack: tokenError.stack
        });
        throw new Error(`Token generation failed: ${tokenError.message}`);
      }

      // Purchase airtime via BILALSADASUB API
      // Remove country code from phone number but keep the leading 0 (Bilal expects 11 digits with leading 0)
      const cleanPhoneNumber = phoneNumber.replace(/^\+234/, '').replace(/^234/, '');
      
      // Validate phone number format
      if (!/^0[789][01][0-9]{8}$/.test(cleanPhoneNumber)) {
        throw new Error(`Invalid phone number format: ${cleanPhoneNumber}. Phone number must be 11 digits starting with 070, 071, 080, 081, 090, or 091`);
      }
      
      // Validate amount
      if (amount < 50 || amount > 50000) {
        throw new Error(`Invalid amount: ₦${amount}. Amount must be between ₦50 and ₦50,000`);
      }
      
      // Generate simple request ID as per documentation format
      const simpleRequestId = `Airtime_${Date.now()}`;
      
      const payload = {
        network: networkId,
        phone: parseInt(cleanPhoneNumber), // Send as integer with leading 0 as per documentation
        plan_type: 'VTU', // Required field as per official documentation
        bypass: false,
        amount: amount,
        'request-id': simpleRequestId
      };

      logger.info('Making airtime purchase request to Bilal API', {
        payload,
        tokenLength: tokenData.token ? tokenData.token.length : 0,
        networkId,
        phoneNumber: cleanPhoneNumber,
        originalPhoneNumber: phoneNumber,
        amount,
        endpoint: '/topup',
        method: 'POST',
        fullPayload: JSON.stringify(payload)
      });

      const response = await this.makeRequest('POST', '/topup', payload, tokenData.token);

      logger.info('Bilal API airtime response received', {
        status: response.status,
        responseKeys: Object.keys(response),
        hasAmount: !!response.amount,
        hasMessage: !!response.message,
        requestId: response['request-id'],
        fullResponse: JSON.stringify(response)
      });

      if (response.status === 'success') {
        // Debit user wallet with actual amount
        const actualAmount = parseFloat(response.amount);
        
        await walletService.debitWallet(
          user.id,
          actualAmount,
          `Airtime purchase - ${response.network} ${response.phone_number}`,
          {
            category: 'airtime_purchase',
            network: response.network,
            phoneNumber: response.phone_number,
            amount: actualAmount,
            discount: response.discount,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        // Log activity
        await ActivityLog.logUserActivity(
          user.id,
          'airtime_purchase',
          'airtime_purchased',
          {
            description: 'Airtime purchased successfully',
            network: response.network,
            phoneNumber: response.phone_number,
            amount: actualAmount,
            discount: response.discount,
            provider: 'bilal',
            success: true,
            source: 'api'
          }
        );

        const successMessage = `✅ *Airtime Purchase Successful!*\n\n` +
          `Network: ${response.network}\n` +
          `Phone: ${response.phone_number}\n` +
          `Amount: ₦${response.amount}\n` +
          `Reference: ${response['request-id']}\n\n` +
          `${response.message}`;

        // Generate and send receipt
        let receiptSent = false;
        try {
          const receiptData = {
            network: response.network,
            phoneNumber: response.phone_number,
            amount: response.amount,
            reference: response['request-id'],
            date: new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            status: 'Successful',
            discount: response.discount || 0
          };

          const receiptBuffer = await receiptService.generateAirtimeReceipt(receiptData);
          await whatsappService.sendImageMessage(userPhoneNumber, receiptBuffer, 'receipt.jpg');
          receiptSent = true;
        } catch (receiptError) {
          logger.warn('Failed to generate receipt, sending text message only', { error: receiptError.message });
          await whatsappService.sendTextMessage(userPhoneNumber, successMessage);
          receiptSent = true; // Mark as sent even if it's text fallback
        }

        logger.info('Airtime purchase successful', {
          userId: user.id,
          network: response.network,
          phoneNumber: response.phone_number,
          amount: actualAmount,
          requestId: simpleRequestId
        });

        return {
          success: true,
          data: response,
          message: receiptSent ? null : successMessage // Only return message if receipt wasn't sent
        };

      } else {
        throw new Error(response.message || 'Airtime purchase failed');
      }

    } catch (error) {
      logger.error('Airtime purchase failed', { 
        error: error.message, 
        userId: user.id,
        airtimeData 
      });

      const errorMessage = `❌ Airtime purchase failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`;
      await whatsappService.sendTextMessage(userPhoneNumber, errorMessage);
      
      throw error;
    }
  }

  // DATA SERVICE
  async getDataPlans(network) {
    try {
      const tokenData = await this.generateToken();
      
      // Fetch data plans from Bilal API
      const response = await this.makeRequest('GET', `/data/plans?network=${this.networkMapping[network.toUpperCase()]}`, null, tokenData.token);
      
      if (response.status === 'success' && response.data) {
        return response.data.map(plan => ({
          id: plan.id,
          title: `${plan.data_size} - ₦${plan.price} (${plan.validity})`,
          data_size: plan.data_size,
          price: parseFloat(plan.price),
          validity: plan.validity,
          network: network
        }));
      } else {
        // Return default plans if API fails
        return this.getDefaultDataPlans(network);
      }
    } catch (error) {
      logger.error('Failed to fetch data plans from Bilal', { error: error.message, network });
      // Return default plans as fallback
      return this.getDefaultDataPlans(network);
    }
  }

  getDefaultDataPlans(network) {
    const defaultPlans = {
      'MTN': [
        { id: 1, title: '500MB - ₦380 (30 days)', data_size: '500MB', price: 380, validity: '30 days' },
        { id: 2, title: '1GB - ₦620 (30 days)', data_size: '1GB', price: 620, validity: '30 days' },
        { id: 3, title: '2GB - ₦1,240 (30 days)', data_size: '2GB', price: 1240, validity: '30 days' },
        { id: 4, title: '3GB - ₦2,200 (30 days)', data_size: '3GB', price: 2200, validity: '30 days' },
        { id: 5, title: '5GB - ₦4,500 (30 days)', data_size: '5GB', price: 4500, validity: '30 days' }
      ],
      'AIRTEL': [
        { id: 1, title: '500MB - ₦400 (30 days)', data_size: '500MB', price: 400, validity: '30 days' },
        { id: 2, title: '1GB - ₦650 (30 days)', data_size: '1GB', price: 650, validity: '30 days' },
        { id: 3, title: '2GB - ₦1,300 (30 days)', data_size: '2GB', price: 1300, validity: '30 days' }
      ],
      'GLO': [
        { id: 1, title: '500MB - ₦350 (30 days)', data_size: '500MB', price: 350, validity: '30 days' },
        { id: 2, title: '1GB - ₦600 (30 days)', data_size: '1GB', price: 600, validity: '30 days' },
        { id: 3, title: '2GB - ₦1,200 (30 days)', data_size: '2GB', price: 1200, validity: '30 days' }
      ],
      '9MOBILE': [
        { id: 1, title: '500MB - ₦400 (30 days)', data_size: '500MB', price: 400, validity: '30 days' },
        { id: 2, title: '1GB - ₦650 (30 days)', data_size: '1GB', price: 650, validity: '30 days' },
        { id: 3, title: '2GB - ₦1,300 (30 days)', data_size: '2GB', price: 1300, validity: '30 days' }
      ]
    };
    
    return defaultPlans[network.toUpperCase()] || defaultPlans['MTN'];
  }

  async purchaseData(user, dataData, userPhoneNumber) {
    try {
      logger.info('Bilal purchaseData called with:', {
        hasUser: !!user,
        hasDataData: !!dataData,
        dataDataType: typeof dataData,
        dataDataKeys: dataData ? Object.keys(dataData) : 'null/undefined',
        userPhoneNumber
      });
      
      if (!dataData) {
        throw new Error('dataData is null or undefined');
      }
      
      const { phoneNumber, network, dataPlan, pin } = dataData;

      // Require and validate 4-digit transaction PIN for ANY wallet debit
      if (!pin || !/^\d{4}$/.test(String(pin))) {
        throw new Error('Transaction PIN required. Please enter a valid 4-digit PIN.');
      }
      try {
        const userService = require('./user');
        await userService.validateUserPin(user.id, pin);
      } catch (pinErr) {
        throw new Error(pinErr.message || 'Invalid PIN. Please try again.');
      }
      
      // Validate network
      const networkId = this.networkMapping[network.toUpperCase()];
      if (!networkId) {
        throw new Error(`Unsupported network: ${network}`);
      }

      // Check user balance (estimate amount)
      const estimatedAmount = dataPlan.price || 1000;
      const wallet = await walletService.getUserWallet(user.id);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const walletBalance = parseFloat(wallet.balance);
      const requiredAmount = parseFloat(estimatedAmount);
      
      if (walletBalance < requiredAmount) {
        throw new Error(`Insufficient balance. Required: ₦${requiredAmount}, Available: ₦${walletBalance}`);
      }

      // Generate unique request ID (will be overridden with simple format below)
      const requestId = `Data_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Get token
      logger.info('About to generate token for data purchase', {
        hasUsername: !!this.username,
        hasPassword: !!this.password,
        baseURL: this.baseURL
      });
      
      let tokenData;
      try {
        tokenData = await this.generateToken();
        
        logger.info('Token generated for data purchase', {
          hasToken: !!tokenData.token,
          tokenLength: tokenData.token ? tokenData.token.length : 0,
          hasBalance: !!tokenData.balance,
          hasUsername: !!tokenData.username
        });
      } catch (tokenError) {
        logger.error('Token generation failed for data purchase', {
          error: tokenError.message,
          stack: tokenError.stack
        });
        throw new Error(`Token generation failed: ${tokenError.message}`);
      }

      // Purchase data via BILALSADASUB API
      // Remove country code from phone number but keep the leading 0 (Bilal expects 11 digits with leading 0)
      const cleanPhoneNumber = phoneNumber.replace(/^\+234/, '').replace(/^234/, '');
      
      // Generate simple request ID as per documentation format
      const simpleRequestId = `Data_${Date.now()}`;
      
      const payload = {
        network: networkId,
        phone: parseInt(cleanPhoneNumber), // Send as integer with leading 0 as per documentation
        data_plan: dataPlan.id,
        bypass: false,
        'request-id': simpleRequestId
      };

      logger.info('Making data purchase request to Bilal API', {
        payload,
        tokenLength: tokenData.token ? tokenData.token.length : 0,
        networkId,
        phoneNumber: cleanPhoneNumber,
        dataPlanId: dataPlan.id,
        dataPlanIdType: typeof dataPlan.id,
        dataPlanPrice: dataPlan.price,
        endpoint: '/data',
        method: 'POST',
        fullPayload: JSON.stringify(payload)
      });

      const response = await this.makeRequest('POST', '/data', payload, tokenData.token);

      logger.info('Bilal API response received', {
        status: response.status,
        responseKeys: Object.keys(response),
        hasAmount: !!response.amount,
        hasMessage: !!response.message,
        requestId: response['request-id']
      });

      if (response.status === 'success') {
        // Debit user wallet with actual amount
        const actualAmount = parseFloat(response.amount);
        
        await walletService.debitWallet(
          user.id,
          actualAmount,
          `Data purchase - ${response.network} ${response.dataplan} for ${response.phone_number}`,
          {
            category: 'data_purchase',
            network: response.network,
            phoneNumber: response.phone_number,
            dataPlan: response.dataplan,
            amount: actualAmount,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        // Log activity
        await ActivityLog.logUserActivity(
          user.id,
          'data_purchase',
          'data_purchased',
          {
            description: 'Data purchased successfully',
            network: response.network,
            phoneNumber: response.phone_number,
            dataPlan: response.dataplan,
            amount: actualAmount,
            provider: 'bilal',
            success: true,
            source: 'api'
          }
        );

        const successMessage = `✅ *Data Purchase Successful!*\n\n` +
          `Network: ${response.network}\n` +
          `Phone: ${response.phone_number}\n` +
          `Plan: ${response.dataplan}\n` +
          `Amount: ₦${response.amount}\n` +
          `Reference: ${response['request-id']}\n\n` +
          `${response.message}`;

        // Generate and send receipt
        let receiptSent = false;
        try {
          const receiptData = {
            network: response.network,
            phoneNumber: response.phone_number,
            dataPlan: response.dataplan,
            amount: response.amount,
            reference: response['request-id'],
            date: new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            status: 'Successful',
            discount: response.discount || 0
          };

          const receiptBuffer = await receiptService.generateDataReceipt(receiptData);
          await whatsappService.sendImageMessage(userPhoneNumber, receiptBuffer, 'receipt.jpg');
          receiptSent = true;
        } catch (receiptError) {
          logger.warn('Failed to generate data receipt, sending text message only', { error: receiptError.message });
          await whatsappService.sendTextMessage(userPhoneNumber, successMessage);
          receiptSent = true; // Mark as sent even if it's text fallback
        }

        logger.info('Data purchase successful', {
          userId: user.id,
          network: response.network,
          phoneNumber: response.phone_number,
          dataPlan: response.dataplan,
          amount: actualAmount,
          requestId: simpleRequestId
        });

        return {
          success: true,
          data: response,
          message: receiptSent ? null : successMessage // Only return message if receipt wasn't sent
        };

      } else {
        throw new Error(response.message || 'Data purchase failed');
      }

    } catch (error) {
      logger.error('Data purchase failed', { 
        error: error.message, 
        userId: user.id,
        dataData,
        errorType: error.name,
        errorCode: error.response?.status,
        errorResponse: error.response?.data
      });

      // Handle specific error types
      let userFriendlyMessage = 'Data purchase failed. Please try again or contact support.';
      
      if (error.response?.status === 403) {
        userFriendlyMessage = '❌ Data purchase failed!\n\nReason: Access denied (403). This could be due to:\n• Insufficient balance in provider account\n• Invalid plan ID or network combination\n• Service temporarily unavailable\n\nPlease try again later or contact support.';
      } else if (error.response?.status === 401) {
        userFriendlyMessage = '❌ Data purchase failed!\n\nReason: Authentication failed. Please contact support.';
      } else if (error.message.includes('Insufficient balance')) {
        userFriendlyMessage = `❌ Data purchase failed!\n\nReason: ${error.message}`;
      } else {
        userFriendlyMessage = `❌ Data purchase failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`;
      }

      await whatsappService.sendTextMessage(userPhoneNumber, userFriendlyMessage);
      
      throw error;
    }
  }

  // ELECTRICITY BILL SERVICE
  async payElectricityBill(user, billData, userPhoneNumber) {
    try {
      const { disco, meterType, meterNumber, amount, pin } = billData;

      // Require and validate 4-digit transaction PIN for ANY wallet debit
      if (!pin || !/^\d{4}$/.test(String(pin))) {
        throw new Error('Transaction PIN required. Please enter a valid 4-digit PIN.');
      }
      try {
        const userService = require('./user');
        await userService.validateUserPin(user.id, pin);
      } catch (pinErr) {
        throw new Error(pinErr.message || 'Invalid PIN. Please try again.');
      }
      
      // Validate disco
      const discoId = this.discoMapping[disco.toUpperCase()];
      if (!discoId) {
        throw new Error(`Unsupported disco: ${disco}`);
      }

      // Validate meter type
      if (!['prepaid', 'postpaid'].includes(meterType.toLowerCase())) {
        throw new Error('Meter type must be either "prepaid" or "postpaid"');
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const walletBalance = parseFloat(wallet.balance);
      const requiredAmount = parseFloat(amount);
      
      if (walletBalance < requiredAmount) {
        throw new Error(`Insufficient balance. Required: ₦${requiredAmount}, Available: ₦${walletBalance}`);
      }

      // Generate simple request ID as per documentation format
      const simpleRequestId = `Bill_${Date.now()}`;

      // Get token
      const tokenData = await this.generateToken();

      // Pay electricity bill via BILALSADASUB API
      const payload = {
        disco: discoId,
        meter_type: meterType.toLowerCase(),
        meter_number: meterNumber,
        amount: amount,
        bypass: false,
        'request-id': simpleRequestId
      };

      const response = await this.makeRequest('POST', '/bill', payload, tokenData.token);

      if (response.status === 'success') {
        // Debit user wallet with actual amount
        const actualAmount = parseFloat(response.amount);
        
        await walletService.debitWallet(
          user.id,
          actualAmount,
          `Electricity bill - ${response.disco_name} ${response.meter_type} for ${response.meter_number}`,
          {
            category: 'electricity_bill',
            disco: response.disco_name,
            meterType: response.meter_type,
            meterNumber: response.meter_number,
            amount: actualAmount,
            charges: response.charges,
            token: response.token,
            providerReference: response['request-id'],
            provider: 'bilal',
            bilalResponse: response
          }
        );

        // Log activity
        await ActivityLog.logUserActivity(
          user.id,
          'electricity_bill',
          'electricity_bill_paid',
          {
            description: 'Electricity bill paid successfully',
            disco: response.disco_name,
            meterType: response.meter_type,
            meterNumber: response.meter_number,
            amount: actualAmount,
            charges: response.charges,
            provider: 'bilal',
            success: true,
            source: 'api'
          }
        );

        let successMessage = `✅ *Electricity Bill Payment Successful!*\n\n` +
          `Disco: ${response.disco_name}\n` +
          `Meter Type: ${response.meter_type.toUpperCase()}\n` +
          `Meter Number: ${response.meter_number}\n` +
          `Amount: ₦${response.amount}\n` +
          `Charges: ₦${response.charges}\n` +
          `Reference: ${response['request-id']}\n\n` +
          `${response.message}`;

        if (response.token) {
          successMessage += `\n\n🔑 *Meter Token:* ${response.token}`;
        }

        // Generate and send receipt
        let receiptSent = false;
        try {
          const receiptData = {
            disco: response.disco_name,
            meterType: response.meter_type.toUpperCase(),
            meterNumber: response.meter_number,
            amount: response.amount,
            charges: response.charges,
            reference: response['request-id'],
            date: new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            status: 'Successful',
            token: response.token || null
          };

          const receiptBuffer = await receiptService.generateElectricityReceipt(receiptData);
          await whatsappService.sendImageMessage(userPhoneNumber, receiptBuffer, 'receipt.jpg');
          receiptSent = true;
        } catch (receiptError) {
          logger.warn('Failed to generate electricity receipt, sending text message only', { error: receiptError.message });
          await whatsappService.sendTextMessage(userPhoneNumber, successMessage);
          receiptSent = true; // Mark as sent even if it's text fallback
        }

        logger.info('Electricity bill payment successful', {
          userId: user.id,
          disco: response.disco_name,
          meterType: response.meter_type,
          meterNumber: response.meter_number,
          amount: actualAmount,
          requestId: simpleRequestId
        });

        return {
          success: true,
          data: response,
          message: receiptSent ? null : successMessage // Only return message if receipt wasn't sent
        };

      } else {
        throw new Error(response.message || 'Electricity bill payment failed');
      }

    } catch (error) {
      logger.error('Electricity bill payment failed', { 
        error: error.message, 
        userId: user.id,
        billData 
      });

      const errorMessage = `❌ Electricity bill payment failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`;
      await whatsappService.sendTextMessage(userPhoneNumber, errorMessage);
      
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

  // Get data plans for a specific network
  async getDataPlans(networkName) {
    try {
      // For now, return common plans as per BILALSADASUB documentation
      // In a real implementation, this would be fetched from their API
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

      return commonPlans[networkName.toUpperCase()] || commonPlans['MTN'];
    } catch (error) {
      logger.error('Failed to get data plans', { error: error.message, networkName });
      throw error;
    }
  }

  // Get available discos for electricity
  async getAvailableDiscos() {
    try {
      return Object.keys(this.discoMapping).map(name => ({
        name,
        id: this.discoMapping[name],
        label: name.charAt(0) + name.slice(1).toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to get available discos', { error: error.message });
      throw error;
    }
  }

  // Get available networks
  async getAvailableNetworks() {
    try {
      return Object.keys(this.networkMapping).map(name => ({
        name,
        id: this.networkMapping[name],
        label: name === '9MOBILE' ? '9mobile' : name.charAt(0) + name.slice(1).toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to get available networks', { error: error.message });
      throw error;
    }
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
        // Use token authentication for API calls (as per Bilal documentation)
        config.headers['Authorization'] = `Token ${token}`;
        logger.info('Using Token authentication for API call', {
          endpoint,
          tokenPrefix: token.substring(0, 20) + '...',
          tokenLength: token.length
        });
      } else {
        // Use Basic Authentication for token generation
        const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        config.headers['Authorization'] = `Basic ${credentials}`;
        logger.info('Using Basic authentication for token generation', {
          endpoint,
          hasUsername: !!this.username,
          hasPassword: !!this.password
        });
      }

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      logger.info('Making Bilal API request', {
        method,
        endpoint,
        url: config.url,
        timeout: config.timeout,
        hasData: !!data,
        hasHeaders: !!config.headers,
        dataKeys: data ? Object.keys(data) : 'null',
        headerKeys: config.headers ? Object.keys(config.headers) : 'null',
        contentType: config.headers['Content-Type'],
        authorizationHeader: config.headers['Authorization'] ? config.headers['Authorization'].substring(0, 20) + '...' : 'none',
        fullPayload: data ? JSON.stringify(data) : 'null'
      });

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
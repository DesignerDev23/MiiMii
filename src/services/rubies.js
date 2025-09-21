const axios = require('axios');
const logger = require('../utils/logger');
const { Transaction, ActivityLog, User, Wallet } = require('../models');
const { axiosConfig } = require('../utils/httpsAgent');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');
const RetryHelper = require('../utils/retryHelper');

class RubiesService {
  constructor() {
    // Rubies API URLs - from actual documentation
    this.devURL = 'https://api-sme-dev.rubies.ng/dev';
    this.productionURL = 'https://api-sme.rubies.ng'; // Production URL (to be confirmed)

    // Environment detection
    const overrideEnv = (process.env.RUBIES_ENV || process.env.APP_ENV || '').toLowerCase();
    const isProduction = overrideEnv
      ? overrideEnv === 'prod' || overrideEnv === 'production'
      : process.env.NODE_ENV === 'production';

    this.selectedEnvironment = isProduction ? 'production' : 'development';
    this.baseURL = isProduction ? this.productionURL : this.devURL;

    // Rubies API credentials - Uses Authorization header with API key (sk_test_ or sk_live_)
    this.apiKey = process.env.RUBIES_API_KEY;
    this.webhookSecret = process.env.RUBIES_WEBHOOK_SECRET;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Circuit breaker for Rubies API
    this.circuitBreaker = RetryHelper.createCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 300000, // 5 minutes
      monitoringPeriod: 60000, // 1 minute
      operationName: 'rubies_api'
    });

    // Safe runtime config log (no secrets leaked)
    const mask = (val) => {
      if (!val) return 'MISSING';
      const s = String(val);
      if (s.length <= 6) return `${s[0] || ''}***${s[s.length - 1] || ''}`;
      return `${s.slice(0, 8)}***${s.slice(-4)}`;
    };

    logger.info('RubiesService initialized', {
      nodeEnv: process.env.NODE_ENV || 'undefined',
      selectedEnvironment: this.selectedEnvironment,
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      apiKeyPreview: mask(this.apiKey),
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 7) : 'MISSING'
    });
  }

  async makeRequest(method, endpoint, data = {}, additionalHeaders = {}) {
    return await RetryHelper.retryBankApiCall(async () => {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < 200) {
        await new Promise(resolve => setTimeout(resolve, 200 - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      // Validate API key
      if (!this.apiKey) {
        throw new Error('RUBIES_API_KEY environment variable is required');
      }

      const config = {
        ...axiosConfig,
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          ...axiosConfig.headers,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Authorization': this.apiKey, // Direct API key as shown in documentation
          ...additionalHeaders
        },
        timeout: 30000
      };

      if (method.toLowerCase() === 'get') {
        config.params = data;
      } else {
        config.data = data;
      }

      logger.debug('Making Rubies API request', {
        method,
        endpoint,
        hasData: Object.keys(data).length > 0,
        environment: this.selectedEnvironment
      });

      const response = await axios(config);
      
      logger.debug('Rubies API response', {
        status: response.status,
        responseCode: response.data?.responseCode,
        endpoint
      });

      return response.data;
    }, {
      operationName: `rubies_${method.toLowerCase()}_${endpoint.replace(/\//g, '_')}`
    });
  }

  // BVN Validation Service - Based on baas-kyc section
  async validateBVN(bvnData) {
    try {
      const { bvn, firstName, lastName, dateOfBirth, phoneNumber } = bvnData;
      
      // Validate required fields
      if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
        throw new Error('Invalid BVN format. BVN must be exactly 11 digits.');
      }

      // Prepare payload based on Rubies documentation
      const payload = {
        bvn: bvn.toString().trim()
        // Additional fields may be added based on specific Rubies BVN validation requirements
      };

      logger.info('Starting Rubies BVN validation', {
        bvnMasked: `***${bvn.slice(-4)}`,
        environment: this.selectedEnvironment
      });

      // BVN validation endpoint - using working endpoint from test
      const response = await this.makeRequest('POST', '/baas-kyc/bvn-validation', payload);

      if (response.responseCode === '00') {
        logger.info('Rubies BVN validation successful', {
          bvnMasked: `***${bvn.slice(-4)}`,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        });

        // Log activity
        await ActivityLog.create({
          userId: bvnData.userId || null,
          activityType: 'kyc_verification', // Use valid ENUM value
          action: 'bvn_verification',
          details: {
            bvnMasked: `***${bvn.slice(-4)}`,
            provider: 'rubies',
            responseCode: response.responseCode,
            responseMessage: response.responseMessage,
            success: true
          },
          ipAddress: bvnData.ipAddress || null,
          userAgent: bvnData.userAgent || null
        });

        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage,
          bvn_data: response.data // Customer details from BVN
        };
      } else {
        throw new Error(response.responseMessage || 'BVN verification failed');
      }
    } catch (error) {
      logger.error('Rubies BVN validation error', {
        error: error.message,
        bvnMasked: bvnData.bvn ? `***${bvnData.bvn.slice(-4)}` : 'unknown'
      });

      // Log activity
      await ActivityLog.create({
        userId: bvnData.userId || null,
        activityType: 'kyc_verification', // Use valid ENUM value
        action: 'bvn_verification',
        details: {
          bvnMasked: bvnData.bvn ? `***${bvnData.bvn.slice(-4)}` : 'unknown',
          provider: 'rubies',
          success: false,
          error: error.message
        },
        ipAddress: bvnData.ipAddress || null,
        userAgent: bvnData.userAgent || null
      });

      throw error;
    }
  }

  // Virtual Account Service - Based on baas-virtual-account section
  async createVirtualAccount(userData) {
    try {
      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'phoneNumber', 'bvn'];
      for (const field of requiredFields) {
        if (!userData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Step 1: Get channel code first (required for virtual account creation)
      const channelResponse = await this.makeRequest('POST', '/baas-virtual-account/get-channel-code', {
        requestType: 'ALL'
      });

      if (channelResponse.responseCode !== '00') {
        throw new Error('Failed to get channel code: ' + channelResponse.responseMessage);
      }

      const channelData = channelResponse.data[0]; // Use first available channel

      // Step 2: Prepare payload based on Rubies documentation
      const payload = {
        accountAmountControl: 'EXACT', // Control type as per documentation
        accountParent: channelData.accountParent || '1000000267', // From channel or default
        accountType: 'DISPOSABLE', // Account type: DISPOSABLE or REUSABLE
        amount: '0', // Initial amount
        bvn: userData.bvn.toString().trim(),
        photo: userData.photo || '', // Optional photo (base64 string)
        validTime: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year validity in timestamp
        firstName: userData.firstName.trim(),
        gender: userData.gender || 'Male', // Gender as per documentation
        lastName: userData.lastName.trim(),
        phoneNumber: this.formatPhoneNumber(userData.phoneNumber),
        reference: userData.reference || `VA_${Date.now()}_${userData.userId}`
      };

      logger.info('Creating virtual account with Rubies', {
        userId: userData.userId,
        phoneNumber: payload.phoneNumber,
        reference: payload.reference,
        environment: this.selectedEnvironment
      });

      // Step 3: Initiate virtual account creation
      const response = await this.makeRequest('POST', '/baas-virtual-account/initiaiteCreateVirtualAccount', payload);

      if (response.responseCode === '00') {
        logger.info('Virtual account initiation successful, OTP sent', {
          userId: userData.userId,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage,
          reference: payload.reference
        });

        // Log activity
        await ActivityLog.logUserActivity(
          userData.userId,
          'wallet_funding',
          'virtual_account_initiated',
          {
            description: 'Virtual account creation initiated, OTP sent',
            provider: 'rubies',
            responseCode: response.responseCode,
            responseMessage: response.responseMessage,
            success: true,
            source: 'api',
            reference: payload.reference
          }
        );

        return {
          success: true,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage,
          reference: payload.reference,
          otpRequired: true,
          message: 'Virtual account creation initiated. OTP sent for verification.'
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to create virtual account');
      }
    } catch (error) {
      logger.error('Virtual account creation error', {
        userId: userData.userId,
        error: error.message,
        stack: error.stack
      });

      // Log activity
      await ActivityLog.logUserActivity(
        userData.userId,
        'wallet_funding',
        'virtual_account_created_error',
        {
          description: 'Virtual account creation error',
          provider: 'rubies',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      return {
        success: false,
        error: error.message,
        message: 'Virtual account creation failed due to technical issues. Please try again later or contact support.'
      };
    }
  }

  // Complete Virtual Account Creation (after OTP verification)
  async completeVirtualAccountCreation(otpData) {
    try {
      const payload = {
        reference: otpData.reference,
        otp: otpData.otp
      };

      const response = await this.makeRequest('POST', '/baas-virtual-account/completeVirtualAccountCreation', payload);

      if (response.responseCode === '00') {
        logger.info('Virtual account creation completed', {
          reference: otpData.reference,
          responseCode: response.responseCode
        });

        return {
          success: true,
          accountNumber: response.accountNumber,
          accountName: response.accountName,
          bankName: response.channelBankName || 'RUBIES MFB',
          bankCode: response.channelBankCode || '090175',
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to complete virtual account creation');
      }
    } catch (error) {
      logger.error('Complete virtual account creation error', { error: error.message });
      throw error;
    }
  }

  // Resend OTP for Virtual Account Creation
  async resendOtp(reference) {
    try {
      const payload = { reference };
      const response = await this.makeRequest('POST', '/baas-virtual-account/resendOtp', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to resend OTP');
      }
    } catch (error) {
      logger.error('Resend OTP error', { error: error.message });
      throw error;
    }
  }

  // Get Virtual Account Details
  async getVirtualAccount(accountNumber) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim()
      };

      const response = await this.makeRequest('POST', '/baas-virtual-account/getVirtualAccount', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          accountNumber: response.accountNumber,
          accountName: response.accountName,
          accountCurrency: response.accountCurrency,
          channelBankCode: response.channelBankCode,
          channelBankName: response.channelBankName,
          accountCreatedDate: response.accountCreatedDate,
          accountParent: response.accountParent,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to get virtual account');
      }
    } catch (error) {
      logger.error('Get virtual account error', { error: error.message, accountNumber });
      throw error;
    }
  }

  // Get Virtual Account List
  async getVirtualAccountList(payload = {}) {
    try {
      const response = await this.makeRequest('POST', '/baas-virtual-account/getVirtualAccountList', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to get virtual account list');
      }
    } catch (error) {
      logger.error('Get virtual account list error', { error: error.message });
      throw error;
    }
  }

  // Get Virtual Account Transaction List
  async getVirtualAccountTransactionList(accountNumber) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim()
      };

      const response = await this.makeRequest('POST', '/baas-virtual-account/getVirtualAccountTransactionList', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to get virtual account transaction list');
      }
    } catch (error) {
      logger.error('Get virtual account transaction list error', { error: error.message });
      throw error;
    }
  }

  // Transaction Services - Based on baas-Transaction section

  // Name Enquiry
  async nameEnquiry(accountNumber, bankCode) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim(),
        bankCode: bankCode.toString().trim()
      };

      logger.info('Making Rubies name enquiry', {
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        environment: this.selectedEnvironment
      });

      // Name enquiry endpoint - using working endpoint from test
      const response = await this.makeRequest('POST', '/baas-transaction/name-enquiry', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          accountName: response.accountName,
          accountNumber: response.accountNumber,
          bankCode: response.bankCode,
          bankName: response.bankName,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Name enquiry failed');
      }
    } catch (error) {
      logger.error('Rubies name enquiry failed', { 
        error: error.message, 
        accountNumber, 
        bankCode
      });
      throw error;
    }
  }

  // Fund Transfer
  async initiateTransfer(transferData) {
    try {
      // Validate transfer data
      const requiredFields = ['amount', 'accountNumber', 'bankCode', 'narration', 'reference'];
      for (const field of requiredFields) {
        if (!transferData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const payload = {
        amount: parseFloat(transferData.amount).toString(),
        accountNumber: transferData.accountNumber.toString().trim(),
        bankCode: transferData.bankCode.toString().trim(),
        narration: transferData.narration.trim(),
        reference: transferData.reference,
        beneficiaryName: transferData.beneficiaryName || '',
        senderName: transferData.senderName || 'MiiMii User'
      };

      logger.info('Initiating Rubies transfer', {
        amount: payload.amount,
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        reference: payload.reference,
        environment: this.selectedEnvironment
      });

      // Fund transfer endpoint - using working pattern from test
      const response = await this.makeRequest('POST', '/baas-transaction/fund-transfer', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          reference: response.reference || transferData.reference,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage,
          status: 'pending' // Rubies will send webhook for final status
        };
      } else {
        return {
          success: false,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage || 'Transfer failed'
        };
      }
    } catch (error) {
      logger.error('Rubies transfer failed', { error: error.message, transferData });
      
      return {
        success: false,
        message: error.message || 'Transfer processing failed',
        response: error.response?.data
      };
    }
  }

  // Get Bank List
  async getBankList() {
    try {
      logger.info('Fetching bank list from Rubies', {
        environment: this.selectedEnvironment
      });
      
      // Bank list endpoint - using working endpoint from test
      const response = await this.makeRequest('POST', '/baas-transaction/bank-list', {});

      if (response.responseCode === '00' && response.data) {
        const banks = response.data;
        
        logger.info('Successfully fetched bank list from Rubies', {
          bankCount: banks.length,
          environment: this.selectedEnvironment
        });

        return banks.map(bank => ({
          code: bank.bankCode || bank.code,
          name: bank.bankName || bank.name,
          slug: bank.bankCode || bank.code,
          type: 'commercial',
          category: 'deposit_money_bank'
        }));
      } else {
        throw new Error(response.responseMessage || 'Failed to fetch bank list');
      }
    } catch (error) {
      logger.error('Failed to get bank list from Rubies', { 
        error: error.message,
        environment: this.selectedEnvironment 
      });
      throw error;
    }
  }

  // Post Single Transaction
  async postSingleTransaction(transactionData) {
    try {
      const response = await this.makeRequest('POST', '/baas-Transaction/postSingleTransaction', transactionData);

      if (response.responseCode === '00') {
        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to post transaction');
      }
    } catch (error) {
      logger.error('Post single transaction error', { error: error.message });
      throw error;
    }
  }

  // TSQ (Transaction Status Query)
  async transactionStatusQuery(reference) {
    try {
      const payload = { reference };
      const response = await this.makeRequest('POST', '/baas-Transaction/tsq', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to query transaction status');
      }
    } catch (error) {
      logger.error('Transaction status query error', { error: error.message });
      throw error;
    }
  }

  // Wallet Services - Based on baas-wallet section

  // Wallet Balance Enquiry
  async getWalletBalance(accountNumber) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim()
      };

      const response = await this.makeRequest('POST', '/baas-wallet/wallet-balance-enquiry', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          accountBalance: response.accountBalance,
          accountLedgerBalance: response.accountLedgerBalance,
          accountBankCode: response.accountBankCode,
          accountBankName: response.accountBankName,
          accountBranchCode: response.accountBranchCode,
          accountCurrency: response.accountCurrency,
          accountCustomerPhone: response.accountCustomerPhone,
          accountName: response.accountName,
          accountNumber: response.accountNumber,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to get wallet balance');
      }
    } catch (error) {
      logger.error('Get wallet balance error', { error: error.message, accountNumber });
      throw error;
    }
  }

  // Retrieve Wallet Details
  async retrieveWalletDetails(accountNumber) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim()
      };

      const response = await this.makeRequest('POST', '/retrieve-wallet-details', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          accountId: response.accountId,
          accountCustomerId: response.accountCustomerId,
          accountNumber: response.accountNumber,
          accountName: response.accountName,
          accountCurrency: response.accountCurrency,
          accountBalance: response.accountBalance,
          accountStatus: response.accountStatus,
          accountLedgerBalance: response.accountLedgerBalance,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve wallet details');
      }
    } catch (error) {
      logger.error('Retrieve wallet details error', { error: error.message, accountNumber });
      throw error;
    }
  }

  // Read Wallet Transactions
  async readWalletTransactions(accountNumber, startDate, endDate, page = 0) {
    try {
      const payload = {
        accountNumber: accountNumber.toString().trim(),
        startDate: startDate, // Format: "2024-04-12"
        endDate: endDate, // Format: "2024-05-06"
        page: page
      };

      const response = await this.makeRequest('POST', '/baas-wallet/read-wallet-transaction', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          data: response.data,
          responseCode: response.responseCode,
          responseMessage: response.responseMessage
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to read wallet transactions');
      }
    } catch (error) {
      logger.error('Read wallet transactions error', { error: error.message, accountNumber });
      throw error;
    }
  }

  async getBankMapping() {
    try {
      const banks = await this.getBankList();
      
      // Create mapping from bank names to codes
      const bankMapping = {};
      banks.forEach(bank => {
        const lowerName = bank.name.toLowerCase();
        bankMapping[lowerName] = bank.code;
        
        // Add common variations
        if (lowerName.includes('guaranty trust')) bankMapping['gtbank'] = bank.code;
        if (lowerName.includes('first bank')) bankMapping['first'] = bank.code;
        if (lowerName.includes('access')) bankMapping['access'] = bank.code;
        if (lowerName.includes('zenith')) bankMapping['zenith'] = bank.code;
        if (lowerName.includes('united bank for africa')) bankMapping['uba'] = bank.code;
        if (lowerName.includes('fidelity')) bankMapping['fidelity'] = bank.code;
        if (lowerName.includes('union')) bankMapping['union'] = bank.code;
        if (lowerName.includes('wema')) bankMapping['wema'] = bank.code;
        if (lowerName.includes('sterling')) bankMapping['sterling'] = bank.code;
        if (lowerName.includes('ecobank')) bankMapping['ecobank'] = bank.code;
        if (lowerName.includes('fcmb')) bankMapping['fcmb'] = bank.code;
        if (lowerName.includes('stanbic')) bankMapping['stanbic'] = bank.code;
        if (lowerName.includes('keystone')) bankMapping['keystone'] = bank.code;
      });

      return { bankMapping, banks };
    } catch (error) {
      logger.error('Failed to get bank mapping from Rubies', { error: error.message });
      throw error;
    }
  }

  async getInstitutionCode(bankName) {
    try {
      const bankMapping = await this.getBankMapping();
      const lowerBankName = bankName.toLowerCase();
      
      // Try exact match first
      if (bankMapping.bankMapping[lowerBankName]) {
        return bankMapping.bankMapping[lowerBankName];
      }
      
      // Try partial match
      for (const [pattern, code] of Object.entries(bankMapping.bankMapping)) {
        if (lowerBankName.includes(pattern) || pattern.includes(lowerBankName)) {
          return code;
        }
      }
      
      throw new Error(`No institution code found for bank: ${bankName}`);
    } catch (error) {
      logger.error('Failed to get institution code from Rubies', { 
        bankName, 
        error: error.message 
      });
      throw error;
    }
  }

  // Webhook handling
  verifyWebhook(payload, signature) {
    try {
      if (!this.webhookSecret) {
        logger.warn('Rubies webhook secret not configured');
        return false;
      }

      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Webhook verification failed', { error: error.message });
      return false;
    }
  }

  async processWebhookEvent(event) {
    try {
      logger.info('Processing Rubies webhook event', {
        responseCode: event.responseCode,
        reference: event.reference || event.contractReference,
        environment: this.selectedEnvironment
      });

      // Process based on response code from Rubies documentation
      switch (event.responseCode) {
        case '00':
          await this.handleTransferSuccess(event);
          break;
        case '14':
        case '33':
          await this.handleTransferFailed(event);
          break;
        case '34':
          await this.handleSettlementRequired(event);
          break;
        case '-1':
          await this.handleTransferProcessing(event);
          break;
        default:
          logger.info('Unhandled Rubies webhook response code', { 
            responseCode: event.responseCode,
            responseMessage: event.responseMessage 
          });
      }
    } catch (error) {
      logger.error('Failed to process Rubies webhook event', { error: error.message, event });
      throw error;
    }
  }

  async handleTransferSuccess(data) {
    try {
      const reference = data.reference || data.contractReference || data.paymentReference;
      if (reference) {
        await Transaction.update(
          { 
            status: 'completed',
            processedAt: new Date(),
            providerResponse: data
          },
          { where: { reference } }
        );
        
        logger.info('Transfer marked as successful', { reference, provider: 'rubies' });
      }
    } catch (error) {
      logger.error('Failed to handle transfer success', { error: error.message, data });
    }
  }

  async handleTransferFailed(data) {
    try {
      const reference = data.reference || data.contractReference || data.paymentReference;
      if (reference) {
        await Transaction.update(
          { 
            status: 'failed',
            failureReason: data.responseMessage || data.message,
            processedAt: new Date(),
            providerResponse: data
          },
          { where: { reference } }
        );
        
        logger.info('Transfer marked as failed', { 
          reference, 
          reason: data.responseMessage, 
          provider: 'rubies' 
        });
      }
    } catch (error) {
      logger.error('Failed to handle transfer failure', { error: error.message, data });
    }
  }

  async handleSettlementRequired(data) {
    try {
      const reference = data.reference || data.contractReference || data.paymentReference;
      if (reference) {
        await Transaction.update(
          { 
            status: 'pending_settlement',
            failureReason: data.responseMessage || 'Settlement Required',
            processedAt: new Date(),
            providerResponse: data
          },
          { where: { reference } }
        );
        
        logger.info('Transfer marked as pending settlement', { 
          reference, 
          reason: data.responseMessage, 
          provider: 'rubies' 
        });
      }
    } catch (error) {
      logger.error('Failed to handle settlement required', { error: error.message, data });
    }
  }

  async handleTransferProcessing(data) {
    try {
      const reference = data.reference || data.contractReference || data.paymentReference;
      if (reference) {
        await Transaction.update(
          { 
            status: 'processing',
            processedAt: new Date(),
            providerResponse: data
          },
          { where: { reference } }
        );
        
        logger.info('Transfer marked as processing', { reference, provider: 'rubies' });
      }
    } catch (error) {
      logger.error('Failed to handle transfer processing', { error: error.message, data });
    }
  }

  async handleAccountCredit(data) {
    try {
      const accountNumber = data.accountNumber;
      const amount = parseFloat(data.amount);
      
      if (accountNumber && amount > 0) {
        // Find user by account number
        const user = await User.findOne({
          where: { accountNumber }
        });
        
        if (user) {
          // Credit wallet
          await walletService.creditWallet(
            user.id,
            amount,
            `Account credit - ${data.counterPartyAccountName || 'Bank Transfer'}`,
            {
              category: 'bank_transfer_in',
              providerReference: data.contractReference,
              senderName: data.counterPartyAccountName,
              senderAccount: data.counterPartyAccountNumber,
              provider: 'rubies'
            }
          );
          
          logger.info('Wallet credited from Rubies account credit', {
            userId: user.id,
            amount,
            reference: data.contractReference
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle Rubies account credit', { error: error.message, data });
    }
  }

  // Utility methods
  formatDateForRubies(dateStr) {
    // Format date for Rubies API
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  formatPhoneNumber(phone) {
    // Format phone number for Rubies API - Nigerian format without country code
    let normalized = phone.replace(/\D/g, '');
    
    // If it starts with 234, remove it and add 0
    if (normalized.startsWith('234')) {
      normalized = '0' + normalized.slice(3);
    }
    
    // If it doesn't start with 0, add it
    if (!normalized.startsWith('0')) {
      normalized = '0' + normalized;
    }
    
    return normalized;
  }
}

module.exports = new RubiesService();
const axios = require('axios');
const logger = require('../utils/logger');
const { Transaction, ActivityLog, User, Wallet } = require('../models');
const { axiosConfig } = require('../utils/httpsAgent');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');
const RetryHelper = require('../utils/retryHelper');

class BellBankService {
  constructor() {
    this.sandboxURL = 'https://sandbox-baas-api.bellmfb.com';
    this.productionURL = 'https://baas-api.bellmfb.com';

    // Allow override of environment via BELLBANK_ENV or APP_ENV
    const overrideEnv = (process.env.BELLBANK_ENV || process.env.APP_ENV || '').toLowerCase();
    const isProduction = overrideEnv
      ? overrideEnv === 'prod' || overrideEnv === 'production'
      : process.env.NODE_ENV === 'production';

    this.selectedEnvironment = isProduction ? 'production' : 'sandbox';
    this.baseURL = isProduction ? this.productionURL : this.sandboxURL;

    this.consumerKey = process.env.BANK_CONSUMER_KEY;
    this.consumerSecret = process.env.BANK_CONSUMER_SECRET;
    this.validityTime = 2880; // 48 hours in minutes
    this.token = null;
    this.tokenExpiry = null;
    this.webhookSecret = process.env.BELLBANK_WEBHOOK_SECRET;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Safe runtime config log (no secrets leaked)
    const mask = (val) => {
      if (!val) return 'MISSING';
      const s = String(val);
      if (s.length <= 6) return `${s[0] || ''}***${s[s.length - 1] || ''}`;
      return `${s.slice(0, 4)}***${s.slice(-2)}`;
    };

    logger.info('BellBankService initialized', {
      nodeEnv: process.env.NODE_ENV || 'undefined',
      appEnv: process.env.APP_ENV || 'undefined',
      bellbankEnvOverride: process.env.BELLBANK_ENV || 'undefined',
      selectedEnvironment: this.selectedEnvironment,
      baseURL: this.baseURL,
      hasConsumerKey: !!this.consumerKey,
      hasConsumerSecret: !!this.consumerSecret,
      consumerKeyPreview: mask(this.consumerKey),
      consumerSecretPreview: mask(this.consumerSecret)
    });
  }

  async generateToken() {
    try {
      logger.info('Generating BellBank token', {
        selectedEnvironment: this.selectedEnvironment,
        baseURL: this.baseURL,
        hasConsumerKey: !!this.consumerKey,
        hasConsumerSecret: !!this.consumerSecret
      });

      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      const response = await this.makeRequest('POST', '/v1/generate-token', {}, {
        'Content-Type': 'application/json',
        'consumerKey': this.consumerKey,
        'consumerSecret': this.consumerSecret,
        'validityTime': this.validityTime.toString()
      });

      if (response.success) {
        this.token = response.token;
        // Set expiry to 47 hours to refresh before actual expiry
        this.tokenExpiry = Date.now() + (this.validityTime - 60) * 60 * 1000;
        
        logger.info('BellBank token generated successfully', {
          tokenExpiry: new Date(this.tokenExpiry),
          environment: process.env.NODE_ENV
        });
        
        return this.token;
      } else {
        throw new Error(response.message || 'Failed to generate token');
      }
    } catch (error) {
      logger.error('Failed to generate BellBank token', { error: error.message });
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  async createVirtualAccount(userData) {
    try {
      const token = await this.generateToken();
      
      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'phoneNumber', 'bvn', 'gender', 'dateOfBirth'];
      for (const field of requiredFields) {
        if (!userData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Format date properly (BellBank expects YYYY/MM/DD)
      const formattedDate = this.formatDateForBellBank(userData.dateOfBirth);
      
      const payload = {
        firstname: userData.firstName.trim(),
        lastname: userData.lastName.trim(),
        middlename: userData.middleName?.trim() || '',
        phoneNumber: this.formatPhoneNumber(userData.phoneNumber),
        address: userData.address?.trim() || 'Nigeria',
        bvn: userData.bvn.toString().trim(),
        gender: userData.gender.toLowerCase(),
        dateOfBirth: formattedDate,
        metadata: {
          userId: userData.userId,
          createdAt: new Date().toISOString(),
          source: 'whatsapp_onboarding',
          ...userData.metadata
        }
      };

      logger.info('Creating virtual account with BellBank', {
        userId: userData.userId,
        phoneNumber: payload.phoneNumber,
        environment: process.env.NODE_ENV
      });

      // Use the correct endpoint from BellBank documentation
      const response = await this.makeRequest('POST', '/v1/account/clients/individual', payload, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        const accountData = response.data;
        
        logger.info('Virtual account created successfully', {
          userId: userData.userId,
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          bankName: accountData.bankName
        });

        // Log activity
        await ActivityLog.logUserActivity(
          userData.userId,
          'wallet_funding',
          'virtual_account_created',
          {
            description: 'Virtual account created successfully',
            accountNumber: accountData.accountNumber,
            accountName: accountData.accountName,
            bankName: accountData.bankName,
            provider: 'bellbank',
            success: true,
            source: 'api'
          }
        );

        return {
          success: true,
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          bankName: accountData.bankName,
          bankCode: accountData.bankCode,
          reference: accountData.reference,
          message: 'Virtual account created successfully'
        };
      } else {
        logger.error('Failed to create virtual account', {
          userId: userData.userId,
          error: response.message,
          response: response
        });

        // Log activity
        await ActivityLog.logUserActivity(
          userData.userId,
          'wallet_funding',
          'virtual_account_created_failed',
          {
            description: 'Failed to create virtual account',
            provider: 'bellbank',
            success: false,
            error: response.message || 'Unknown error',
            source: 'api'
          }
        );

        throw new Error(response.message || 'Failed to create virtual account');
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
          provider: 'bellbank',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      throw error;
    }
  }

  async getClientAccounts(externalReference) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('GET', `/v1/account/clients/${externalReference}/accounts`, {}, {
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          accounts: response.data.accounts || [],
          totalBalance: response.data.totalBalance || 0
        };
      } else {
        throw new Error(response.message || 'Failed to get client accounts');
      }
    } catch (error) {
      logger.error('Failed to get client accounts', { error: error.message, externalReference });
      throw error;
    }
  }

  async getAccountInfo(accountNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('GET', `/v1/account/info/${accountNumber}`, {}, {
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          accountInfo: response.data
        };
      } else {
        throw new Error(response.message || 'Failed to get account info');
      }
    } catch (error) {
      logger.error('Failed to get account info', { error: error.message, accountNumber });
      throw error;
    }
  }

  async nameEnquiryInternal(accountNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('POST', '/v1/transfer/name-enquiry/internal', {
        accountNumber: accountNumber.toString()
      }, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          accountName: response.data.accountName,
          accountNumber: response.data.accountNumber,
          bankCode: response.data.bankCode || '000023',
          bankName: response.data.bankName || 'BellMonie MFB'
        };
      } else {
        throw new Error(response.message || 'Name enquiry failed');
      }
    } catch (error) {
      logger.error('Internal name enquiry failed', { error: error.message, accountNumber });
      throw error;
    }
  }

  async nameEnquiry(accountNumber, bankCode) {
    try {
      const token = await this.generateToken();
      
      // According to BellBank docs, the endpoint should be /v1/transfer/name-enquiry
      // and the payload should match their specification
      const payload = {
        accountNumber: accountNumber.toString().padStart(10, '0'), // Ensure 10 digits
        bankCode: bankCode.toString()
      };

      logger.info('Making BellBank name enquiry', {
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        endpoint: '/v1/transfer/name-enquiry'
      });

      const response = await this.makeRequest('POST', '/v1/transfer/name-enquiry', payload, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      logger.info('BellBank name enquiry response', {
        success: response.success,
        hasData: !!response.data,
        accountName: response.data?.accountName || response.data?.account_name,
        bankName: response.data?.bankName || response.data?.bank_name
      });

      if (response.success && response.data) {
        return {
          success: true,
          accountName: response.data.accountName || response.data.account_name,
          accountNumber: response.data.accountNumber || response.data.account_number,
          bankCode: response.data.bankCode || response.data.bank_code,
          bankName: response.data.bankName || response.data.bank_name,
          sessionId: response.data.sessionId || response.data.session_id
        };
      } else {
        // Handle different error response formats
        const errorMessage = response.message || response.error || response.data?.message || 'Name enquiry failed';
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('External name enquiry failed', { 
        error: error.message, 
        accountNumber, 
        bankCode,
        stack: error.stack
      });
      throw error;
    }
  }

  async getBankList() {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('GET', '/v1/transfer/banks', {}, {
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          banks: response.data.banks || response.data
        };
      } else {
        throw new Error(response.message || 'Failed to get bank list');
      }
    } catch (error) {
      logger.error('Failed to get bank list', { error: error.message });
      throw error;
    }
  }

  async initiateTransfer(transferData) {
    try {
      const token = await this.generateToken();
      
      // Validate transfer data
      const requiredFields = ['amount', 'accountNumber', 'bankCode', 'narration', 'reference'];
      for (const field of requiredFields) {
        if (!transferData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const payload = {
        amount: parseFloat(transferData.amount),
        accountNumber: transferData.accountNumber.toString(),
        bankCode: transferData.bankCode.toString(),
        narration: transferData.narration.substring(0, 30), // BellBank limit
        reference: transferData.reference,
        sessionId: transferData.sessionId,
        metadata: {
          userId: transferData.userId,
          transactionId: transferData.transactionId,
          source: 'miimii_transfer',
          timestamp: new Date().toISOString()
        }
      };

      logger.info('Initiating BellBank transfer', {
        reference: transferData.reference,
        amount: transferData.amount,
        accountNumber: transferData.accountNumber,
        bankCode: transferData.bankCode
      });

      const response = await this.makeRequest('POST', '/v1/transfer', payload, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success) {
        logger.info('BellBank transfer initiated successfully', {
          reference: transferData.reference,
          providerReference: response.data?.reference,
          status: response.data?.status
        });

        return {
          success: true,
          providerReference: response.data?.reference,
          status: response.data?.status || 'pending',
          message: response.message,
          data: response.data
        };
      } else {
        throw new Error(response.message || 'Transfer initiation failed');
      }
    } catch (error) {
      logger.error('BellBank transfer initiation failed', {
        error: error.message,
        reference: transferData.reference,
        amount: transferData.amount
      });
      throw error;
    }
  }

  async requeryTransfer(reference) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('POST', '/v1/transfer/requery', {
        reference: reference
      }, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          status: response.data.status,
          reference: response.data.reference,
          amount: response.data.amount,
          accountNumber: response.data.accountNumber,
          bankCode: response.data.bankCode,
          accountName: response.data.accountName,
          narration: response.data.narration,
          fee: response.data.fee,
          completedAt: response.data.completedAt,
          failureReason: response.data.failureReason
        };
      } else {
        throw new Error(response.message || 'Transfer requery failed');
      }
    } catch (error) {
      logger.error('Transfer requery failed', { error: error.message, reference });
      throw error;
    }
  }

  async getAllTransactions(startDate, endDate, page = 1, limit = 50) {
    try {
      const token = await this.generateToken();
      
      const params = new URLSearchParams({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        page: page.toString(),
        limit: limit.toString()
      });

      const response = await this.makeRequest('GET', `/v1/transactions?${params}`, {}, {
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          transactions: response.data.transactions || [],
          pagination: {
            page: response.data.page || page,
            limit: response.data.limit || limit,
            total: response.data.total || 0,
            pages: response.data.pages || 1
          }
        };
      } else {
        throw new Error(response.message || 'Failed to get transactions');
      }
    } catch (error) {
      logger.error('Failed to get all transactions', { error: error.message });
      throw error;
    }
  }

  async getTransactionByReference(reference) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequest('GET', `/v1/transactions/${reference}`, {}, {
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          transaction: response.data
        };
      } else {
        throw new Error(response.message || 'Transaction not found');
      }
    } catch (error) {
      logger.error('Failed to get transaction by reference', { error: error.message, reference });
      throw error;
    }
  }

  // Webhook handling methods
  async handleWebhookNotification(webhookData) {
    try {
      logger.info('Processing BellBank webhook notification', { 
        type: webhookData.type,
        reference: webhookData.reference 
      });

      switch (webhookData.type) {
        case 'virtual_account.credit':
          return await this.handleVirtualAccountCredit(webhookData);
        case 'transfer.completed':
          return await this.handleTransferCompleted(webhookData);
        case 'transfer.failed':
          return await this.handleTransferFailed(webhookData);
        case 'transfer.reversed':
          return await this.handleTransferReversed(webhookData);
        default:
          logger.warn('Unknown BellBank webhook type', { type: webhookData.type, data: webhookData });
          return { success: false, message: 'Unknown webhook type' };
      }
    } catch (error) {
      logger.error('BellBank webhook processing failed', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  async handleVirtualAccountCredit(webhookData) {
    try {
      const { data } = webhookData;
      
      // Find the wallet associated with this virtual account
      const wallet = await Wallet.findOne({
        where: { virtualAccountNumber: data.accountNumber }
      });

      if (!wallet) {
        logger.warn('Wallet not found for virtual account credit', { 
          accountNumber: data.accountNumber 
        });
        return { success: false, message: 'Wallet not found' };
      }

      // Find the user
      const user = await User.findByPk(wallet.userId);
      if (!user) {
        logger.error('User not found for wallet', { walletId: wallet.id });
        return { success: false, message: 'User not found' };
      }

      // Check if transaction already exists to prevent double processing
      const existingTransaction = await Transaction.findOne({
        where: { providerReference: data.reference }
      });

      if (existingTransaction) {
        logger.info('Transaction already processed', { reference: data.reference });
        return { success: true, message: 'Transaction already processed' };
      }

      // Create credit transaction
      const transaction = await Transaction.create({
        reference: `WF_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: user.id,
        type: 'credit',
        category: 'wallet_funding',
        amount: parseFloat(data.amount),
        fee: 0,
        totalAmount: parseFloat(data.amount),
        currency: 'NGN',
        status: 'completed',
        description: `Wallet funding via ${data.senderName || 'bank transfer'}`,
        senderDetails: {
          name: data.senderName,
          bank: data.senderBank,
          accountNumber: data.senderAccountNumber
        },
        providerReference: data.reference,
        providerResponse: data,
        balanceBefore: parseFloat(wallet.balance),
        processedAt: new Date(),
        source: 'webhook',
        metadata: {
          webhookType: 'virtual_account.credit',
          fundingSource: 'bank_transfer',
          receivedAt: new Date(data.transactionDate)
        }
      });

      // Update wallet balance
      await wallet.updateBalance(data.amount, 'credit', 'Wallet funding');

      transaction.balanceAfter = parseFloat(wallet.balance);
      await transaction.save();

      // Log activity
      await ActivityLog.logTransactionActivity(
        transaction.id,
        user.id,
        'wallet_funding',
        'virtual_account_credited',
        {
          source: 'webhook',
          description: 'Virtual account credited from bank transfer',
          amount: data.amount,
          senderName: data.senderName,
          isSuccessful: true
        }
      );

      // Notify user via WhatsApp
      const fundingMessage = `💰 *Wallet Funded!*\n\n` +
                           `✅ Your wallet has been credited with ₦${parseFloat(data.amount).toLocaleString()}\n\n` +
                           `💳 From: ${data.senderName || 'Bank Transfer'}\n` +
                           `📄 Reference: ${data.reference}\n` +
                           `💰 New Balance: ₦${parseFloat(wallet.balance).toLocaleString()}\n\n` +
                           `You can now send money, buy airtime, or pay bills! 🎉`;

      await whatsappService.sendTextMessage(user.whatsappNumber, fundingMessage);

      logger.info('Virtual account credit processed successfully', {
        userId: user.id,
        amount: data.amount,
        reference: data.reference,
        newBalance: wallet.balance
      });

      return { 
        success: true, 
        message: 'Virtual account credit processed',
        transaction: transaction.getTransactionSummary()
      };

    } catch (error) {
      logger.error('Failed to process virtual account credit', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  async handleTransferCompleted(webhookData) {
    try {
      const { data } = webhookData;
      
      // Find the transaction by provider reference
      const transaction = await Transaction.findOne({
        where: { providerReference: data.reference }
      });

      if (!transaction) {
        logger.warn('Transaction not found for transfer completion', { 
          reference: data.reference 
        });
        return { success: false, message: 'Transaction not found' };
      }

      // Update transaction status
      await transaction.update({
        status: 'completed',
        processedAt: new Date(),
        providerResponse: data
      });

      // Find user and send notification
      const user = await User.findByPk(transaction.userId);
      if (user) {
        const completionMessage = `✅ *Transfer Successful!*\n\n` +
                                `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
                                `👤 To: ${transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber}\n` +
                                `
const axios = require('axios');
const logger = require('../utils/logger');
const { Transaction, ActivityLog, User, Wallet } = require('../models');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');

class BellBankService {
  constructor() {
    this.sandboxURL = 'https://sandbox-baas-api.bellmfb.com';
    this.productionURL = 'https://baas-api.bellmfb.com';
    this.baseURL = process.env.NODE_ENV === 'production' ? this.productionURL : this.sandboxURL;
    this.consumerKey = process.env.BELLBANK_CONSUMER_KEY;
    this.consumerSecret = process.env.BELLBANK_CONSUMER_SECRET;
    this.validityTime = 2880; // 48 hours in minutes
    this.token = null;
    this.tokenExpiry = null;
    this.webhookSecret = process.env.BELLBANK_WEBHOOK_SECRET;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  async generateToken() {
    try {
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

      const response = await this.makeRequest('POST', '/v1/account/clients/individual', payload, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        const accountData = response.data;
        
        // Log successful account creation
        await ActivityLog.logUserActivity(
          userData.userId,
          'wallet_funding',
          'virtual_account_created',
          {
            source: 'system',
            description: 'BellBank virtual account created successfully',
            accountNumber: accountData.accountNumber,
            accountName: accountData.accountName,
            externalReference: accountData.externalReference
          }
        );

        logger.info('BellBank virtual account created successfully', {
          userId: userData.userId,
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          externalReference: accountData.externalReference
        });

        return {
          success: true,
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          accountType: accountData.accountType || 'virtual',
          externalReference: accountData.externalReference,
          validityType: accountData.validityType || 'permanent',
          bankCode: '000023', // BellMonie bank code
          bankName: 'BellMonie MFB',
          provider: 'bellbank',
          createdAt: new Date(),
          metadata: accountData
        };
      } else {
        throw new Error(response.message || 'Account creation failed - no data returned');
      }
    } catch (error) {
      logger.error('Virtual account creation failed', { 
        error: error.message,
        userId: userData.userId,
        phoneNumber: userData.phoneNumber,
        stack: error.stack
      });
      
      // Log failed attempt
      if (userData.userId) {
        await ActivityLog.logUserActivity(
          userData.userId,
          'wallet_funding',
          'virtual_account_creation_failed',
          {
            source: 'system',
            description: 'BellBank virtual account creation failed',
            error: error.message,
            severity: 'error'
          }
        );
      }
      
      throw new Error(`Virtual account creation failed: ${error.message}`);
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
      
      const response = await this.makeRequest('POST', '/v1/transfer/name-enquiry', {
        accountNumber: accountNumber.toString(),
        bankCode: bankCode.toString()
      }, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      if (response.success && response.data) {
        return {
          success: true,
          accountName: response.data.accountName,
          accountNumber: response.data.accountNumber,
          bankCode: response.data.bankCode,
          bankName: response.data.bankName,
          sessionId: response.data.sessionId
        };
      } else {
        throw new Error(response.message || 'Name enquiry failed');
      }
    } catch (error) {
      logger.error('External name enquiry failed', { 
        error: error.message, 
        accountNumber, 
        bankCode 
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
                                `📄 Reference: ${transaction.reference}\n` +
                                `⏰ Completed: ${new Date().toLocaleString()}\n\n` +
                                `Thank you for using MiiMii! 🎉`;

        await whatsappService.sendTextMessage(user.whatsappNumber, completionMessage);
      }

      // Log activity
      await ActivityLog.logTransactionActivity(
        transaction.id,
        transaction.userId,
        'bank_transfer',
        'transfer_completed',
        {
          source: 'webhook',
          description: 'Bank transfer completed successfully',
          amount: transaction.amount,
          isSuccessful: true
        }
      );

      logger.info('Transfer completion processed successfully', {
        transactionId: transaction.id,
        reference: data.reference,
        amount: transaction.amount
      });

      return { 
        success: true, 
        message: 'Transfer completion processed',
        transaction: transaction.getTransactionSummary()
      };

    } catch (error) {
      logger.error('Failed to process transfer completion', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  async handleTransferFailed(webhookData) {
    try {
      const { data } = webhookData;
      
      // Find the transaction by provider reference
      const transaction = await Transaction.findOne({
        where: { providerReference: data.reference }
      });

      if (!transaction) {
        logger.warn('Transaction not found for transfer failure', { 
          reference: data.reference 
        });
        return { success: false, message: 'Transaction not found' };
      }

      // Update transaction status
      await transaction.update({
        status: 'failed',
        processedAt: new Date(),
        failureReason: data.failureReason || 'Transfer failed',
        providerResponse: data
      });

      // Refund the user's wallet if amount was debited
      if (transaction.balanceBefore !== null) {
        const wallet = await Wallet.findOne({ where: { userId: transaction.userId } });
        if (wallet) {
          await wallet.updateBalance(transaction.totalAmount, 'credit', 'Refund for failed transfer');
          
          // Create refund transaction
          await Transaction.create({
            reference: `RF_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            userId: transaction.userId,
            type: 'credit',
            category: 'refund',
            amount: parseFloat(transaction.totalAmount),
            fee: 0,
            totalAmount: parseFloat(transaction.totalAmount),
            currency: 'NGN',
            status: 'completed',
            description: `Refund for failed transfer ${transaction.reference}`,
            parentTransactionId: transaction.id,
            balanceBefore: parseFloat(wallet.balance) - parseFloat(transaction.totalAmount),
            balanceAfter: parseFloat(wallet.balance),
            processedAt: new Date(),
            source: 'system'
          });
        }
      }

      // Find user and send notification
      const user = await User.findByPk(transaction.userId);
      if (user) {
        const failureMessage = `❌ *Transfer Failed*\n\n` +
                             `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
                             `👤 To: ${transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber}\n` +
                             `📄 Reference: ${transaction.reference}\n` +
                             `❌ Reason: ${data.failureReason || 'Transfer failed'}\n\n` +
                             `Your wallet has been refunded. Please try again or contact support if this continues.`;

        await whatsappService.sendTextMessage(user.whatsappNumber, failureMessage);
      }

      // Log activity
      await ActivityLog.logTransactionActivity(
        transaction.id,
        transaction.userId,
        'bank_transfer',
        'transfer_failed',
        {
          source: 'webhook',
          description: 'Bank transfer failed',
          failureReason: data.failureReason,
          isSuccessful: false
        }
      );

      logger.info('Transfer failure processed successfully', {
        transactionId: transaction.id,
        reference: data.reference,
        failureReason: data.failureReason
      });

      return { 
        success: true, 
        message: 'Transfer failure processed',
        transaction: transaction.getTransactionSummary()
      };

    } catch (error) {
      logger.error('Failed to process transfer failure', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  async handleTransferReversed(webhookData) {
    try {
      const { data } = webhookData;
      
      // Find the original transaction
      const originalTransaction = await Transaction.findOne({
        where: { providerReference: data.originalReference }
      });

      if (!originalTransaction) {
        logger.warn('Original transaction not found for reversal', { 
          originalReference: data.originalReference 
        });
        return { success: false, message: 'Original transaction not found' };
      }

      // Create reversal transaction
      const reversalTransaction = await Transaction.create({
        reference: `RV_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: originalTransaction.userId,
        type: 'credit',
        category: 'refund',
        amount: parseFloat(originalTransaction.amount),
        fee: parseFloat(originalTransaction.fee),
        totalAmount: parseFloat(originalTransaction.totalAmount),
        currency: 'NGN',
        status: 'completed',
        description: `Reversal of transfer ${originalTransaction.reference}`,
        parentTransactionId: originalTransaction.id,
        providerReference: data.reference,
        providerResponse: data,
        processedAt: new Date(),
        source: 'webhook'
      });

      // Credit back to wallet
      const wallet = await Wallet.findOne({ where: { userId: originalTransaction.userId } });
      if (wallet) {
        reversalTransaction.balanceBefore = parseFloat(wallet.balance);
        await wallet.updateBalance(originalTransaction.totalAmount, 'credit', 'Transfer reversal');
        reversalTransaction.balanceAfter = parseFloat(wallet.balance);
        await reversalTransaction.save();
      }

      // Update original transaction
      await originalTransaction.update({
        status: 'reversed'
      });

      // Notify user
      const user = await User.findByPk(originalTransaction.userId);
      if (user) {
        const reversalMessage = `🔄 *Transfer Reversed*\n\n` +
                              `💰 Amount: ₦${parseFloat(originalTransaction.amount).toLocaleString()}\n` +
                              `📄 Original Reference: ${originalTransaction.reference}\n` +
                              `📄 Reversal Reference: ${reversalTransaction.reference}\n` +
                              `💰 Refunded to Wallet: ₦${parseFloat(originalTransaction.totalAmount).toLocaleString()}\n\n` +
                              `Your money has been refunded to your wallet.`;

        await whatsappService.sendTextMessage(user.whatsappNumber, reversalMessage);
      }

      logger.info('Transfer reversal processed successfully', {
        originalTransactionId: originalTransaction.id,
        reversalTransactionId: reversalTransaction.id,
        amount: originalTransaction.amount
      });

      return { 
        success: true, 
        message: 'Transfer reversal processed',
        reversalTransaction: reversalTransaction.getTransactionSummary()
      };

    } catch (error) {
      logger.error('Failed to process transfer reversal', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  // Utility methods
  async makeRequest(method, endpoint, data = {}, headers = {}) {
    try {
      // Rate limiting - ensure minimum 100ms between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < 100) {
        await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'User-Agent': 'MiiMii/1.0',
          'Accept': 'application/json',
          ...headers
        },
        timeout: 30000, // 30 seconds
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      };

      if (method === 'POST' || method === 'PUT') {
        config.data = data;
      } else if (method === 'GET' && Object.keys(data).length > 0) {
        config.params = data;
      }

      const response = await axios(config);
      
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data?.message || response.statusText}`);
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - BellBank service is slow to respond');
      } else if (error.response) {
        throw new Error(`BellBank API error: ${error.response.data?.message || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('No response from BellBank service - network error');
      } else {
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }

  formatPhoneNumber(phoneNumber) {
    // Convert to international format for BellBank
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('234')) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0')) {
      return `+234${cleaned.substring(1)}`;
    } else if (cleaned.length === 10) {
      return `+234${cleaned}`;
    } else {
      return `+234${cleaned}`;
    }
  }

  formatDateForBellBank(dateString) {
    // Convert DD/MM/YYYY to YYYY/MM/DD format
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          // DD/MM/YYYY format
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // Assume YYYY/MM/DD already
          return dateString;
        }
      }
    }
    
    // If it's a Date object or ISO string
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    }
    
    throw new Error('Invalid date format');
  }

  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      logger.warn('Webhook secret not configured - skipping signature verification');
      return true; // Allow if not configured (for development)
    }

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Webhook signature verification failed', { error: error.message });
      return false;
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const token = await this.generateToken();
      return { healthy: true, token: !!token };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

module.exports = new BellBankService();
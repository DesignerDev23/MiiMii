const axios = require('axios');
const logger = require('../utils/logger');

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
  }

  async generateToken() {
    try {
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(`${this.baseURL}/v1/generate-token`, {}, {
        headers: {
          'Content-Type': 'application/json',
          'consumerKey': this.consumerKey,
          'consumerSecret': this.consumerSecret,
          'validityTime': this.validityTime.toString()
        }
      });

      if (response.data.success) {
        this.token = response.data.token;
        // Set expiry to 47 hours to refresh before actual expiry
        this.tokenExpiry = Date.now() + (this.validityTime - 60) * 60 * 1000;
        
        logger.info('BellBank token generated successfully');
        return this.token;
      } else {
        throw new Error(response.data.message || 'Failed to generate token');
      }
    } catch (error) {
      logger.error('Failed to generate BellBank token', { error: error.message });
      throw error;
    }
  }

  async createVirtualAccount(userData) {
    try {
      const token = await this.generateToken();
      
      const payload = {
        firstname: userData.firstName,
        lastname: userData.lastName,
        middlename: userData.middleName || '',
        phoneNumber: userData.phoneNumber,
        address: userData.address,
        bvn: userData.bvn,
        gender: userData.gender,
        dateOfBirth: userData.dateOfBirth, // Format: 1993/12/29
        metadata: userData.metadata || {}
      };

      const response = await axios.post(`${this.baseURL}/v1/account/clients/individual`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const accountData = response.data.data;
        
        logger.info('BellBank virtual account created', {
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          userId: userData.userId
        });

        return {
          success: true,
          accountNumber: accountData.accountNumber,
          accountName: accountData.accountName,
          accountType: accountData.accountType,
          externalReference: accountData.externalReference,
          validityType: accountData.validityType,
          bankCode: '000023', // BellMonie bank code
          bankName: 'BellMonie'
        };
      } else {
        throw new Error(response.data.message || 'Failed to create virtual account');
      }
    } catch (error) {
      logger.error('Virtual account creation failed', { 
        error: error.message,
        userData: { ...userData, bvn: '***' + userData.bvn?.slice(-4) }
      });
      throw error;
    }
  }

  async getBankList() {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/transfer/banks`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get bank list');
      }
    } catch (error) {
      logger.error('Failed to get bank list', { error: error.message });
      throw error;
    }
  }

  async validateBankAccount(bankCode, accountNumber) {
    try {
      const token = await this.generateToken();
      
      const payload = {
        bankCode: bankCode,
        accountNumber: accountNumber
      };

      const response = await axios.post(`${this.baseURL}/v1/transfer/name-enquiry`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const data = response.data.data;
        
        return {
          valid: data.responseCode === '00',
          accountName: data.accountName,
          bvn: data.bvn,
          kycLevel: data.kycLevel,
          sessionID: data.sessionID,
          transactionId: data.transactionId
        };
      } else {
        return {
          valid: false,
          error: response.data.message
        };
      }
    } catch (error) {
      logger.error('Account validation failed', { 
        error: error.message,
        bankCode,
        accountNumber: '***' + accountNumber?.slice(-4)
      });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async initiateTransfer(transferData) {
    try {
      const token = await this.generateToken();
      
      const payload = {
        beneficiaryBankCode: transferData.bankCode,
        beneficiaryAccountNumber: transferData.accountNumber,
        narration: transferData.description || 'MiiMii transfer',
        amount: parseFloat(transferData.amount),
        reference: transferData.reference, // Should have business prefix
        senderName: transferData.senderName || 'MiiMii User'
      };

      const response = await axios.post(`${this.baseURL}/v1/transfer`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const data = response.data.data;
        
        logger.info('BellBank transfer initiated', {
          reference: data.reference,
          amount: data.amount,
          destinationAccountNumber: data.destinationAccountNumber,
          status: data.status
        });

        return {
          success: true,
          providerReference: data.reference,
          sessionId: data.sessionId,
          amount: data.amount,
          charge: data.charge,
          netAmount: data.netAmount,
          status: data.status,
          destinationAccountName: data.destinationAccountName,
          destinationBankName: data.destinationBankName,
          message: response.data.message
        };
      } else {
        throw new Error(response.data.message || 'Transfer failed');
      }
    } catch (error) {
      logger.error('Transfer initiation failed', { 
        error: error.message,
        transferData: { 
          ...transferData, 
          accountNumber: '***' + transferData.accountNumber?.slice(-4) 
        }
      });
      throw error;
    }
  }

  async getTransactionStatus(reference) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/transactions/reference/${reference}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const data = response.data.data;
        
        return {
          success: true,
          status: data.status,
          amount: data.amount,
          charge: data.charge,
          description: data.description,
          destinationAccountNumber: data.destinationAccountNumber,
          destinationAccountName: data.destinationAccountName,
          destinationBankName: data.destinationBankName,
          reference: data.reference,
          completedAt: data.completedAt,
          transactionTypeName: data.transactionTypeName
        };
      } else {
        throw new Error(response.data.message || 'Failed to get transaction status');
      }
    } catch (error) {
      logger.error('Failed to get transaction status', { 
        error: error.message,
        reference
      });
      throw error;
    }
  }

  async requeryTransfer(transactionId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/transfer/tsq?transactionId=${transactionId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const data = response.data.data;
        
        return {
          success: true,
          transactionStatus: data.transactionStatus,
          feedbackCode: data.feedbackCode,
          feedbackDescription: data.feedbackDescription
        };
      } else {
        throw new Error(response.data.message || 'Failed to requery transfer');
      }
    } catch (error) {
      logger.error('Transfer requery failed', { 
        error: error.message,
        transactionId
      });
      throw error;
    }
  }

  calculateTransferFee(amount) {
    const transferAmount = parseFloat(amount);
    
    // BellBank charges (based on their response structure)
    let bellbankFee = 10; // Standard BellBank fee from API response
    const platformFee = parseFloat(process.env.PLATFORM_FEE || 5);
    
    // Calculate total fees
    const totalFee = bellbankFee + platformFee;
    const totalAmount = transferAmount + totalFee;

    return {
      originalAmount: transferAmount,
      bellbankFee,
      platformFee,
      totalFee,
      totalAmount
    };
  }

  getBankCodeByName(bankName) {
    // Common Nigerian bank codes from BellBank documentation
    const bankMap = {
      'access': '000014',
      'access bank': '000014',
      'gtbank': '000013',
      'gtb': '000013',
      'guaranty trust bank': '000013',
      'zenith': '000015',
      'zenith bank': '000015',
      'first bank': '000016',
      'firstbank': '000016',
      'uba': '000018',
      'united bank for africa': '000018',
      'union bank': '000018',
      'fidelity': '000007',
      'fidelity bank': '000007',
      'sterling': '000021',
      'sterling bank': '000021',
      'fcmb': '000003',
      'first city monument bank': '000003',
      'unity bank': '000011',
      'keystone bank': '000002',
      'polaris bank': '000008',
      'stanbic ibtc': '000012',
      'wema bank': '000017',
      'wema': '000017',
      'providus bank': '000023',
      'bellmonie': '000023' // BellBank's own code
    };

    const normalizedName = bankName.toLowerCase().trim();
    return bankMap[normalizedName] || null;
  }

  // Handle webhook notification from BellBank
  handleWebhookNotification(webhookData) {
    try {
      const {
        event,
        reference,
        virtualAccount,
        externalReference,
        amountReceived,
        transactionFee,
        netAmount,
        stampDuty,
        sessionId,
        sourceCurrency,
        sourceAccountNumber,
        sourceAccountName,
        sourceBankCode,
        sourceBankName,
        remarks,
        destinationCurrency,
        status,
        createdAt,
        updatedAt
      } = webhookData;

      logger.info('BellBank webhook received', {
        event,
        reference,
        virtualAccount,
        amountReceived,
        status
      });

      return {
        event,
        reference,
        virtualAccount,
        externalReference,
        amount: parseFloat(amountReceived),
        fee: parseFloat(transactionFee || 0),
        netAmount: parseFloat(netAmount),
        stampDuty: parseFloat(stampDuty || 0),
        sessionId,
        sourceAccountNumber,
        sourceAccountName,
        sourceBankCode,
        sourceBankName,
        remarks,
        status,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt)
      };
    } catch (error) {
      logger.error('Failed to handle BellBank webhook', {
        error: error.message,
        webhookData
      });
      throw error;
    }
  }

  formatAccountNumber(accountNumber) {
    // Remove any non-digit characters
    return accountNumber.replace(/\D/g, '');
  }

  // Generate reference with business prefix as required by BellBank
  generateReference(prefix = 'MIIMII') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}${random}`;
  }
}

module.exports = new BellBankService();
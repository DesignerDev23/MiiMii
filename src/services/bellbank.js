const axios = require('axios');
const logger = require('../utils/logger');

class BellBankService {
  constructor() {
    this.baseURL = process.env.BELLBANK_API_URL;
    this.apiKey = process.env.BELLBANK_API_KEY;
    this.merchantId = process.env.BELLBANK_MERCHANT_ID;
  }

  async createVirtualAccount(user) {
    try {
      const payload = {
        merchant_id: this.merchantId,
        customer_id: user.id,
        customer_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.whatsappNumber,
        customer_email: user.email || `${user.whatsappNumber}@miimii.app`,
        customer_phone: user.whatsappNumber,
        webhook_url: `${process.env.BASE_URL}/webhook/bellbank`
      };

      const response = await this.makeRequest('POST', '/virtual-accounts', payload);

      logger.info('Virtual account created', {
        userId: user.id,
        accountNumber: response.data.account_number,
        bankName: response.data.bank_name
      });

      return {
        accountNumber: response.data.account_number,
        bankName: response.data.bank_name,
        accountName: response.data.account_name,
        reference: response.data.reference
      };
    } catch (error) {
      logger.error('Failed to create virtual account', {
        error: error.message,
        userId: user.id
      });
      throw error;
    }
  }

  async initiateTransfer(transferData) {
    try {
      const payload = {
        merchant_id: this.merchantId,
        amount: transferData.amount,
        recipient_bank_code: transferData.bankCode,
        recipient_account_number: transferData.accountNumber,
        recipient_name: transferData.accountName,
        narration: transferData.description || 'MiiMii Transfer',
        reference: transferData.reference,
        webhook_url: `${process.env.BASE_URL}/webhook/bellbank`
      };

      const response = await this.makeRequest('POST', '/transfers', payload);

      logger.info('Transfer initiated', {
        reference: transferData.reference,
        amount: transferData.amount,
        recipient: transferData.accountNumber
      });

      return {
        status: response.data.status,
        reference: response.data.reference,
        providerReference: response.data.provider_reference,
        message: response.data.message
      };
    } catch (error) {
      logger.error('Failed to initiate transfer', {
        error: error.message,
        reference: transferData.reference
      });
      throw error;
    }
  }

  async getBankList() {
    try {
      const response = await this.makeRequest('GET', '/banks');

      return response.data.banks.map(bank => ({
        code: bank.code,
        name: bank.name,
        slug: bank.slug
      }));
    } catch (error) {
      logger.error('Failed to get bank list', { error: error.message });
      throw error;
    }
  }

  async validateBankAccount(bankCode, accountNumber) {
    try {
      const payload = {
        bank_code: bankCode,
        account_number: accountNumber
      };

      const response = await this.makeRequest('POST', '/account-validation', payload);

      logger.info('Bank account validated', {
        bankCode,
        accountNumber,
        accountName: response.data.account_name
      });

      return {
        valid: response.data.valid,
        accountName: response.data.account_name,
        bankName: response.data.bank_name
      };
    } catch (error) {
      logger.error('Bank account validation failed', {
        error: error.message,
        bankCode,
        accountNumber
      });
      throw error;
    }
  }

  async getTransactionStatus(reference) {
    try {
      const response = await this.makeRequest('GET', `/transactions/${reference}`);

      return {
        status: response.data.status,
        reference: response.data.reference,
        amount: response.data.amount,
        fees: response.data.fees,
        completedAt: response.data.completed_at,
        failureReason: response.data.failure_reason
      };
    } catch (error) {
      logger.error('Failed to get transaction status', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  async getVirtualAccountTransactions(accountNumber, startDate = null, endDate = null) {
    try {
      const params = {
        account_number: accountNumber
      };

      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await this.makeRequest('GET', '/virtual-accounts/transactions', params);

      return response.data.transactions.map(transaction => ({
        reference: transaction.reference,
        amount: transaction.amount,
        description: transaction.description,
        senderName: transaction.sender_name,
        senderBank: transaction.sender_bank,
        createdAt: transaction.created_at,
        status: transaction.status
      }));
    } catch (error) {
      logger.error('Failed to get virtual account transactions', {
        error: error.message,
        accountNumber
      });
      throw error;
    }
  }

  async calculateTransferFee(amount) {
    try {
      const response = await this.makeRequest('POST', '/transfer-fees', { amount });

      const bellBankFee = parseFloat(response.data.fee);
      const platformFee = parseFloat(process.env.PLATFORM_FEE) || 5;
      const totalFee = bellBankFee + platformFee;

      return {
        bellBankFee,
        platformFee,
        totalFee,
        totalAmount: parseFloat(amount) + totalFee
      };
    } catch (error) {
      logger.error('Failed to calculate transfer fee', {
        error: error.message,
        amount
      });
      
      // Fallback fee calculation
      const bellBankFee = 20; // Default BellBank fee
      const platformFee = parseFloat(process.env.PLATFORM_FEE) || 5;
      const totalFee = bellBankFee + platformFee;

      return {
        bellBankFee,
        platformFee,
        totalFee,
        totalAmount: parseFloat(amount) + totalFee
      };
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);

      if (!response.data.success) {
        throw new Error(response.data.message || 'API request failed');
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        const apiError = error.response.data;
        throw new Error(apiError.message || `API Error: ${error.response.status}`);
      }
      throw error;
    }
  }

  // Helper method to get bank code by bank name
  getBankCodeByName(bankName) {
    const bankCodes = {
      'access bank': '044',
      'diamond bank': '063',
      'ecobank': '050',
      'fidelity bank': '070',
      'first bank': '011',
      'fcmb': '214',
      'gtbank': '058',
      'heritage bank': '030',
      'keystone bank': '082',
      'polaris bank': '076',
      'providus bank': '101',
      'stanbic ibtc': '221',
      'standard chartered': '068',
      'sterling bank': '232',
      'suntrust bank': '100',
      'uba': '033',
      'union bank': '032',
      'unity bank': '215',
      'wema bank': '035',
      'zenith bank': '057',
      'citibank': '023',
      'coronation bank': '559',
      'jaiz bank': '301',
      'parallex bank': '526',
      'taj bank': '302',
      'titan trust bank': '102'
    };

    const normalizedName = bankName.toLowerCase().trim();
    return bankCodes[normalizedName] || null;
  }

  // Method to format Nigerian bank account numbers
  formatAccountNumber(accountNumber) {
    const cleaned = accountNumber.replace(/\D/g, '');
    
    if (cleaned.length !== 10) {
      throw new Error('Account number must be 10 digits');
    }
    
    return cleaned;
  }
}

module.exports = new BellBankService();
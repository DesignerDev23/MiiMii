const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');
const bilalService = require('./bilal');
const feesService = require('./fees');
const RetryHelper = require('../utils/retryHelper');
const { ActivityLog } = require('../models');

class BillsService {
  constructor() {
    // Electricity discos supported by BILALSADASUB
    this.electricityDiscos = {
      'IKEJA': { id: 1, name: 'Ikeja Electricity', code: 'IKEJA' },
      'EKO': { id: 2, name: 'Eko Electricity', code: 'EKO' },
      'KANO': { id: 3, name: 'Kano Electricity', code: 'KANO' },
      'PORT HARCOURT': { id: 4, name: 'Port Harcourt Electricity', code: 'PHED' },
      'JOSS': { id: 5, name: 'Jos Electricity', code: 'JOSS' },
      'IBADAN': { id: 6, name: 'Ibadan Electricity', code: 'IBEDC' },
      'ENUGU': { id: 7, name: 'Enugu Electricity', code: 'EEDC' },
      'KADUNA': { id: 8, name: 'Kaduna Electricity', code: 'KEDCO' },
      'ABUJA': { id: 9, name: 'Abuja Electricity', code: 'AEDC' },
      'BENIN': { id: 10, name: 'Benin Electricity', code: 'BEDC' },
      'PHED': { id: 11, name: 'Port Harcourt Electricity', code: 'PHED' }
    };

    // Cable TV providers
    this.cableProviders = {
      'DSTV': { id: 1, name: 'DSTV', code: 'DSTV' },
      'GOTV': { id: 2, name: 'GOtv', code: 'GOTV' },
      'STARTIME': { id: 3, name: 'Startimes', code: 'STARTIME' }
    };

    // Bill payment limits
    this.limits = {
      electricity: { minimum: 100, maximum: 100000 },
      cable: { minimum: 100, maximum: 50000 }
    };
  }

  // Get all available electricity discos
  async getElectricityDiscos() {
    try {
      return Object.keys(this.electricityDiscos).map(key => ({
        name: this.electricityDiscos[key].name,
        code: this.electricityDiscos[key].code,
        id: this.electricityDiscos[key].id
      }));
    } catch (error) {
      logger.error('Failed to get electricity discos', { error: error.message });
      throw error;
    }
  }

  // Get all available cable providers
  async getCableProviders() {
    try {
      return Object.keys(this.cableProviders).map(key => ({
        name: this.cableProviders[key].name,
        code: this.cableProviders[key].code,
        id: this.cableProviders[key].id
      }));
    } catch (error) {
      logger.error('Failed to get cable providers', { error: error.message });
      throw error;
    }
  }

  // Validate meter number format
  validateMeterNumber(meterNumber, disco) {
    try {
      if (!meterNumber || meterNumber.length < 10) {
        throw new Error('Meter number must be at least 10 digits');
      }

      // Basic validation - in production, you might want to validate against specific disco formats
      const cleanMeterNumber = meterNumber.replace(/\D/g, '');
      if (cleanMeterNumber.length < 10) {
        throw new Error('Invalid meter number format');
      }

      return cleanMeterNumber;
    } catch (error) {
      logger.error('Meter number validation failed', { error: error.message, meterNumber, disco });
      throw error;
    }
  }

  // Validate IUC number for cable TV
  validateIUCNumber(iucNumber, provider) {
    try {
      if (!iucNumber || iucNumber.length < 8) {
        throw new Error('IUC number must be at least 8 digits');
      }

      const cleanIUCNumber = iucNumber.replace(/\D/g, '');
      if (cleanIUCNumber.length < 8) {
        throw new Error('Invalid IUC number format');
      }

      return cleanIUCNumber;
    } catch (error) {
      logger.error('IUC number validation failed', { error: error.message, iucNumber, provider });
      throw error;
    }
  }

  // Pay electricity bill
  async payElectricityBill(user, billData, userPhoneNumber) {
    try {
      const { disco, meterType, meterNumber, amount, pin } = billData;

      // Validate disco
      const discoInfo = this.electricityDiscos[disco.toUpperCase()];
      if (!discoInfo) {
        throw new Error(`Unsupported disco: ${disco}. Supported discos: ${Object.keys(this.electricityDiscos).join(', ')}`);
      }

      // Validate meter type
      if (!['prepaid', 'postpaid'].includes(meterType.toLowerCase())) {
        throw new Error('Meter type must be either "prepaid" or "postpaid"');
      }

      // Validate meter number
      const cleanMeterNumber = this.validateMeterNumber(meterNumber, disco);

      // Validate amount
      if (amount < this.limits.electricity.minimum || amount > this.limits.electricity.maximum) {
        throw new Error(`Amount must be between ₦${this.limits.electricity.minimum} and ₦${this.limits.electricity.maximum}`);
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      if (!wallet.canDebit(amount)) {
        throw new Error(`Insufficient balance. Required: ₦${amount}, Available: ₦${wallet.balance}`);
      }

      // Use bilal service to process the payment
      const result = await bilalService.payElectricityBill(user, {
        disco: discoInfo.name,
        meterType: meterType.toLowerCase(),
        meterNumber: cleanMeterNumber,
        amount: amount,
        pin: pin
      }, userPhoneNumber);

      return result;

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

  // Pay cable TV bill
  async payCableBill(user, billData, userPhoneNumber) {
    try {
      const { provider, iucNumber, planId, amount, pin } = billData;

      // Validate provider
      const providerInfo = this.cableProviders[provider.toUpperCase()];
      if (!providerInfo) {
        throw new Error(`Unsupported provider: ${provider}. Supported providers: ${Object.keys(this.cableProviders).join(', ')}`);
      }

      // Validate IUC number
      const cleanIUCNumber = this.validateIUCNumber(iucNumber, provider);

      // Validate amount
      if (amount < this.limits.cable.minimum || amount > this.limits.cable.maximum) {
        throw new Error(`Amount must be between ₦${this.limits.cable.minimum} and ₦${this.limits.cable.maximum}`);
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      if (!wallet.canDebit(amount)) {
        throw new Error(`Insufficient balance. Required: ₦${amount}, Available: ₦${wallet.balance}`);
      }

      // Use bilal service to process the payment
      const result = await bilalService.payCableBill(user, {
        cableProvider: providerInfo.name,
        iucNumber: cleanIUCNumber,
        planId: planId || 1,
        amount: amount,
        pin: pin
      }, userPhoneNumber);

      return result;

    } catch (error) {
      logger.error('Cable bill payment failed', { 
        error: error.message, 
        userId: user.id,
        billData 
      });

      const errorMessage = `❌ Cable bill payment failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`;
      await whatsappService.sendTextMessage(userPhoneNumber, errorMessage);
      
      throw error;
    }
  }

  // Get bill payment limits
  async getBillLimits() {
    try {
      return {
        limits: this.limits,
        electricityDiscos: await this.getElectricityDiscos(),
        cableProviders: await this.getCableProviders()
      };
    } catch (error) {
      logger.error('Failed to get bill limits', { error: error.message });
      throw error;
    }
  }

  // Validate bill payment data
  validateBillData(billData, billType) {
    try {
      const errors = [];

      if (billType === 'electricity') {
        if (!billData.disco) errors.push('Disco is required');
        if (!billData.meterType) errors.push('Meter type is required');
        if (!billData.meterNumber) errors.push('Meter number is required');
        if (!billData.amount) errors.push('Amount is required');
      } else if (billType === 'cable') {
        if (!billData.provider) errors.push('Provider is required');
        if (!billData.iucNumber) errors.push('IUC number is required');
        if (!billData.amount) errors.push('Amount is required');
      }

      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }

      return true;
    } catch (error) {
      logger.error('Bill data validation failed', { error: error.message, billData, billType });
      throw error;
    }
  }

  // Get bill payment history for a user
  async getBillPaymentHistory(userId, limit = 10) {
    try {
      const history = await ActivityLog.find({
        userId: userId,
        action: { $in: ['electricity_bill', 'cable_payment'] }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('action details createdAt');

      return history.map(record => ({
        type: record.action,
        details: record.details,
        date: record.createdAt,
        status: record.details.success ? 'success' : 'failed'
      }));
    } catch (error) {
      logger.error('Failed to get bill payment history', { error: error.message, userId });
      throw error;
    }
  }

  // Calculate bill payment fee
  calculateBillFee(amount, billType) {
    try {
      return feesService.calculateUtilityBillFee(amount, billType);
    } catch (error) {
      logger.error('Failed to calculate bill fee', { error: error.message, amount, billType });
      throw error;
    }
  }
}

module.exports = new BillsService();

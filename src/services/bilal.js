const axios = require('axios');
const logger = require('../utils/logger');
const walletService = require('./wallet');
const whatsappService = require('./whatsapp');

class BilalService {
  constructor() {
    this.baseURL = process.env.BILAL_API_URL;
    this.apiKey = process.env.BILAL_API_KEY;
    this.merchantId = process.env.BILAL_MERCHANT_ID;
  }

  async getAvailableServices() {
    try {
      const response = await this.makeRequest('GET', '/services');
      return response.data;
    } catch (error) {
      logger.error('Failed to get available services', { error: error.message });
      throw error;
    }
  }

  async getNetworkPlans(network) {
    try {
      const response = await this.makeRequest('GET', `/plans/${network.toLowerCase()}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get network plans', { error: error.message, network });
      throw error;
    }
  }

  async purchaseAirtime(user, purchaseData, userPhoneNumber) {
    try {
      const { amount, phoneNumber } = purchaseData;
      const network = this.detectNetwork(phoneNumber);
      
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

      // Create transaction reference
      const reference = walletService.generateReference();

      // Purchase airtime via Bilal API
      const payload = {
        network: network.toUpperCase(),
        phone: phoneNumber,
        amount: parseFloat(amount),
        reference: reference,
        callback_url: `${process.env.BASE_URL}/webhook/bilal`
      };

      const response = await this.makeRequest('POST', '/airtime', payload);

      if (response.success) {
        // Debit user wallet
        await walletService.debitWallet(
          user.id,
          totalCost,
          `Airtime purchase - ${network} ₦${amount} for ${phoneNumber}`,
          {
            category: 'airtime_purchase',
            network,
            phoneNumber,
            originalAmount: amount,
            fee: process.env.DATA_PURCHASE_FEE || 10,
            providerReference: response.data.reference,
            provider: 'bilal'
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Airtime Purchase Successful!*\n\n` +
          `Network: ${network.toUpperCase()}\n` +
          `Amount: ₦${amount}\n` +
          `Phone: ${phoneNumber}\n` +
          `Reference: ${reference}\n\n` +
          `Airtime will be delivered within 2 minutes.`
        );

        logger.info('Airtime purchase successful', {
          userId: user.id,
          amount,
          phoneNumber,
          network,
          reference
        });

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
      const { dataSize, amount, phoneNumber } = purchaseData;
      const network = this.detectNetwork(phoneNumber);
      
      // Get available data plans for the network
      const plans = await this.getNetworkPlans(network);
      let selectedPlan = null;

      if (dataSize) {
        // Find plan by data size (e.g., "2GB", "1GB")
        selectedPlan = plans.find(plan => 
          plan.size.toLowerCase().includes(dataSize.toLowerCase())
        );
      } else if (amount) {
        // Find plan by amount
        selectedPlan = plans.find(plan => 
          parseFloat(plan.price) === parseFloat(amount)
        );
      }

      if (!selectedPlan) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Data plan not found!\n\nAvailable plans for ${network.toUpperCase()}:\n` +
          plans.slice(0, 5).map(plan => 
            `• ${plan.size} - ₦${plan.price} (${plan.validity})`
          ).join('\n') +
          `\n\nPlease specify a valid plan.`
        );
        return;
      }

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      const totalCost = parseFloat(selectedPlan.price) + parseFloat(process.env.DATA_PURCHASE_FEE || 10);
      
      if (!wallet.canDebit(totalCost)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\nRequired: ₦${totalCost.toLocaleString()}\nAvailable: ₦${parseFloat(wallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Create transaction reference
      const reference = walletService.generateReference();

      // Purchase data via Bilal API
      const payload = {
        network: network.toUpperCase(),
        phone: phoneNumber,
        plan_id: selectedPlan.id,
        reference: reference,
        callback_url: `${process.env.BASE_URL}/webhook/bilal`
      };

      const response = await this.makeRequest('POST', '/data', payload);

      if (response.success) {
        // Debit user wallet
        await walletService.debitWallet(
          user.id,
          totalCost,
          `Data purchase - ${network} ${selectedPlan.size} for ${phoneNumber}`,
          {
            category: 'data_purchase',
            network,
            phoneNumber,
            planId: selectedPlan.id,
            dataSize: selectedPlan.size,
            originalAmount: selectedPlan.price,
            fee: process.env.DATA_PURCHASE_FEE || 10,
            providerReference: response.data.reference,
            provider: 'bilal'
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Data Purchase Successful!*\n\n` +
          `Network: ${network.toUpperCase()}\n` +
          `Plan: ${selectedPlan.size}\n` +
          `Phone: ${phoneNumber}\n` +
          `Validity: ${selectedPlan.validity}\n` +
          `Reference: ${reference}\n\n` +
          `Data will be delivered within 5 minutes.`
        );

        logger.info('Data purchase successful', {
          userId: user.id,
          plan: selectedPlan,
          phoneNumber,
          network,
          reference
        });

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

  async payUtilityBill(user, billData, userPhoneNumber) {
    try {
      const { utilityType, meterNumber, amount } = billData;
      
      // Validate meter number first
      const validation = await this.validateMeterNumber(utilityType, meterNumber);
      
      if (!validation.valid) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Invalid meter number!\n\nPlease check your ${utilityType.toUpperCase()} meter number and try again.`
        );
        return;
      }

      const billAmount = amount || validation.minimumAmount || 1000;
      
      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      
      if (!wallet.canDebit(billAmount)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\nRequired: ₦${billAmount.toLocaleString()}\nAvailable: ₦${parseFloat(wallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Create transaction reference
      const reference = walletService.generateReference();

      // Pay utility bill via Bilal API
      const payload = {
        service: utilityType.toLowerCase(),
        meter_number: meterNumber,
        amount: parseFloat(billAmount),
        customer_name: validation.customerName || `${user.firstName} ${user.lastName}`.trim(),
        reference: reference,
        callback_url: `${process.env.BASE_URL}/webhook/bilal`
      };

      const response = await this.makeRequest('POST', '/utility', payload);

      if (response.success) {
        // Debit user wallet
        await walletService.debitWallet(
          user.id,
          billAmount,
          `${utilityType.toUpperCase()} bill payment - ${meterNumber}`,
          {
            category: 'utility_payment',
            utilityType,
            meterNumber,
            customerName: validation.customerName,
            originalAmount: billAmount,
            providerReference: response.data.reference,
            provider: 'bilal'
          }
        );

        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `✅ *Bill Payment Successful!*\n\n` +
          `Service: ${utilityType.toUpperCase()}\n` +
          `Meter: ${meterNumber}\n` +
          `Customer: ${validation.customerName || 'N/A'}\n` +
          `Amount: ₦${billAmount.toLocaleString()}\n` +
          `Reference: ${reference}\n\n` +
          `Your payment has been processed successfully.`
        );

        logger.info('Utility payment successful', {
          userId: user.id,
          utilityType,
          meterNumber,
          amount: billAmount,
          reference
        });

      } else {
        throw new Error(response.message || 'Bill payment failed');
      }

    } catch (error) {
      logger.error('Utility payment failed', { 
        error: error.message, 
        userId: user.id,
        billData 
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `❌ Bill payment failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`
      );
      
      throw error;
    }
  }

  async validateMeterNumber(utilityType, meterNumber) {
    try {
      const response = await this.makeRequest('POST', '/validate-meter', {
        service: utilityType.toLowerCase(),
        meter_number: meterNumber
      });

      return {
        valid: response.success,
        customerName: response.data?.customer_name,
        address: response.data?.address,
        minimumAmount: response.data?.minimum_amount
      };
    } catch (error) {
      logger.error('Meter validation failed', { error: error.message, utilityType, meterNumber });
      return { valid: false };
    }
  }

  detectNetwork(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const prefix = cleanNumber.substring(0, 4);
    
    // Nigerian network prefixes
    const networkMap = {
      'MTN': ['0803', '0806', '0703', '0706', '0813', '0810', '0814', '0816', '0903', '0906'],
      'GLO': ['0805', '0807', '0705', '0815', '0811', '0905'],
      'AIRTEL': ['0802', '0808', '0708', '0812', '0701', '0902', '0901'],
      '9MOBILE': ['0809', '0817', '0818', '0909', '0908']
    };

    for (const [network, prefixes] of Object.entries(networkMap)) {
      if (prefixes.includes(prefix)) {
        return network;
      }
    }
    
    return 'MTN'; // Default to MTN if not detected
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

      // Bilal API returns success/error in response body
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
  async handleBilalSuccess(webhookData, serviceType) {
    try {
      const { reference, phone, amount, network } = webhookData;
      
      logger.info('Bilal service successful', {
        serviceType,
        reference,
        phone,
        amount,
        network
      });

      // Update transaction status if needed
      // This is already handled in the initial purchase, but webhook confirms it
      
    } catch (error) {
      logger.error('Failed to handle Bilal success webhook', {
        error: error.message,
        webhookData,
        serviceType
      });
    }
  }

  async handleBilalFailed(webhookData, serviceType) {
    try {
      const { reference, phone, amount, network, reason } = webhookData;
      
      logger.error('Bilal service failed', {
        serviceType,
        reference,
        phone,
        amount,
        network,
        reason
      });

      // Refund user if payment was already debited
      // Implementation would depend on your transaction tracking
      
    } catch (error) {
      logger.error('Failed to handle Bilal failure webhook', {
        error: error.message,
        webhookData,
        serviceType
      });
    }
  }

  // Get account balance from Bilal
  async getBalance() {
    try {
      const response = await this.makeRequest('GET', '/balance');
      return {
        balance: parseFloat(response.data.balance),
        currency: 'NGN'
      };
    } catch (error) {
      logger.error('Failed to get Bilal balance', { error: error.message });
      throw error;
    }
  }
}

module.exports = new BilalService();
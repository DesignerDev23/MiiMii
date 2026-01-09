const rubiesService = require('./rubies');
const logger = require('../utils/logger');
const userService = require('./user');
const transactionService = require('./transaction');
const activityLogger = require('./activityLogger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { supabase } = require('../database/connection');

class RubiesVasService {
  constructor() {
    this.rubiesService = rubiesService;
  }

  // Get all VAS categories (airtime, data, bills, etc.)
  async getCategories() {
    try {
      const payload = {
        request: 'ALL'
      };

      logger.info('Fetching VAS categories from Rubies');

      const response = await this.rubiesService.makeRequest('POST', '/baas-vas/get-categories', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          categories: response.data || [],
          message: 'Categories retrieved successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve categories');
      }
    } catch (error) {
      logger.error('Failed to fetch VAS categories', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve categories'
      };
    }
  }

  // Get products for a specific biller
  async getProducts(billerCode) {
    try {
      const payload = {
        billerCode: billerCode
      };

      logger.info('Fetching products for biller', { billerCode });

      const response = await this.rubiesService.makeRequest('POST', '/baas-vas/get-product', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          products: response.data || [],
          message: 'Products retrieved successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve products');
      }
    } catch (error) {
      logger.error('Failed to fetch products for biller', {
        billerCode,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve products'
      };
    }
  }

  // Purchase airtime
  async purchaseAirtime(userId, phoneNumber, network, amount, pin) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate amount
      const airtimeAmount = parseFloat(amount);
      if (airtimeAmount < 50 || airtimeAmount > 10000) {
        throw new Error('Airtime amount must be between ₦50 and ₦10,000');
      }

      // Get product code for airtime
      const productCode = this.getAirtimeProductCode(network);
      if (!productCode) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const reference = `AIR_${Date.now()}_${userId}`;
      const payload = {
        amount: airtimeAmount.toString(),
        billerCustomerId: phoneNumber.replace('+', ''),
        productCode: productCode,
        reference: reference
      };

      logger.info('Purchasing airtime via Rubies VAS', {
        userId,
        phoneNumber,
        network,
        amount: airtimeAmount,
        productCode,
        reference
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-vas/purchase', payload);

      if (response.responseCode === '00') {
        // Create transaction record
        const txnRecord = await transactionService.createTransaction(userId, {
          reference: reference,
          type: 'debit',
          category: 'airtime_purchase',
          amount: airtimeAmount,
          fee: 0,
          totalAmount: airtimeAmount,
          status: 'completed',
          description: `Airtime purchase for ${phoneNumber}`,
          metadata: {
            phoneNumber,
            network,
            productCode,
            rubiesReference: response.reference,
            provider: 'rubies_vas'
          }
        });

        // Log activity
        await activityLogger.logUserActivity(
          userId,
          'airtime_purchase',
          'airtime_purchased',
          {
            description: 'Airtime purchased successfully',
            provider: 'rubies_vas',
            success: true,
            amount: airtimeAmount,
            phoneNumber,
            network,
            reference: reference,
            source: 'api'
          }
        );

        await transaction.commit();

        logger.info('Airtime purchased successfully', {
          userId,
          phoneNumber,
          amount: airtimeAmount,
          reference: response.reference
        });

        return {
          success: true,
          reference: response.reference,
          amount: airtimeAmount,
          phoneNumber,
          network,
          message: 'Airtime purchased successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Airtime purchase failed');
      }
    } catch (error) {
      
      logger.error('Airtime purchase failed', {
        userId,
        phoneNumber,
        amount,
        error: error.message
      });

      // Log activity
      await ActivityLog.logUserActivity(
        userId,
        'airtime_purchase',
        'airtime_purchase_failed',
        {
          description: 'Airtime purchase failed',
          provider: 'rubies_vas',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      return {
        success: false,
        error: error.message,
        message: 'Airtime purchase failed. Please try again.'
      };
    }
  }

  // Purchase data bundle
  async purchaseData(userId, phoneNumber, network, planId, pin) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get data plan details
      const dataPlan = this.getDataPlan(network, planId);
      if (!dataPlan) {
        throw new Error('Invalid data plan selected');
      }

      // Get product code for data
      const productCode = this.getDataProductCode(network, dataPlan.size);
      if (!productCode) {
        throw new Error(`Unsupported network or data size: ${network}`);
      }

      const reference = `DATA_${Date.now()}_${userId}`;
      const payload = {
        amount: dataPlan.price.toString(),
        billerCustomerId: phoneNumber.replace('+', ''),
        productCode: productCode,
        reference: reference
      };

      logger.info('Purchasing data bundle via Rubies VAS', {
        userId,
        phoneNumber,
        network,
        planId,
        dataSize: dataPlan.size,
        price: dataPlan.price,
        productCode,
        reference
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-vas/purchase', payload);

      if (response.responseCode === '00') {
        // Create transaction record
        const txnRecord = await transactionService.createTransaction(userId, {
          reference: reference,
          type: 'debit',
          category: 'data_purchase',
          amount: dataPlan.price,
          fee: 0,
          totalAmount: dataPlan.price,
          status: 'completed',
          description: `Data bundle ${dataPlan.size} for ${phoneNumber}`,
          metadata: {
            phoneNumber,
            network,
            planId,
            dataSize: dataPlan.size,
            validity: dataPlan.validity,
            productCode,
            rubiesReference: response.reference,
            provider: 'rubies_vas'
          }
        });

        // Log activity
        await activityLogger.logUserActivity(
          userId,
          'data_purchase',
          'data_purchased',
          {
            description: 'Data bundle purchased successfully',
            provider: 'rubies_vas',
            success: true,
            amount: dataPlan.price,
            phoneNumber,
            network,
            dataSize: dataPlan.size,
            reference: reference,
            source: 'api'
          }
        );

        await transaction.commit();

        logger.info('Data bundle purchased successfully', {
          userId,
          phoneNumber,
          dataSize: dataPlan.size,
          price: dataPlan.price,
          reference: response.reference
        });

        return {
          success: true,
          reference: response.reference,
          amount: dataPlan.price,
          phoneNumber,
          network,
          dataSize: dataPlan.size,
          validity: dataPlan.validity,
          message: 'Data bundle purchased successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Data purchase failed');
      }
    } catch (error) {
      
      logger.error('Data bundle purchase failed', {
        userId,
        phoneNumber,
        planId,
        error: error.message
      });

      // Log activity
      await ActivityLog.logUserActivity(
        userId,
        'data_purchase',
        'data_purchase_failed',
        {
          description: 'Data bundle purchase failed',
          provider: 'rubies_vas',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      return {
        success: false,
        error: error.message,
        message: 'Data bundle purchase failed. Please try again.'
      };
    }
  }

  // Purchase bill payment (electricity, cable TV, etc.)
  async purchaseBill(userId, customerId, billerCode, productCode, amount, pin) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const billAmount = parseFloat(amount);
      if (billAmount < 100 || billAmount > 100000) {
        throw new Error('Bill amount must be between ₦100 and ₦100,000');
      }

      const reference = `BILL_${Date.now()}_${userId}`;
      const payload = {
        amount: billAmount.toString(),
        billerCustomerId: customerId,
        productCode: productCode,
        reference: reference
      };

      logger.info('Purchasing bill via Rubies VAS', {
        userId,
        customerId,
        billerCode,
        productCode,
        amount: billAmount,
        reference
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-vas/purchase', payload);

      if (response.responseCode === '00') {
        // Create transaction record
        const txnRecord = await transactionService.createTransaction(userId, {
          reference: reference,
          type: 'debit',
          category: 'bill_payment',
          amount: billAmount,
          fee: 0,
          totalAmount: billAmount,
          status: 'completed',
          description: `Bill payment for ${billerCode}`,
          metadata: {
            customerId,
            billerCode,
            productCode,
            rubiesReference: response.reference,
            provider: 'rubies_vas'
          }
        });

        // Log activity
        await activityLogger.logUserActivity(
          userId,
          'bill_payment',
          'bill_paid',
          {
            description: 'Bill payment successful',
            provider: 'rubies_vas',
            success: true,
            amount: billAmount,
            billerCode,
            customerId,
            reference: reference,
            source: 'api'
          }
        );

        await transaction.commit();

        logger.info('Bill payment successful', {
          userId,
          customerId,
          billerCode,
          amount: billAmount,
          reference: response.reference
        });

        return {
          success: true,
          reference: response.reference,
          amount: billAmount,
          customerId,
          billerCode,
          message: 'Bill payment successful'
        };
      } else {
        throw new Error(response.responseMessage || 'Bill payment failed');
      }
    } catch (error) {
      
      logger.error('Bill payment failed', {
        userId,
        customerId,
        billerCode,
        amount,
        error: error.message
      });

      // Log activity
      await ActivityLog.logUserActivity(
        userId,
        'bill_payment',
        'bill_payment_failed',
        {
          description: 'Bill payment failed',
          provider: 'rubies_vas',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      return {
        success: false,
        error: error.message,
        message: 'Bill payment failed. Please try again.'
      };
    }
  }

  // Helper methods for product codes
  getAirtimeProductCode(network) {
    const airtimeProducts = {
      'MTN': 'MTN_AIRTIME_PREPAID',
      'AIRTEL': 'AIRTEL_AIRTIME_PREPAID',
      'GLO': 'GLO_AIRTIME_PREPAID',
      '9MOBILE': '9MOBILE_AIRTIME_PREPAID'
    };
    return airtimeProducts[network.toUpperCase()];
  }

  getDataProductCode(network, dataSize) {
    const dataProducts = {
      'MTN': {
        '500MB': 'MTN_DATA_500MB',
        '1GB': 'MTN_DATA_1GB',
        '2GB': 'MTN_DATA_2GB',
        '3GB': 'MTN_DATA_3GB',
        '5GB': 'MTN_DATA_5GB'
      },
      'AIRTEL': {
        '500MB': 'AIRTEL_DATA_500MB',
        '1GB': 'AIRTEL_DATA_1GB',
        '2GB': 'AIRTEL_DATA_2GB'
      },
      'GLO': {
        '500MB': 'GLO_DATA_500MB',
        '1GB': 'GLO_DATA_1GB',
        '2GB': 'GLO_DATA_2GB'
      },
      '9MOBILE': {
        '500MB': '9MOBILE_DATA_500MB',
        '1GB': '9MOBILE_DATA_1GB',
        '2GB': '9MOBILE_DATA_2GB'
      }
    };
    return dataProducts[network.toUpperCase()]?.[dataSize];
  }

  getDataPlan(network, planId) {
    const dataPlans = {
      'MTN': [
        { id: 1, size: '500MB', price: 380, validity: '30 days' },
        { id: 2, size: '1GB', price: 620, validity: '30 days' },
        { id: 3, size: '2GB', price: 1240, validity: '30 days' },
        { id: 4, size: '3GB', price: 2200, validity: '30 days' },
        { id: 5, size: '5GB', price: 4500, validity: '30 days' }
      ],
      'AIRTEL': [
        { id: 1, size: '500MB', price: 400, validity: '30 days' },
        { id: 2, size: '1GB', price: 650, validity: '30 days' },
        { id: 3, size: '2GB', price: 1300, validity: '30 days' }
      ],
      'GLO': [
        { id: 1, size: '500MB', price: 350, validity: '30 days' },
        { id: 2, size: '1GB', price: 600, validity: '30 days' },
        { id: 3, size: '2GB', price: 1200, validity: '30 days' }
      ],
      '9MOBILE': [
        { id: 1, size: '500MB', price: 400, validity: '30 days' },
        { id: 2, size: '1GB', price: 650, validity: '30 days' },
        { id: 3, size: '2GB', price: 1300, validity: '30 days' }
      ]
    };
    
    const plans = dataPlans[network.toUpperCase()];
    return plans?.find(plan => plan.id === parseInt(planId));
  }
}

module.exports = new RubiesVasService();

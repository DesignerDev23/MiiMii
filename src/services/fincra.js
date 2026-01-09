const axios = require('axios');
const logger = require('../utils/logger');
const { axiosConfig } = require('../utils/httpsAgent');
const activityLogger = require('./activityLogger');
const { v4: uuidv4 } = require('uuid');
const RetryHelper = require('../utils/retryHelper');
const config = require('../config');

class FincraService {
  constructor() {
    this.sandboxURL = 'https://sandboxapi.fincra.com';
    this.productionURL = 'https://api.fincra.com';
    this.baseURL = process.env.NODE_ENV === 'production' ? this.productionURL : this.sandboxURL;
    
    const fincraConfig = config.getFincraConfig();
    this.apiKey = fincraConfig.apiKey;
    this.secretKey = fincraConfig.secretKey;
    this.businessId = fincraConfig.businessId;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  async makeRequest(method, endpoint, data = {}, headers = {}) {
    return await RetryHelper.retryBankApiCall(async () => {
      // Rate limiting - wait at least 100ms between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < 100) {
        await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      const config = {
        ...axiosConfig,
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          ...axiosConfig.headers,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          ...headers
        }
      };

      if (method.toLowerCase() === 'get') {
        config.params = data;
      } else {
        config.data = data;
      }

      logger.debug('Making Fincra API request', {
        method,
        endpoint,
        hasData: Object.keys(data).length > 0
      });

      const response = await axios(config);
      
      logger.debug('Fincra API response', {
        status: response.status,
        success: response.data?.success,
        endpoint
      });

      return response.data;
    }, {
      operationName: `fincra_${method.toLowerCase()}_${endpoint.replace(/\//g, '_')}`
    });
  }

  async validateBVN(bvnData) {
    try {
      const { bvn } = bvnData;
      
      // Validate required fields according to Fincra documentation
      if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
        throw new Error('Invalid BVN format. BVN must be exactly 11 digits.');
      }

      if (!this.businessId) {
        throw new Error('Fincra business ID is required for BVN resolution');
      }

      // Build the request payload according to Fincra BVN resolution API documentation
      const payload = {
        bvn: bvn.toString().trim(),
        business: this.businessId
      };

      logger.info('Starting Fincra BVN validation', {
        bvnMasked: `***${bvn.slice(-4)}`,
        businessId: this.businessId,
        environment: process.env.NODE_ENV
      });

      // Use the correct endpoint from Fincra documentation
      const response = await this.makeRequest('POST', '/core/bvn-verification', payload);

      if (response.success && response.data) {
        const verificationData = response.data;
        
        logger.info('Fincra BVN validation successful', {
          bvnMasked: `***${bvn.slice(-4)}`,
          verificationStatus: verificationData.verificationStatus,
          hasResponse: !!verificationData.response
        });

        // Log activity
        await activityLogger.logUserActivity(
          bvnData.userId || null,
          'kyc_verification',
          'bvn_verified',
          {
            bvnMasked: `***${bvn.slice(-4)}`,
            provider: 'fincra',
            status: verificationData.verificationStatus,
            success: true
          }
        );

        return {
          success: true,
          verificationStatus: verificationData.verificationStatus,
          data: verificationData.response,
          message: response.message || 'BVN verification successful'
        };
      } else {
        logger.error('Fincra BVN validation failed', {
          bvnMasked: `***${bvn.slice(-4)}`,
          response: response
        });

        // Log activity
        await activityLogger.logUserActivity(
          bvnData.userId || null,
          'kyc_verification',
          'bvn_verification_failed',
          {
            bvnMasked: `***${bvn.slice(-4)}`,
            provider: 'fincra',
            status: 'failed',
            success: false,
            error: response.message || 'Unknown error'
          }
        );

        return {
          success: false,
          message: response.message || 'BVN verification failed',
          data: null
        };
      }
    } catch (error) {
      logger.error('Fincra BVN validation error', {
        error: error.message,
        bvnMasked: bvnData.bvn ? `***${bvnData.bvn.slice(-4)}` : 'unknown',
        stack: error.stack
      });

      // Log activity
      await activityLogger.logUserActivity(
        bvnData.userId || null,
        'kyc_verification',
        'bvn_verification_error',
        {
          bvnMasked: bvnData.bvn ? `***${bvnData.bvn.slice(-4)}` : 'unknown',
          provider: 'fincra',
          status: 'error',
          success: false,
          error: error.message
        }
      );

      throw error;
    }
  }

  calculateMatchScore(inputData, bvnData) {
    let totalChecks = 0;
    let passedChecks = 0;

    // Name matching
    if (inputData.firstName && bvnData.firstName) {
      totalChecks++;
      if (this.normalizeString(inputData.firstName) === this.normalizeString(bvnData.firstName)) {
        passedChecks++;
      }
    }

    if (inputData.lastName && bvnData.lastName) {
      totalChecks++;
      if (this.normalizeString(inputData.lastName) === this.normalizeString(bvnData.lastName)) {
        passedChecks++;
      }
    }

    // Date of birth matching
    if (inputData.dateOfBirth && bvnData.dateOfBirth) {
      totalChecks++;
      if (this.normalizeDateString(inputData.dateOfBirth) === this.normalizeDateString(bvnData.dateOfBirth)) {
        passedChecks++;
      }
    }

    // Phone number matching
    if (inputData.phoneNumber && bvnData.phoneNumber) {
      totalChecks++;
      if (this.normalizePhoneNumber(inputData.phoneNumber) === this.normalizePhoneNumber(bvnData.phoneNumber)) {
        passedChecks++;
      }
    }

    return totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
  }

  validateNameMatch(inputData, bvnData) {
    if (!inputData.firstName || !inputData.lastName || !bvnData.firstName || !bvnData.lastName) {
      return false;
    }

    const firstNameMatch = this.normalizeString(inputData.firstName) === this.normalizeString(bvnData.firstName);
    const lastNameMatch = this.normalizeString(inputData.lastName) === this.normalizeString(bvnData.lastName);

    return firstNameMatch && lastNameMatch;
  }

  validateDobMatch(inputData, bvnData) {
    if (!inputData.dateOfBirth || !bvnData.dateOfBirth) {
      return false;
    }

    return this.normalizeDateString(inputData.dateOfBirth) === this.normalizeDateString(bvnData.dateOfBirth);
  }

  validatePhoneMatch(inputData, bvnData) {
    if (!inputData.phoneNumber || !bvnData.phoneNumber) {
      return false;
    }

    return this.normalizePhoneNumber(inputData.phoneNumber) === this.normalizePhoneNumber(bvnData.phoneNumber);
  }

  normalizeString(str) {
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  normalizeDateString(dateStr) {
    // Convert various date formats to YYYY-MM-DD
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().split('T')[0];
  }

  normalizePhoneNumber(phone) {
    // Remove all non-digits and ensure it starts with country code
    let normalized = phone.replace(/\D/g, '');
    
    // If it starts with 0, replace with 234
    if (normalized.startsWith('0')) {
      normalized = '234' + normalized.slice(1);
    }
    
    // If it doesn't start with 234, add it
    if (!normalized.startsWith('234')) {
      normalized = '234' + normalized;
    }
    
    return normalized;
  }

  formatDateForFincra(dateStr) {
    // Fincra expects YYYY-MM-DD format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date.toISOString().split('T')[0];
  }

  formatPhoneNumber(phone) {
    // Format phone number for Fincra API
    return this.normalizePhoneNumber(phone);
  }
}

module.exports = new FincraService();
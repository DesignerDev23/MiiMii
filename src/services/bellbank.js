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

    // Use different environment variables for production and sandbox
    if (isProduction) {
      this.consumerKey = process.env.BANK_CONSUMER_KEY || process.env.BELLBANK_PRODUCTION_CONSUMER_KEY;
      this.consumerSecret = process.env.BANK_CONSUMER_SECRET || process.env.BELLBANK_PRODUCTION_CONSUMER_SECRET;
    } else {
      this.consumerKey = process.env.BANK_CONSUMER_KEY || process.env.BELLBANK_SANDBOX_CONSUMER_KEY;
      this.consumerSecret = process.env.BANK_CONSUMER_SECRET || process.env.BELLBANK_SANDBOX_CONSUMER_SECRET;
    }

    this.validityTime = 2880; // 48 hours in minutes
    this.token = null;
    this.tokenExpiry = null;
    this.webhookSecret = process.env.BELLBANK_WEBHOOK_SECRET;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Bank mapping cache
    this.bankMappingCache = null;
    this.bankMappingExpiry = null;

    // Circuit breaker for BellBank API
    this.circuitBreaker = RetryHelper.createCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 300000, // 5 minutes
      monitoringPeriod: 60000, // 1 minute
      operationName: 'bellbank_api'
    });

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
      consumerSecretPreview: mask(this.consumerSecret),
      envVarsChecked: [
        'BANK_CONSUMER_KEY',
        'BANK_CONSUMER_SECRET',
        'BELLBANK_PRODUCTION_CONSUMER_KEY',
        'BELLBANK_PRODUCTION_CONSUMER_SECRET',
        'BELLBANK_SANDBOX_CONSUMER_KEY',
        'BELLBANK_SANDBOX_CONSUMER_SECRET'
      ]
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

      // Validate that consumer key and secret are set
      if (!this.consumerKey || !this.consumerKey.trim()) {
        throw new Error('BANK_CONSUMER_KEY environment variable is not set or is empty');
      }

      if (!this.consumerSecret || !this.consumerSecret.trim()) {
        throw new Error('BANK_CONSUMER_SECRET environment variable is not set or is empty');
      }

      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      // BellBank API expects consumerKey, consumerSecret, and validityTime in the request headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MiiMii/1.0',
        'consumerKey': this.consumerKey.trim(), // As per documentation
        'consumerSecret': this.consumerSecret.trim(), // As per documentation
        'validityTime': this.validityTime.toString() // As per documentation
      };

      // The payload for generate-token endpoint is empty as per documentation
      const payload = {}; 

      const response = await this.makeRequestWithRetry('POST', '/v1/generate-token', payload, headers);

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

      // Use retry logic for virtual account creation
      const response = await this.makeRequestWithRetry('POST', '/v1/account/clients/individual', payload, {
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

        // Return failure instead of throwing to allow graceful handling
        return {
          success: false,
          error: response.message || 'Failed to create virtual account',
          message: 'Virtual account creation failed. Please try again later or contact support.'
        };
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

      // Return failure instead of throwing to allow graceful handling
      return {
        success: false,
        error: error.message,
        message: 'Virtual account creation failed due to technical issues. Please try again later or contact support.'
      };
    }
  }

  async getClientAccounts(externalReference) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequestWithRetry('GET', `/v1/account/clients/${externalReference}/accounts`, {}, {
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
      
      const response = await this.makeRequestWithRetry('GET', `/v1/account/info/${accountNumber}`, {}, {
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
      
      const response = await this.makeRequestWithRetry('POST', '/v1/transfer/name-enquiry/internal', {
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
      
      // Convert bank code to institution code if it's not already 6 digits
      let institutionCode = bankCode;
      if (bankCode && bankCode.length !== 6) {
        // If it's a 3-digit code, we need to convert it
        // For now, we'll use a simple mapping for common banks
        const codeMapping = {
          '082': '000082', // Keystone Bank
          '044': '000044', // Access Bank
          '011': '000011', // First Bank
          '058': '000058', // GTBank
          '057': '000057', // Zenith Bank
          '070': '000070', // Fidelity Bank
          '032': '000032', // Union Bank
          '035': '000035', // Wema Bank
          '232': '000232', // Sterling Bank
          '050': '000050', // Ecobank
          '214': '000214', // FCMB
          '221': '000221', // Stanbic IBTC
          '068': '000068', // Standard Chartered
          '023': '000023', // Citibank
          '030': '000030', // Heritage Bank
          '215': '000215', // Unity Bank
          '084': '000084', // Enterprise Bank
          '033': '000033'  // UBA
        };
        
        institutionCode = codeMapping[bankCode] || bankCode;
        logger.info('Converted bank code to institution code', {
          originalCode: bankCode,
          institutionCode
        });
      }
      
      // According to BellBank docs, the endpoint should be /v1/transfer/name-enquiry
      // and the payload should match their specification
      const payload = {
        accountNumber: accountNumber.toString().trim(), // Don't pad, use as-is
        bankCode: institutionCode.toString() // Use 6-digit institution code
      };

      // Log the exact payload being sent for debugging
      logger.info('BellBank name enquiry payload', {
        payload,
        accountNumberLength: payload.accountNumber.length,
        bankCodeLength: payload.bankCode.length
      });

      logger.info('Making BellBank name enquiry', {
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        originalBankCode: bankCode,
        endpoint: '/v1/transfer/name-enquiry'
      });

      const response = await this.makeRequestWithRetry('POST', '/v1/transfer/name-enquiry', payload, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });

      logger.info('BellBank name enquiry response', {
        success: response.success,
        hasData: !!response.data,
        accountName: response.data?.accountName || response.data?.account_name,
        bankName: response.data?.bankName || response.data?.bank_name,
        fullResponse: response // Log the full response for debugging
      });

      if (response.success && response.data) {
        return {
          success: true,
          accountName: response.data.accountName || response.data.account_name,
          accountNumber: response.data.accountNumber || response.data.account_number,
          bankCode: response.data.bankCode || response.data.bank_code,
          bankName: response.data.bankName || response.data.bank_name || response.data.bank,
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
      
      const response = await this.makeRequestWithRetry('GET', '/v1/transfer/banks', {}, {
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

  // Get bank mapping with caching
  async getBankMapping() {
    try {
      // Check if we have a valid cached mapping
      if (this.bankMappingCache && this.bankMappingExpiry && Date.now() < this.bankMappingExpiry) {
        return this.bankMappingCache;
      }

      logger.info('Fetching bank mapping from BellBank API');
      
      const bankListResponse = await this.getBankList();
      
      if (!bankListResponse.success || !bankListResponse.banks) {
        throw new Error('Failed to get bank list from BellBank API');
      }

      // Create mapping from bank names to institution codes
      const bankMapping = {};
      const bankNameMapping = {};
      
      for (const bank of bankListResponse.banks) {
        if (bank.institutionCode && bank.institutionName) {
          // Map by exact institution name
          bankMapping[bank.institutionName.toLowerCase()] = bank.institutionCode;
          
          // Map by common bank name variations
          const commonNames = this.getBankNameVariations(bank.institutionName);
          for (const name of commonNames) {
            bankMapping[name.toLowerCase()] = bank.institutionCode;
          }
          
          // Store reverse mapping
          bankNameMapping[bank.institutionCode] = bank.institutionName;
        }
      }

      // Cache the mapping for 1 hour
      this.bankMappingCache = {
        bankMapping,
        bankNameMapping,
        banks: bankListResponse.banks
      };
      this.bankMappingExpiry = Date.now() + (60 * 60 * 1000); // 1 hour

      logger.info('Bank mapping updated', {
        totalBanks: bankListResponse.banks.length,
        mappingEntries: Object.keys(bankMapping).length
      });

      return this.bankMappingCache;
    } catch (error) {
      logger.error('Failed to get bank mapping', { error: error.message });
      
      // Return fallback mapping for common banks
      return this.getFallbackBankMapping();
    }
  }

  /**
   * Resolve institution code by flexible input:
   * - Full or partial bank name (case-insensitive)
   * - First 3 letters prefix (e.g., "mon" → Moniepoint)
   * - Common misspellings/synonyms (moniepoint/monipoint)
   * - 3-digit CBN code → mapped to 6-digit when possible
   */
  async resolveInstitutionCode(input) {
    if (!input) return null;

    const raw = String(input).trim().toLowerCase();

    // Ignore pure numeric tokens (prevents mapping amounts like "100" -> 000100)
    if (/^\d+$/.test(raw)) {
      return null;
    }

    // Skip generic words that commonly appear in messages
    const genericWords = new Set([
      'bank','account','acct','acc','number','no','acctno','accno','send','transfer','to','for','the','my','your',
      'amount','money','naira','fee','charges','pin','yes','no','confirm','confirmation','receipt','reference','ref',
      'successful','success','completed','complete','please','help','buy','pay','data','airtime','bill','bills',
      'recipient','name','mr','mrs','ms','sir','ma','and','on','in','of','with','at','from','via'
    ]);
    if (genericWords.has(raw)) {
      return null;
    }

    // If already a 6-digit institution code
    if (/^\d{6}$/.test(raw)) {
      return raw;
    }

    // If 3-digit bank code (CBN style), try convert using mappings used by nameEnquiry/initiateTransfer
    if (/^\d{3}$/.test(raw)) {
      const codeMapping = {
        '082': '000082', '044': '000044', '014': '000014', '011': '000016', '058': '000058', '057': '000057',
        '070': '000070', '032': '000032', '035': '000035', '232': '000232', '050': '000050', '214': '000214',
        '221': '000221', '068': '000068', '023': '000023', '030': '000030', '215': '000215', '084': '000084',
        '033': '000033', '090': '000090', '091': '000091', '092': '000092', '093': '000093', '094': '000094',
        '095': '000095', '096': '000096', '097': '000097', '098': '000098', '099': '000099', '100': '000100',
        '101': '000101', '102': '000102', '103': '000103', '104': '000104', '105': '000105', '106': '000106'
      };
      return codeMapping[raw] || null;
    }

    // Normalize common synonyms/misspellings
    let normalized = raw
      .replace(/moni[e]?point|monipoint/gi, 'moniepoint')
      .replace(/gtb|gt bank|guaranty\s*trust/gi, 'gtbank')
      .replace(/first\s*bank(?:\s*of\s*nigeria)?|firstbank|fbn/gi, 'first bank')
      .replace(/stanbic\s*ibtc|ibtc/gi, 'stanbic ibtc')
      .replace(/eco\s*bank/gi, 'ecobank')
      .trim();

    // Try dynamic mapping first
    try {
      const mapping = await this.getBankMapping();

      // Exact name match
      if (mapping.bankMapping[normalized]) {
        return mapping.bankMapping[normalized];
      }

      // First-3-letters prefix matching (e.g., "mon" → Moniepoint)
      if (/^[a-z]{3,}$/.test(normalized)) {
        const prefix = normalized.slice(0, 3);
        // Only accept if it uniquely matches a bank name prefix
        const candidates = Object.keys(mapping.bankMapping)
          .filter(name => name.startsWith(prefix));
        if (candidates.length === 1) {
          const matchedKey = candidates[0];
          return mapping.bankMapping[matchedKey];
        }
      }

      // Flexible partial contains matching in either direction
      const fuzzyCandidates = Object.keys(mapping.bankMapping).filter(key =>
        key.includes(normalized) || normalized.includes(key)
      );
      if (fuzzyCandidates.length === 1) {
        return mapping.bankMapping[fuzzyCandidates[0]];
      }
    } catch (e) {
      logger.warn('resolveInstitutionCode: dynamic mapping failed, falling back', { error: e.message });
    }

    // Static fallback dictionary including Moniepoint/Monipoint and other fintechs
    const staticMapping = {
      'access': '000014', 'access bank': '000014',
      'first bank': '000016', 'first': '000016',
      'gtbank': '000058', 'gt bank': '000058',
      'zenith': '000057', 'zenith bank': '000057',
      'keystone': '000082', 'keystone bank': '000082',
      'fidelity': '000070', 'fidelity bank': '000070',
      'union': '000032', 'union bank': '000032',
      'wema': '000035', 'wema bank': '000035',
      'sterling': '000232', 'sterling bank': '000232',
      'ecobank': '000050',
      'fcmb': '000214', 'first city monument bank': '000214',
      'stanbic': '000221', 'stanbic ibtc': '000221', 'ibtc': '000221',
      'standard chartered': '000068', 'standard chartered bank': '000068',
      'citibank': '000023', 'citi bank': '000023',
      'heritage': '000030', 'heritage bank': '000030',
      'unity': '000215', 'unity bank': '000215',
      'enterprise': '000084', 'enterprise bank': '000084',
      // Fintech/digital
      'opay': '000090', 'palmpay': '000091', 'kuda': '000092', 'carbon': '000093',
      'alat': '000094', 'v bank': '000095', 'vbank': '000095', 'rubies': '000096',
      'fairmoney': '000099', 'eyowo': '000101', 'flutterwave': '000102', 'paystack': '000103',
      'moniepoint': '000104', 'monipoint': '000104',
      '9psb': '000105', 'providus': '000106', 'polaris': '000107', 'titan': '000108', 'titan trust': '000108'
    };

    if (staticMapping[normalized]) return staticMapping[normalized];

    // Prefix search on static mapping
    const staticCandidates = Object.keys(staticMapping).filter(k => k.startsWith(normalized.slice(0, 3)));
    if (staticCandidates.length === 1) return staticMapping[staticCandidates[0]];

    // Last resort: if user supplied at least 3 letters, try any contains
    if (normalized.length >= 3) {
      const containsCandidates = Object.keys(staticMapping).filter(k => k.includes(normalized) || normalized.includes(k));
      if (containsCandidates.length === 1) return staticMapping[containsCandidates[0]];
    }

    return null;
  }

  // Get common name variations for a bank
  getBankNameVariations(bankName) {
    const variations = [bankName];
    
    // Remove common suffixes
    const withoutSuffix = bankName
      .replace(/\s+(plc|limited|ltd|inc|corporation|corp|bank|nigeria|nig)\s*$/i, '')
      .trim();
    
    if (withoutSuffix !== bankName) {
      variations.push(withoutSuffix);
    }

    // Add common abbreviations
    const abbreviations = {
      'access bank': ['access'],
      'first bank of nigeria': ['first bank', 'firstbank'],
      'guaranty trust bank': ['gtbank', 'gt bank'],
      'united bank for africa': ['uba'],
      'zenith bank': ['zenith'],
      'keystone bank': ['keystone'],
      'fidelity bank': ['fidelity'],
      'union bank': ['union'],
      'wema bank': ['wema'],
      'sterling bank': ['sterling'],
      'ecobank': ['eco bank'],
      'fcmb': ['first city monument bank'],
      'stanbic ibtc': ['stanbic', 'ibtc'],
      'standard chartered': ['standard chartered bank'],
      'citibank': ['citi bank'],
      'heritage bank': ['heritage'],
      'unity bank': ['unity'],
      'enterprise bank': ['enterprise']
    };

    const lowerBankName = bankName.toLowerCase();
    for (const [fullName, abbrevs] of Object.entries(abbreviations)) {
      if (lowerBankName.includes(fullName) || fullName.includes(lowerBankName)) {
        variations.push(...abbrevs);
      }
    }

    return variations;
  }

  // Fallback bank mapping for when API is unavailable
  getFallbackBankMapping() {
    return {
      bankMapping: {
        'access bank': '000014',
        'first bank': '000016',
        'gtbank': '000058',
        'gt bank': '000058',
        'guaranty trust bank': '000058',
        'zenith bank': '000057',
        'zenith': '000057',
        'keystone bank': '000082',
        'keystone': '000082',
        'fidelity bank': '000070',
        'fidelity': '000070',
        'union bank': '000032',
        'union': '000032',
        'wema bank': '000035',
        'wema': '000035',
        'sterling bank': '000232',
        'sterling': '000232',
        'ecobank': '000050',
        'eco bank': '000050',
        'fcmb': '000214',
        'first city monument bank': '000214',
        'stanbic ibtc': '000221',
        'stanbic': '000221',
        'ibtc': '000221',
        'standard chartered': '000068',
        'standard chartered bank': '000068',
        'citibank': '000023',
        'citi bank': '000023',
        'heritage bank': '000030',
        'heritage': '000030',
        'unity bank': '000215',
        'unity': '000215',
        'enterprise bank': '000084',
        'enterprise': '000084',
        'uba': '000033',
        'united bank for africa': '000033',
        
        // Digital banks and fintechs
        'opay': '100004',
        'opay bank': '100004',
        'palmpay': '100033',
        'palmpay bank': '100033',
        'kuda bank': '000090',
        'kuda': '000090',
        'carbon': '100006',
        'carbon bank': '100006',
        'vbank': '100012',
        'v bank': '100012',
        'rubies bank': '100021',
        'rubies': '100021',
        'moniepoint': '100017',
        'moniepoint mfb': '100017',
        'moniepoint bank': '100017',
        'sparkle': '100018',
        'sparkle microfinance': '100018',
        'mintyn': '100020',
        'mintyn bank': '100020',
        'fairmoney': '100019',
        'branch': '100015',
        'eyowo': '100016',
        'alat': '000035',
        'alat by wema': '000035',
        
        // MFBs and other institutions that might not be in BellBank API
        '9 payment service bank': '120001',
        '9payment': '120001',
        '9 payment': '120001',
        'npf microfinance bank': '000053',
        'npf mfb': '000053',
        'npf': '000053',
        'bowen microfinance bank': '000051',
        'bowen mfb': '000051',
        'bowen': '000051',
        'titan trust bank': '000025',
        'titan trust': '000025',
        'titan': '000025',
        'taj bank': '000026',
        'taj': '000026',
        'globus bank': '000027',
        'globus': '000027',
        'parallex bank': '000030',
        'parallex': '000030',
        'premium trust bank': '000031',
        'premium trust': '000031',
        'coronation merchant bank': '000032',
        'coronation': '000032',
        'rand merchant bank': '000034',
        'rand merchant': '000034',
        'nova merchant bank': '000036',
        'nova merchant': '000036',
        'nova': '000036'
      },
      bankNameMapping: {
        '000014': 'ACCESS BANK',
        '000016': 'FIRST BANK OF NIGERIA',
        '000058': 'GUARANTY TRUST BANK',
        '000057': 'ZENITH BANK',
        '000082': 'KEYSTONE BANK',
        '000070': 'FIDELITY BANK',
        '000032': 'UNION BANK',
        '000035': 'WEMA BANK',
        '000232': 'STERLING BANK',
        '000050': 'ECOBANK',
        '000214': 'FIRST CITY MONUMENT BANK',
        '000221': 'STANBIC IBTC BANK',
        '000068': 'STANDARD CHARTERED BANK',
        '000023': 'CITIBANK NIGERIA',
        '000030': 'HERITAGE BANK',
        '000215': 'UNITY BANK',
        '000084': 'ENTERPRISE BANK',
        '000033': 'UNITED BANK FOR AFRICA',
        
        // Digital banks and fintechs
        '100004': 'OPAY',
        '100033': 'PALMPAY',
        '000090': 'KUDA BANK',
        '100006': 'CARBON',
        '100012': 'VBANK',
        '100021': 'RUBIES BANK',
        '100017': 'MONIEPOINT MFB',
        '100018': 'SPARKLE MICROFINANCE BANK',
        '100020': 'MINTYN BANK',
        '100019': 'FAIRMONEY MICROFINANCE BANK',
        '100015': 'BRANCH INTERNATIONAL',
        '100016': 'EYOWO',
        
        // MFBs and other institutions
        '120001': '9 PAYMENT SERVICE BANK',
        '000053': 'NPF MICROFINANCE BANK',
        '000051': 'BOWEN MICROFINANCE BANK',
        '000025': 'TITAN TRUST BANK',
        '000026': 'TAJ BANK',
        '000027': 'GLOBUS BANK',
        '000030': 'PARALLEX BANK',
        '000031': 'PREMIUM TRUST BANK',
        '000032': 'CORONATION MERCHANT BANK',
        '000034': 'RAND MERCHANT BANK',
        '000036': 'NOVA MERCHANT BANK'
      },
      banks: []
    };
  }

  // Convert bank name to institution code
  async getInstitutionCode(bankName) {
    try {
      if (!bankName) {
        throw new Error('Bank name is required');
      }

      const mapping = await this.getBankMapping();
      const lowerBankName = bankName.toLowerCase().trim();
      
      // Try exact match first
      if (mapping.bankMapping[lowerBankName]) {
        return mapping.bankMapping[lowerBankName];
      }

      // Try partial matches
      for (const [name, code] of Object.entries(mapping.bankMapping)) {
        if (name.includes(lowerBankName) || lowerBankName.includes(name)) {
          logger.info('Found bank mapping by partial match', {
            input: bankName,
            matched: name,
            institutionCode: code
          });
          return code;
        }
      }

      // If no match found, try to find by common patterns
      const commonPatterns = {
        'keystone': '000082',
        'access': '000014',
        'first': '000016',
        'gt': '000058',
        'zenith': '000057',
        'fidelity': '000070',
        'union': '000032',
        'wema': '000035',
        'sterling': '000232',
        'eco': '000050',
        'fcmb': '000214',
        'stanbic': '000221',
        'standard': '000068',
        'citi': '000023',
        'heritage': '000030',
        'unity': '000215',
        'enterprise': '000084',
        'uba': '000033'
      };

      for (const [pattern, code] of Object.entries(commonPatterns)) {
        if (lowerBankName.includes(pattern)) {
          logger.info('Found bank mapping by pattern match', {
            input: bankName,
            pattern,
            institutionCode: code
          });
          return code;
        }
      }

      throw new Error(`No institution code found for bank: ${bankName}`);
    } catch (error) {
      logger.error('Failed to get institution code', { 
        bankName, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Initiate a bank transfer via BellBank API
   * 
   * Note: BellBank transfers can take longer than the standard timeout (up to 2-3 minutes).
   * If the API request times out, the transfer may still succeed on BellBank's side.
   * In such cases, BellBank will send a webhook notification when the transfer completes.
   * The webhook handler will update the transaction status and notify the user accordingly.
   * 
   * @param {Object} transferData - Transfer details
   * @returns {Object} Transfer result
   */
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

      // Convert bank code to 6-digit institution code for BellBank API
      let institutionCode = transferData.bankCode;
      if (transferData.bankCode && transferData.bankCode.length !== 6) {
        // Use comprehensive mapping for all supported banks
        const codeMapping = {
          // Traditional Banks
          '082': '000082', // Keystone Bank
          '014': '000014', // Access Bank
          '011': '000016', // First Bank
          '058': '000058', // GTBank
          '057': '000057', // Zenith Bank
          '070': '000070', // Fidelity Bank
          '032': '000032', // Union Bank
          '035': '000035', // Wema Bank
          '232': '000232', // Sterling Bank
          '050': '000050', // Ecobank
          '214': '000214', // FCMB
          '221': '000221', // Stanbic IBTC
          '068': '000068', // Standard Chartered
          '023': '000023', // Citibank
          '030': '000030', // Heritage Bank
          '215': '000215', // Unity Bank
          '084': '000084', // Enterprise Bank
          '033': '000033', // UBA
          '044': '000044', // Access Bank (alternative)
          '016': '000016', // First Bank (alternative)
          
          // Digital Banks and Fintech
          '090': '000090', // OPay
          '091': '000091', // Palmpay
          '092': '000092', // Kuda
          '093': '000093', // Carbon
          '094': '000094', // ALAT
          '095': '000095', // V Bank
          '096': '000096', // Rubies
          '097': '000097', // Fintech
          '098': '000098', // Mintyn
          '099': '000099', // Fairmoney
          '100': '000100', // Branch
          '101': '000101', // Eyowo
          '102': '000102', // Flutterwave
          '103': '000103', // Paystack
          '104': '000104', // Moniepoint
          '105': '000105', // 9PSB
          '106': '000106', // Providus
          '107': '000107', // Polaris
          '108': '000108', // Titan Trust
          '109': '000109', // TCF
          '110': '000110', // Covenant
          '111': '000111', // Nova
          '112': '000112', // Optimus
          '113': '000113', // Bowen
          '114': '000114', // Sparkle
          '115': '000115', // Mutual
          '116': '000116', // NPF
          '117': '000117', // Signature
          '118': '000118', // Globus
          '119': '000119', // Jaiz
          '120': '000120', // TAJ
          '121': '000121', // VFD
          '122': '000122', // Parallex
          '123': '000123', // PremiumTrust
          '124': '000124', // Coronation
          '125': '000125', // Rand Merchant
          '126': '000126', // FBNQuest
          '127': '000127', // SunTrust
          '128': '000128', // Unity
          '129': '000129', // Diamond
          '130': '000130', // Heritage
          '131': '000131', // Keystone
          '132': '000132', // Polaris
          '133': '000133', // Providus
          '134': '000134', // Titan Trust
          '135': '000135', // TCF
          '136': '000136', // Covenant
          '137': '000137', // Nova
          '138': '000138', // Optimus
          '139': '000139', // Bowen
          '140': '000140', // Sparkle
          '141': '000141', // Mutual
          '142': '000142', // NPF
          '143': '000143', // Signature
          '144': '000144', // Globus
          '145': '000145', // Jaiz
          '146': '000146', // TAJ
          '147': '000147', // VFD
          '148': '000148', // Parallex
          '149': '000149', // PremiumTrust
          '150': '000150'  // Coronation
        };
        
        institutionCode = codeMapping[transferData.bankCode] || transferData.bankCode;
        logger.info('Converted bank code to institution code for transfer', {
          originalCode: transferData.bankCode,
          institutionCode
        });
      }

      const payload = {
        beneficiaryBankCode: institutionCode.toString(), // Use 6-digit institution code
        beneficiaryAccountNumber: transferData.accountNumber.toString(),
        narration: transferData.narration.substring(0, 30), // BellBank limit
        amount: parseFloat(transferData.amount),
        reference: transferData.reference,
        senderName: transferData.senderName || 'MiiMii User' // Optional sender name
      };

      logger.info('Initiating BellBank transfer', {
        reference: transferData.reference,
        amount: transferData.amount,
        beneficiaryAccountNumber: transferData.accountNumber,
        beneficiaryBankCode: transferData.bankCode,
        institutionCode
      });

      // Log the exact payload being sent for debugging
      logger.info('BellBank transfer payload', {
        payload,
        payloadKeys: Object.keys(payload)
      });

      // Add retry logic for transfer operations
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`BellBank transfer attempt ${attempt}/${maxRetries}`, {
            reference: transferData.reference,
            amount: transferData.amount
          });

          const response = await this.makeRequestWithRetry('POST', '/v1/transfer', payload, {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          });

          if (response.success) {
            logger.info('BellBank transfer initiated successfully', {
              reference: transferData.reference,
              providerReference: response.data?.reference,
              status: response.data?.status,
              attempt
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
          lastError = error;
          
          // Log the attempt failure
          logger.warn(`BellBank transfer attempt ${attempt} failed`, {
            error: error.message,
            reference: transferData.reference,
            attempt,
            maxRetries
          });

          // If this is the last attempt, don't retry
          if (attempt === maxRetries) {
            break;
          }

          // Wait before retrying (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
          logger.info(`Waiting ${waitTime}ms before retry attempt ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      // All retries failed
      logger.error('BellBank transfer failed after all retries', {
        error: lastError.message,
        reference: transferData.reference,
        amount: transferData.amount,
        beneficiaryAccountNumber: transferData.accountNumber,
        beneficiaryBankCode: transferData.bankCode,
        attempts: maxRetries
      });
      throw lastError;
    } catch (error) {
      logger.error('BellBank transfer initiation failed', {
        error: error.message,
        reference: transferData.reference,
        amount: transferData.amount,
        beneficiaryAccountNumber: transferData.accountNumber,
        beneficiaryBankCode: transferData.bankCode
      });
      throw error;
    }
  }

  async requeryTransfer(reference) {
    try {
      const token = await this.generateToken();
      
      const response = await this.makeRequestWithRetry('POST', '/v1/transfer/requery', {
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

      const response = await this.makeRequestWithRetry('GET', `/v1/transactions?${params}`, {}, {
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
      
      const response = await this.makeRequestWithRetry('GET', `/v1/transactions/${reference}`, {}, {
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
        // Generate and send receipt
        let receiptSent = false;
        try {
          const receiptData = {
            type: 'Bank Transfer',
            amount: parseFloat(transaction.amount),
            fee: parseFloat(transaction.fee || 0),
            totalAmount: parseFloat(transaction.totalAmount),
            recipientName: transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber,
            recipientBank: transaction.recipientDetails?.bankName,
            recipientAccount: transaction.recipientDetails?.accountNumber,
            reference: transaction.reference,
            date: new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            status: 'Successful',
            senderName: user.firstName || user.whatsappNumber
          };

          const receiptService = require('./receipt');
          const receiptBuffer = await receiptService.generateTransferReceipt(receiptData);
          await whatsappService.sendImageMessage(user.whatsappNumber, receiptBuffer, 'receipt.jpg');
          receiptSent = true;
        } catch (receiptError) {
          logger.warn('Failed to generate transfer receipt, sending text message only', { error: receiptError.message });
          
          // Send text notification if receipt wasn't sent
          const completionMessage = `✅ *Transfer Successful!*\n\n` +
                                  `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
                                  `👤 To: ${transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber}\n` +
                                  `🏦 Bank: ${transaction.recipientDetails?.bankName}\n` +
                                  `📄 Reference: ${transaction.reference}\n\n` +
                                  `Your transfer has been completed successfully! 🎉`;

          await whatsappService.sendTextMessage(user.whatsappNumber, completionMessage);
          receiptSent = true; // Mark as sent even if it's text fallback
        }
      }

      logger.info('Transfer completion processed successfully', {
        transactionId: transaction.id,
        reference: data.reference,
        status: 'completed'
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
        providerResponse: data,
        failureReason: data.failureReason || data.message || 'Transfer failed'
      });

      // Refund the user's wallet
        const wallet = await Wallet.findOne({ where: { userId: transaction.userId } });
        if (wallet) {
        await wallet.updateBalance(transaction.totalAmount, 'credit', 'Transfer refund');
      }

      // Find user and send notification
      const user = await User.findByPk(transaction.userId);
      if (user) {
        const failureMessage = `❌ *Transfer Failed*\n\n` +
                             `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
                             `👤 To: ${transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber}\n` +
                             `📄 Reference: ${transaction.reference}\n\n` +
                             `Your transfer could not be completed. The amount has been refunded to your wallet.\n\n` +
                             `Please try again or contact support if the issue persists.`;

        await whatsappService.sendTextMessage(user.whatsappNumber, failureMessage);
      }

      logger.info('Transfer failure processed successfully', {
        transactionId: transaction.id,
        reference: data.reference,
        status: 'failed',
        refunded: true
      });

      return { 
        success: true, 
        message: 'Transfer failure processed and refunded',
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
      
      // Find the transaction by provider reference
      const transaction = await Transaction.findOne({
        where: { providerReference: data.reference }
      });

      if (!transaction) {
        logger.warn('Transaction not found for transfer reversal', { 
          reference: data.reference 
        });
        return { success: false, message: 'Transaction not found' };
      }

      // Update transaction status
      await transaction.update({
        status: 'reversed',
        processedAt: new Date(),
        providerResponse: data,
        failureReason: data.reversalReason || 'Transfer reversed'
      });

      // Refund the user's wallet
      const wallet = await Wallet.findOne({ where: { userId: transaction.userId } });
      if (wallet) {
        await wallet.updateBalance(transaction.totalAmount, 'credit', 'Transfer reversal refund');
      }

      // Find user and send notification
      const user = await User.findByPk(transaction.userId);
      if (user) {
        const reversalMessage = `🔄 *Transfer Reversed*\n\n` +
                              `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
                              `👤 To: ${transaction.recipientDetails?.name || transaction.recipientDetails?.accountNumber}\n` +
                              `📄 Reference: ${transaction.reference}\n\n` +
                              `Your transfer has been reversed. The amount has been refunded to your wallet.\n\n` +
                              `Please contact support if you have any questions.`;

        await whatsappService.sendTextMessage(user.whatsappNumber, reversalMessage);
      }

      logger.info('Transfer reversal processed successfully', {
        transactionId: transaction.id,
        reference: data.reference,
        status: 'reversed',
        refunded: true
      });

      return { 
        success: true, 
        message: 'Transfer reversal processed and refunded',
        transaction: transaction.getTransactionSummary()
      };

    } catch (error) {
      logger.error('Failed to process transfer reversal', { 
        error: error.message, 
        webhookData 
      });
      return { success: false, error: error.message };
    }
  }

  // Handle incoming transfer webhook from BellBank
  async handleIncomingTransferWebhook(webhookData) {
    try {
      logger.info('Processing incoming transfer webhook', { webhookData });

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

      // Validate required fields
      if (!reference || !amountReceived || !status) {
        throw new Error('Missing required webhook fields');
      }

      // Check if this is a collection event (incoming transfer)
      if (event !== 'collection') {
        logger.info('Ignoring non-collection webhook event', { event });
        return { success: true, message: 'Non-collection event ignored' };
      }

      // Find user by virtual account number
      const user = await this.findUserByVirtualAccount(virtualAccount);
      if (!user) {
        logger.warn('User not found for virtual account', { virtualAccount });
        throw new Error('User not found for virtual account');
      }

      // Check if transaction already processed
      const existingTransaction = await this.getTransactionByReference(reference);
      if (existingTransaction) {
        logger.info('Transaction already processed', { reference });
        return { success: true, message: 'Transaction already processed' };
      }

      // Process the incoming transfer
      if (status === 'successful') {
        return await this.processSuccessfulIncomingTransfer(user, {
          reference,
          externalReference,
          amountReceived: parseFloat(amountReceived),
          transactionFee: parseFloat(transactionFee || 0),
          netAmount: parseFloat(netAmount || amountReceived),
          stampDuty: parseFloat(stampDuty || 0),
          sessionId,
          sourceAccountNumber,
          sourceAccountName,
          sourceBankCode,
          sourceBankName,
          remarks,
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt)
        });
      } else if (status === 'pending') {
        return await this.processPendingIncomingTransfer(user, {
          reference,
          externalReference,
          amountReceived: parseFloat(amountReceived),
          sessionId,
          sourceAccountNumber,
          sourceAccountName,
          sourceBankCode,
          sourceBankName,
          remarks,
          createdAt: new Date(createdAt)
        });
      } else {
        logger.warn('Unknown transfer status', { status, reference });
        throw new Error(`Unknown transfer status: ${status}`);
      }

    } catch (error) {
      logger.error('Failed to process incoming transfer webhook', {
        error: error.message,
        webhookData
      });
      throw error;
    }
  }

  // Process successful incoming transfer
  async processSuccessfulIncomingTransfer(user, transferData) {
    try {
      const transactionService = require('./transaction');
      const walletService = require('./wallet');
      const whatsappService = require('./whatsapp');

      // Create transaction record
      const transaction = await transactionService.createTransaction(user.id, {
        type: 'credit',
        category: 'wallet_funding',
        amount: transferData.netAmount,
        fee: transferData.transactionFee,
        totalAmount: transferData.netAmount,
        description: `Incoming transfer from ${transferData.sourceAccountName}`,
        reference: transferData.reference,
        recipientDetails: {
          sourceAccountNumber: transferData.sourceAccountNumber,
          sourceAccountName: transferData.sourceAccountName,
          sourceBankCode: transferData.sourceBankCode,
          sourceBankName: transferData.sourceBankName,
          remarks: transferData.remarks
        },
        metadata: {
          service: 'bellbank_incoming',
          externalReference: transferData.externalReference,
          sessionId: transferData.sessionId,
          stampDuty: transferData.stampDuty,
          sourceCurrency: 'NGN',
          destinationCurrency: 'NGN'
        },
        status: 'completed'
      });

      // Credit user's wallet with amountReceived (not netAmount)
      await walletService.creditWallet(user.id, transferData.amountReceived, 
        `Incoming transfer from ${transferData.sourceAccountName}`, {
        category: 'wallet_funding',
        transactionId: transaction.id
      });

      // Send notification to user (without transaction fee)
      const notificationMessage = `💰 *Money Received!*\n\n` +
        `Amount: ₦${transferData.amountReceived.toLocaleString()}\n` +
        `From: ${transferData.sourceAccountName}\n` +
        `Bank: ${transferData.sourceBankName}\n` +
        `Account: ${transferData.sourceAccountNumber}\n` +
        `Reference: ${transferData.reference}\n\n` +
        `Your wallet has been credited! 🎉\n\n` +
        `Check your balance: Type "balance"`;

      await whatsappService.sendTextMessage(user.whatsappNumber, notificationMessage);

      logger.info('Incoming transfer processed successfully', {
        userId: user.id,
        reference: transferData.reference,
        amount: transferData.netAmount,
        sourceAccount: transferData.sourceAccountName
      });

      return {
        success: true,
        transaction: transaction,
        message: 'Incoming transfer processed successfully'
      };

    } catch (error) {
      logger.error('Failed to process successful incoming transfer', {
        error: error.message,
        userId: user.id,
        transferData
      });
      throw error;
    }
  }

  // Process pending incoming transfer
  async processPendingIncomingTransfer(user, transferData) {
    try {
      const transactionService = require('./transaction');

      // Create pending transaction record
      const transaction = await transactionService.createTransaction(user.id, {
        type: 'credit',
        category: 'wallet_funding',
        amount: transferData.amountReceived,
        totalAmount: transferData.amountReceived,
        description: `Pending incoming transfer from ${transferData.sourceAccountName}`,
        reference: transferData.reference,
        recipientDetails: {
          sourceAccountNumber: transferData.sourceAccountNumber,
          sourceAccountName: transferData.sourceAccountName,
          sourceBankCode: transferData.sourceBankCode,
          sourceBankName: transferData.sourceBankName,
          remarks: transferData.remarks
        },
        metadata: {
          service: 'bellbank_incoming',
          externalReference: transferData.externalReference,
          sessionId: transferData.sessionId,
          status: 'pending'
        },
        status: 'pending'
      });

      logger.info('Pending incoming transfer recorded', {
        userId: user.id,
        reference: transferData.reference,
        amount: transferData.amountReceived
      });

      return {
        success: true,
        transaction: transaction,
        message: 'Pending incoming transfer recorded'
      };

    } catch (error) {
      logger.error('Failed to process pending incoming transfer', {
        error: error.message,
        userId: user.id,
        transferData
      });
      throw error;
    }
  }

  // Find user by virtual account number
  async findUserByVirtualAccount(virtualAccount) {
    try {
      const { User, Wallet } = require('../models');
      
      logger.info('Searching for user by virtual account', {
        virtualAccount,
        searchMethod: 'wallet_lookup'
      });
      
      // Find user by virtual account number stored in wallet
      const wallet = await Wallet.findOne({
        where: { virtualAccountNumber: virtualAccount },
        include: [{ model: User, as: 'user' }]
      });

      if (wallet && wallet.user) {
        logger.info('User found by virtual account in wallet', {
          virtualAccount,
          userId: wallet.user.id,
          userName: `${wallet.user.firstName} ${wallet.user.lastName}`
        });
        return wallet.user;
      }

      // Fallback: try to find by account reference or other fields
      logger.info('User not found in wallet, trying fallback search', {
        virtualAccount
      });
      
      // Try to find by account reference
      const walletByReference = await Wallet.findOne({
        where: { accountReference: virtualAccount },
        include: [{ model: User, as: 'user' }]
      });

      if (walletByReference && walletByReference.user) {
        logger.info('User found by account reference', {
          virtualAccount,
          userId: walletByReference.user.id,
          userName: `${walletByReference.user.firstName} ${walletByReference.user.lastName}`
        });
        return walletByReference.user;
      }

      // Log all wallets with virtual accounts for debugging
      const allWallets = await Wallet.findAll({
        where: { 
          virtualAccountNumber: { [require('sequelize').Op.not]: null }
        },
        include: [{ model: User, as: 'user' }],
        limit: 10
      });

      logger.warn('User not found for virtual account, available virtual accounts:', {
        virtualAccount,
        availableAccounts: allWallets.map(w => ({
          virtualAccountNumber: w.virtualAccountNumber,
          accountReference: w.accountReference,
          userId: w.user?.id,
          userName: w.user ? `${w.user.firstName} ${w.user.lastName}` : 'N/A'
        }))
      });

      return null;
    } catch (error) {
      logger.error('Failed to find user by virtual account', {
        error: error.message,
        virtualAccount
      });
      return null;
    }
  }

  // Get transaction by reference
  async getTransactionByReference(reference) {
    try {
      const { Transaction } = require('../models');
      
      const transaction = await Transaction.findOne({
        where: { reference }
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to get transaction by reference', {
        error: error.message,
        reference
      });
      return null;
    }
  }

  // New method with retry logic and circuit breaker
  async makeRequestWithRetry(method, endpoint, data = {}, headers = {}) {
    const apiCall = async () => {
      return await this.makeRequest(method, endpoint, data, headers);
    };

    // Use circuit breaker with retry logic
    return await this.circuitBreaker(async () => {
      return await RetryHelper.retryBankApiCall(apiCall, {
        maxAttempts: 5,
        baseDelay: 3000, // Start with 3 seconds
        maxDelay: 60000, // Max 60 seconds
        backoffMultiplier: 2,
        shouldRetry: (error, attempt) => {
          // Don't retry authentication errors
          if (error.response && [401, 403].includes(error.response.status)) {
            logger.warn('BellBank API authentication error, not retrying', {
              status: error.response.status,
              endpoint,
              attempt
            });
            return false;
          }
          
          // Don't retry client errors (400-499) except specific ones
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            const retryableClientErrors = [408, 429, 499]; // Request timeout, too many requests, client closed request
            const shouldRetry = retryableClientErrors.includes(error.response.status);
            
            if (!shouldRetry) {
              logger.warn('BellBank API client error, not retrying', {
                status: error.response.status,
                endpoint,
                attempt
              });
            }
            
            return shouldRetry;
          }
          
          // Always retry server errors (500+) and network issues
          if (error.response && error.response.status >= 500) {
            logger.warn('BellBank API server error, will retry', {
              status: error.response.status,
              endpoint,
              attempt
            });
          }
          
          return true;
        },
        operationName: `bellbank_${method}_${endpoint.replace(/\//g, '_')}`
      });
    });
  }

  async makeRequest(method, endpoint, data = {}, headers = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      // Use longer timeout for transfer operations and virtual account creation
      const isTransferOperation = endpoint === '/v1/transfer' || endpoint === '/v1/transfer/requery';
      const isVirtualAccountCreation = endpoint === '/v1/account/clients/individual';
      const requestTimeout = isTransferOperation || isVirtualAccountCreation ? 180000 : 120000; // 3 minutes for transfers and VA creation, 2 minutes for others
      
      const config = {
        ...axiosConfig,
        timeout: requestTimeout, // Override timeout for transfer operations
        method,
        url,
        headers: {
          ...axiosConfig.headers,
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (method === 'GET') {
        config.params = data;
      } else {
        // Handle different data formats
        if (typeof data === 'string' && headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          // Form data as string
          config.data = data;
        } else if (typeof data === 'object') {
          // JSON data
          config.data = data;
        } else {
          // Default to JSON
          config.data = data;
        }
      }

      logger.info('Making BellBank API request', {
        method,
        endpoint,
        url,
        timeout: requestTimeout,
        hasData: !!Object.keys(data).length,
        hasHeaders: !!Object.keys(headers).length,
        dataKeys: typeof data === 'object' ? Object.keys(data) : ['string_data'],
        headerKeys: Object.keys(headers),
        contentType: headers['Content-Type']
      });

      // Debug: Log the exact request configuration (without sensitive data)
      if (endpoint === '/v1/generate-token') {
        logger.info('BellBank token request details', {
          method,
          url,
          dataKeys: typeof data === 'object' ? Object.keys(data) : ['string_data'],
          hasConsumerKey: typeof data === 'object' ? !!data.consumerKey : data.includes('consumerKey'),
          hasConsumerSecret: typeof data === 'object' ? !!data.consumerSecret : data.includes('consumerSecret'),
          consumerKeyLength: typeof data === 'object' ? (data.consumerKey ? data.consumerKey.length : 0) : 'N/A',
          consumerSecretLength: typeof data === 'object' ? (data.consumerSecret ? data.consumerSecret.length : 0) : 'N/A',
          validityTime: typeof data === 'object' ? data.validityTime : 'N/A',
          headers: Object.keys(config.headers),
          contentType: headers['Content-Type']
        });
      }

      const response = await axios(config);

      logger.info('BellBank API response received', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data
      });

      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      const status = error.response?.status;
      
      logger.error('BellBank API request failed', {
        method,
        endpoint,
        status,
        error: errorMessage,
        response: error.response?.data
      });

      throw new Error(`HTTP ${status}: ${errorMessage}`);
    }
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle Nigerian numbers
    if (cleaned.startsWith('234')) {
      return cleaned;
    } else if (cleaned.startsWith('0')) {
      return '234' + cleaned.substring(1);
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '234' + cleaned;
    }
    
    return cleaned;
  }

  formatDateForBellBank(dateString) {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  verifyWebhookSignature(payload, signature) {
    // Implement webhook signature verification if required by BellBank
    // For now, return true as placeholder
    return true;
  }


}

module.exports = new BellBankService();
const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');
const rubiesService = require('./rubies');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class BankTransferService {
  constructor() {
    // Transfer limits and fees
    this.limits = {
      minimum: 100,
      maximum: 1000000, // 1 million naira
      dailyLimit: 5000000, // 5 million naira
      monthlyLimit: 50000000 // 50 million naira
    };

    // Transfer fees structure - Tiered fee structure
    this.fees = {
      tier1: { min: 0, max: 10000, fee: 15 },      // 0 - 10k = ₦15
      tier2: { min: 10000, max: 50000, fee: 25 },  // 10k - 50k = ₦25
      tier3: { min: 50000, max: Infinity, fee: 50 }, // 50k+ = ₦50
      percentageFee: 0, // No percentage fee
      freeThreshold: 0 // Not applicable with tiered fee
    };

    // Transfer types
    this.transferTypes = {
      SAME_BANK: 'same_bank',
      OTHER_BANK: 'other_bank',
      WALLET_TO_BANK: 'wallet_to_bank',
      BANK_TO_WALLET: 'bank_to_wallet'
    };
  }

  // Get all supported banks
  async getSupportedBanks() {
    try {
      // Get banks from Rubies API
      const banks = await rubiesService.getBankList();
      
      if (banks && banks.length > 0) {
        return banks.map(bank => ({
          code: bank.code,
          name: bank.name,
          slug: bank.slug || bank.code,
          type: bank.type || 'commercial',
          category: bank.category || 'deposit_money_bank'
        }));
      }

      // Fallback to static bank list if API fails
      return this.getStaticBankList();
    } catch (error) {
      logger.error('Failed to get banks from Rubies API, using static list', { error: error.message });
      return this.getStaticBankList();
    }
  }

  // Static bank list fallback
  getStaticBankList() {
    return [
      { code: '044', name: 'Access Bank', slug: 'access-bank', type: 'commercial' },
      { code: '014', name: 'Afribank Nigeria Plc', slug: 'afribank', type: 'commercial' },
      { code: '023', name: 'Citibank Nigeria Limited', slug: 'citibank', type: 'commercial' },
      { code: '050', name: 'Ecobank Nigeria Plc', slug: 'ecobank', type: 'commercial' },
      { code: '011', name: 'First Bank of Nigeria Limited', slug: 'first-bank', type: 'commercial' },
      { code: '214', name: 'First City Monument Bank Limited', slug: 'fcmb', type: 'commercial' },
      { code: '070', name: 'Fidelity Bank Plc', slug: 'fidelity-bank', type: 'commercial' },
      { code: '058', name: 'Guaranty Trust Bank Plc', slug: 'gtbank', type: 'commercial' },
      { code: '030', name: 'Heritage Banking Company Ltd', slug: 'heritage-bank', type: 'commercial' },
      { code: '082', name: 'Keystone Bank Limited', slug: 'keystone-bank', type: 'commercial' },
      { code: '221', name: 'Stanbic IBTC Bank Plc', slug: 'stanbic-ibtc', type: 'commercial' },
      { code: '068', name: 'Standard Chartered Bank Nigeria Ltd', slug: 'standard-chartered', type: 'commercial' },
      { code: '232', name: 'Sterling Bank Plc', slug: 'sterling-bank', type: 'commercial' },
      { code: '033', name: 'United Bank For Africa Plc', slug: 'uba', type: 'commercial' },
      { code: '032', name: 'Union Bank of Nigeria Plc', slug: 'union-bank', type: 'commercial' },
      { code: '035', name: 'Wema Bank Plc', slug: 'wema-bank', type: 'commercial' },
      { code: '057', name: 'Zenith Bank Plc', slug: 'zenith-bank', type: 'commercial' },
      { code: '215', name: 'Unity Bank Plc', slug: 'unity-bank', type: 'commercial' },
      { code: '076', name: 'Skye Bank Plc', slug: 'skye-bank', type: 'commercial' },
      { code: '084', name: 'Enterprise Bank Limited', slug: 'enterprise-bank', type: 'commercial' }
    ];
  }

  // Validate account number and get account name
  async validateBankAccount(accountNumber, bankCode) {
    // Define cleanAccountNumber at the top level to ensure it's always in scope
    let cleanAccountNumber;
    
    try {
      if (!accountNumber || !bankCode) {
        throw new Error('Account number and bank code are required');
      }

      // Basic account number validation - allow 8-11 digits for flexibility
      cleanAccountNumber = accountNumber.toString().trim();
      if (!cleanAccountNumber || cleanAccountNumber.length < 8 || cleanAccountNumber.length > 11) {
        throw new Error(`Invalid account number format. Account numbers should be 8-11 digits.`);
      }
      
      if (!/^\d+$/.test(cleanAccountNumber)) {
        throw new Error(`Invalid account number format. Account numbers should contain only digits.`);
      }

      // Handle test accounts for development/testing
      if (bankCode === '000023' || bankCode === '000024' || bankCode === '010') {
        logger.info('Using test account validation', { accountNumber, bankCode });
        
        // Use official BellBank test credentials
        if (bankCode === '010' && accountNumber === '1001011000') {
          return {
            valid: true,
            accountNumber,
            bankCode,
            accountName: 'TEST ACCOUNT HOLDER',
            bank: 'Test Bank',
            currency: 'NGN',
            test: true
          };
        }
        
        // Fallback for other test codes
        return {
          valid: true,
          accountNumber,
          bankCode,
          accountName: 'TEST ACCOUNT HOLDER',
          bank: 'Test Bank',
          currency: 'NGN',
          test: true
        };
      }

      // Convert bank code to 6-digit institution code for BellBank API
      let institutionCode = bankCode;
      if (bankCode && bankCode.length !== 6) {
        // Try to get dynamic bank mapping from Rubies API first
        try {
          logger.info('Attempting to fetch dynamic bank mapping from Rubies API');
          const bankMapping = await rubiesService.getBankMapping();
          
          // Try to find the bank by common name variations
          const bankName = this.getBankNameByCode(bankCode);
          const bankNameLower = bankName.toLowerCase();
          
          // Look for exact match or partial match
          const foundCode = bankMapping.bankMapping[bankNameLower] || 
                           Object.keys(bankMapping.bankMapping).find(key => 
                             key.includes(bankNameLower) || bankNameLower.includes(key)
                           );
          
          if (foundCode) {
            institutionCode = bankMapping.bankMapping[foundCode];
            logger.info('Found dynamic bank code mapping', {
              originalCode: bankCode,
              bankName,
              institutionCode,
              source: 'Rubies API'
            });
          } else {
            // Fallback to static mapping if dynamic lookup fails
            logger.warn('Dynamic bank mapping failed, using static fallback', {
              bankCode,
              bankName
            });
            const staticMapping = this.getStaticBankCodeMapping();
            institutionCode = staticMapping[bankCode] || bankCode;
          }
        } catch (dynamicError) {
          logger.warn('Dynamic bank mapping failed, using static fallback', {
            error: dynamicError.message,
            bankCode
          });
          // Fallback to static mapping
          const staticMapping = this.getStaticBankCodeMapping();
          institutionCode = staticMapping[bankCode] || bankCode;
        }
      }

      // Use Rubies name enquiry for account validation
      const accountDetails = await rubiesService.nameEnquiry(cleanAccountNumber, institutionCode);
      
      if (accountDetails && (accountDetails.account_name || accountDetails.accountName)) {
        // Get proper bank name from bank code since Rubies doesn't return bank name
        const bankName = await this.getBankNameFromCode(accountDetails.bankCode || bankCode);
        
        return {
          valid: true,
          accountNumber: cleanAccountNumber,
          bankCode: accountDetails.bankCode || bankCode,
          accountName: accountDetails.account_name || accountDetails.accountName,
          bank: bankName,
          bankName: bankName,
          currency: 'NGN'
        };
      }

      // Mock validation for testing when API is not available or in sandbox
      if (!process.env.RUBIES_API_KEY || process.env.NODE_ENV === 'development') {
        logger.warn('Rubies API not configured or in development, using mock validation', {
          accountNumber,
          bankCode,
          environment: process.env.NODE_ENV
        });
        return {
          valid: true,
          accountNumber: cleanAccountNumber,
          bankCode,
          accountName: 'JOHN DOE (MOCK)',
          bank: this.getBankNameByCode(bankCode),
          currency: 'NGN',
          mock: true
        };
      }

      return {
        valid: false,
        message: `Could not validate account details for account number ${cleanAccountNumber}`
      };
    } catch (error) {
      logger.error('Account validation failed', { 
        error: error.message, 
        accountNumber: cleanAccountNumber || accountNumber, 
        bankCode 
      });
      
      // Provide more user-friendly error messages
      if (error.message.includes('Failed To Fecth Account Info')) {
        throw new Error(`The account number ${cleanAccountNumber || accountNumber} could not be found in ${this.getBankNameByCode(bankCode)}. Please check the account number and try again.`);
      } else if (error.message.includes('Destination Institution Code must be of 6 digits')) {
        throw new Error(`Invalid bank code. Please try again with a valid bank.`);
      } else if (error.message.includes('HTTP 400')) {
        throw new Error(`Unable to validate account details. Please check the account number and bank name.`);
      } else {
        throw new Error(`Account validation failed: ${error.message}`);
      }
    }
  }

  // Get static bank code mapping as fallback
  getStaticBankCodeMapping() {
    return {
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
  }

  // Get bank name by code
  getBankNameByCode(bankCode) {
    const banks = this.getStaticBankList();
    const bank = banks.find(b => b.code === bankCode);
    return bank ? bank.name : 'Unknown Bank';
  }

  // Enhanced bank name resolution with Rubies API support
  async getBankNameFromCode(bankCode) {
    try {
      // First try to get from Rubies API bank list
      const rubiesService = require('./rubies');
      const bankListResponse = await rubiesService.getBankList();
      
      if (bankListResponse && bankListResponse.length > 0) {
        logger.info('Using dynamic bank list for bank name resolution', { 
          bankCode, 
          bankCount: bankListResponse.length 
        });
        
        const bank = bankListResponse.find(b => b.code === bankCode);
        if (bank) {
          logger.info('Bank name resolved from Rubies API', { 
            bankCode, 
            bankName: bank.name 
          });
          return bank.name;
        } else {
          logger.warn('Bank code not found in Rubies API bank list', { 
            bankCode,
            availableCodes: bankListResponse.slice(0, 5).map(b => b.code) // Log first 5 codes for debugging
          });
        }
      } else {
        logger.warn('Rubies API bank list is empty, using static fallback');
      }
    } catch (error) {
      logger.warn('Failed to get bank name from Rubies API', { error: error.message, bankCode });
    }

    // Fallback to static mapping - using correct Rubies API bank codes
    const staticBankMapping = {
      '000013': 'GTBANK',
      '000014': 'ACCESS',
      '000016': 'FIRSTBANK',
      '000004': 'UBA',
      '000015': 'ZENITH',
      '000007': 'FIDELITY',
      '000017': 'WEMA',
      '000018': 'UNIONBANK',
      '000002': 'KEYSTONE',
      '000012': 'STANBICIBT',
      '000010': 'ECOBANK',
      '000001': 'STERLING',
      '100004': 'PAYCOM', // Also covers Moniepoint, Rubies MFB, 9 Payment, Opay
      '000090': 'KUDA',
      '000091': 'PALMPAY',
      '090175': 'RUBIESMICROFINANCEBANK',
      '000020': 'HERITAGE',
      '000023': 'PROVIDUS',
      '000022': 'SUNTRUST',
      '000009': 'CITIBANK',
      '000005': 'DIAMOND',
      '000003': 'FCMB',
      '000011': 'UNITY',
      '000006': 'JAIZ',
      '000021': 'STANDARDCHARTERED',
      '000024': 'RANDMERCHANTBANK',
      '000008': 'POLARI',
      '999991': 'POLARISBANK'
    };

    const bankName = staticBankMapping[bankCode] || this.getBankNameByCode(bankCode);
    logger.info('Bank name resolved from static mapping', { bankCode, bankName });
    return bankName;
  }

  // Convert bank name to institution code using Rubies API
  async getInstitutionCode(bankName) {
    try {
      return await rubiesService.getInstitutionCode(bankName);
    } catch (error) {
      logger.error('Failed to get institution code from Rubies', { 
        bankName, 
        error: error.message 
      });
      
      // Fallback to static mapping
      const fallbackMapping = {
        'keystone': '000082',
        'access': '000014',
        'first': '000016',
        'gtbank': '000058',
        'gt bank': '000058',
        'guaranty trust bank': '000058',
        'zenith': '000057',
        'fidelity': '000070',
        'union': '000032',
        'wema': '000035',
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
        'heritage': '000030',
        'unity': '000215',
        'enterprise': '000084',
        'uba': '000033',
        'united bank for africa': '000033',
        // Digital banks / fintech names
        'opay': '000090',
        'o pay': '000090',
        'palmpay': '000091',
        'palm pay': '000091',
        'kuda': '000092',
        'carbon': '000093',
        'alat': '000094',
        'v bank': '000095',
        'vbank': '000095',
        'rubies': '000096',
        'mintyn': '000098',
        'fairmoney': '000099',
        'branch': '000100',
        'eyowo': '000101',
        'flutterwave': '000102',
        'paystack': '000103',
        'moniepoint': '000104',
        'monie point': '000104',
        'providus': '000106',
        'polaris': '000107',
        'titan trust': '000108'
      };

      const lowerBankName = bankName.toLowerCase();
      for (const [pattern, code] of Object.entries(fallbackMapping)) {
        if (lowerBankName.includes(pattern)) {
          return code;
        }
      }

      throw new Error(`No institution code found for bank: ${bankName}`);
    }
  }

  // Calculate transfer fees - Flat ₦15 fee for all transfers
  calculateTransferFee(amount, transferType, sameBank = false) {
    const numAmount = parseFloat(amount);
    
    // Flat fee structure: ₦15 for all transfers
    const fee = 15;
    
    return {
      baseFee: fee,
      percentageFee: 0,
      totalFee: fee,
      amount: numAmount,
      totalAmount: numAmount + fee,
      feeTier: 'flat' // All transfers use flat fee
    };
  }

  // Validate transfer limits
  async validateTransferLimits(userId, amount) {
    try {
      const numAmount = parseFloat(amount);
      
      // Check basic limits
      if (numAmount < this.limits.minimum) {
        throw new Error(`Minimum transfer amount is ₦${this.limits.minimum.toLocaleString()}`);
      }

      if (numAmount > this.limits.maximum) {
        throw new Error(`Maximum transfer amount is ₦${this.limits.maximum.toLocaleString()}`);
      }

      // Check daily limits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const databaseService = require('./database');
      const supabaseHelper = require('./supabaseHelper');
      
      // Get all transactions and sum manually
      const allTransactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', {
          userId,
          category: 'bank_transfer',
          status: 'completed'
        });
      });
      
      // Filter by date and sum
      const dailyTransfers = allTransactions
        .filter(tx => new Date(tx.createdAt) >= today)
        .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      const totalDailyAmount = (dailyTransfers || 0) + numAmount;
      if (totalDailyAmount > this.limits.dailyLimit) {
        throw new Error(`Daily transfer limit of ₦${this.limits.dailyLimit.toLocaleString()} exceeded`);
      }

      // Check monthly limits
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const { supabase } = require('../database/connection');
      const { data: monthlyTransactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('userId', userId)
        .eq('category', 'bank_transfer')
        .eq('status', 'completed')
        .gte('createdAt', monthStart.toISOString());
      
      const monthlyTransfers = (monthlyTransactions || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      const totalMonthlyAmount = (monthlyTransfers || 0) + numAmount;
      if (totalMonthlyAmount > this.limits.monthlyLimit) {
        throw new Error(`Monthly transfer limit of ₦${this.limits.monthlyLimit.toLocaleString()} exceeded`);
      }

      return {
        valid: true,
        dailyUsed: dailyTransfers || 0,
        monthlyUsed: monthlyTransfers || 0,
        dailyRemaining: this.limits.dailyLimit - (dailyTransfers || 0),
        monthlyRemaining: this.limits.monthlyLimit - (monthlyTransfers || 0)
      };
    } catch (error) {
      logger.error('Transfer limit validation failed', { error: error.message, userId, amount });
      throw error;
    }
  }

  // Process bank transfer
  async processBankTransfer(userId, transferData, pin) {
    try {
      const { accountNumber, bankCode, amount, narration, reference } = transferData;

      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate account
      const accountValidation = await this.validateBankAccount(accountNumber, bankCode);
      if (!accountValidation.valid) {
        throw new Error('Invalid bank account details');
      }

      // Validate transfer limits
      await this.validateTransferLimits(userId, amount);

      // Calculate fees
      const feeCalculation = this.calculateTransferFee(amount, this.transferTypes.WALLET_TO_BANK);
      
      // Check wallet balance BEFORE creating transaction
      // Sync with Rubies to get the latest balance
      const walletBalanceData = await walletService.getWalletBalance(userId, true); // Sync with Rubies
      const walletBalance = walletBalanceData.available || walletBalanceData.total || 0;
      const totalAmount = feeCalculation.totalAmount;

      // Check if user has sufficient balance
      if (walletBalance < totalAmount) {
        const shortfall = totalAmount - walletBalance;
        throw new Error(`Insufficient wallet balance. You need ₦${totalAmount.toLocaleString()} but only have ₦${walletBalance.toLocaleString()}. Please fund your wallet with ₦${shortfall.toLocaleString()} more.`);
      }
      
      // Also verify the wallet exists
      const wallet = await walletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Double-check: Verify Rubies virtual account has sufficient funds
      if (wallet.virtualAccountNumber && wallet.virtualAccountBank === 'Rubies MFB') {
        try {
          const rubiesService = require('./rubies');
          const rubiesBalance = await rubiesService.retrieveWalletDetails(wallet.virtualAccountNumber);
          
          if (rubiesBalance.success) {
            const rubiesAccountBalance = parseFloat(rubiesBalance.accountBalance || 0);
            
            if (rubiesAccountBalance < totalAmount) {
              // Sync local balance with Rubies balance
              await walletService.getWalletBalance(userId, true);
              
              throw new Error(`Insufficient funds in your account. Available balance: ₦${rubiesAccountBalance.toLocaleString()}. Required: ₦${totalAmount.toLocaleString()}. Please fund your account and try again.`);
            }
            
            logger.info('Rubies balance verified before transfer', {
              userId,
              rubiesBalance: rubiesAccountBalance,
              requiredAmount: totalAmount,
              virtualAccountNumber: wallet.virtualAccountNumber
            });
          }
        } catch (rubiesError) {
          logger.warn('Failed to verify Rubies balance, proceeding with local balance check', {
            error: rubiesError.message,
            userId
          });
          // Continue with local balance check if Rubies check fails
        }
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'bank_transfer',
        amount: feeCalculation.amount,
        fee: feeCalculation.totalFee,
        totalAmount: feeCalculation.totalAmount,
        description: `Bank transfer to ${accountValidation.accountName}`,
        reference: reference || `TXN${Date.now()}`,
        recipientDetails: {
          accountNumber: accountValidation.accountNumber,
          accountName: accountValidation.accountName,
          bankCode: accountValidation.bankCode,
          bankName: accountValidation.bank,
          narration: narration || 'Wallet transfer'
        },
        metadata: {
          service: 'bank_transfer',
          transferType: this.transferTypes.WALLET_TO_BANK,
          feeBreakdown: feeCalculation,
          accountValidation
        }
      });

      try {
        // Process transfer through Rubies API
        const transferResult = await this.processRubiesTransfer({
          userId: userId,
          accountNumber: accountValidation.accountNumber,
          bankCode: accountValidation.bankCode,
          amount: feeCalculation.amount,
          narration: narration || 'Wallet transfer',
          reference: transaction.reference,
          senderName: `${user.firstName} ${user.lastName}`.trim() || user.whatsappNumber,
          beneficiaryName: accountValidation.accountName,
          bankName: accountValidation.bankName || accountValidation.bank
        });

        if (transferResult.success) {
          // Debit wallet
          await walletService.debitWallet(userId, feeCalculation.totalAmount, 
            `Bank transfer to ${accountValidation.accountName}`, {
            category: 'bank_transfer',
            transactionId: transaction.id
          });

          // Sync balance with Rubies after transfer debit (debitWallet already syncs, but ensure it happens)
          try {
            await walletService.syncBalanceWithRubies(userId);
          } catch (syncError) {
            logger.warn('Failed to sync balance with Rubies after transfer', {
              userId,
              error: syncError.message
            });
          }

          // Update transaction status
          await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
            providerReference: transferResult.reference,
            providerResponse: transferResult.response,
            sessionId: transferResult.sessionId
          });

          logger.info('Bank transfer completed successfully', {
            userId,
            accountNumber: accountValidation.accountNumber,
            amount: feeCalculation.amount,
            fee: feeCalculation.totalFee,
            reference: transaction.reference
          });

          // Automatically transfer ₦5 platform fee to MiiMii parent account (1000000963)
          // This is hidden from users but visible to admins
          try {
            const platformFeeAmount = 5; // ₦5 platform fee
            const parentAccountNumber = '1000000963';
            const parentBankCode = '090175'; // Rubies MFB code
            
            logger.info('Initiating platform fee transfer to parent account', {
              userId,
              parentAccountNumber,
              platformFeeAmount,
              originalTransferReference: transaction.reference
            });

            // Transfer ₦5 to parent account
            const platformFeeTransfer = await this.processRubiesTransfer({
              userId: userId,
              accountNumber: parentAccountNumber,
              bankCode: parentBankCode,
              amount: platformFeeAmount,
              narration: `Platform fee from transfer ${transaction.reference}`,
              reference: `PFEE${transaction.reference}`,
              senderName: 'MiiMii Platform',
              beneficiaryName: 'MiiMii Technologies',
              bankName: 'Rubies MFB'
            });

            if (platformFeeTransfer.success) {
              // Create internal transaction record (hidden from users, visible to admins)
              // Use 'fee_charge' category (valid enum value) and mark as platform fee in metadata
              await transactionService.createTransaction(userId, {
                type: 'debit',
                category: 'fee_charge', // Valid enum value - platform fee is identified via metadata
                amount: platformFeeAmount,
                fee: 0,
                totalAmount: platformFeeAmount,
                description: `Platform fee for transfer ${transaction.reference}`,
                reference: `PFEE${transaction.reference}`,
                recipientDetails: {
                  accountNumber: parentAccountNumber,
                  accountName: 'MiiMii Technologies',
                  bankCode: parentBankCode,
                  bankName: 'Rubies MFB'
                },
                metadata: {
                  isInternal: true,
                  isVisibleToUser: false,
                  isPlatformFee: true, // Mark as platform fee in metadata
                  parentTransactionReference: transaction.reference,
                  service: 'platform_fee_transfer',
                  providerReference: platformFeeTransfer.reference
                },
                status: 'completed'
              });

              logger.info('Platform fee transfer completed successfully', {
                userId,
                parentAccountNumber,
                platformFeeAmount,
                platformFeeReference: platformFeeTransfer.reference,
                originalTransferReference: transaction.reference
              });
            } else {
              logger.error('Platform fee transfer failed', {
                userId,
                parentAccountNumber,
                platformFeeAmount,
                error: platformFeeTransfer.message,
                originalTransferReference: transaction.reference
              });
              // Don't fail the main transfer if platform fee transfer fails
            }
          } catch (platformFeeError) {
            logger.error('Failed to process platform fee transfer', {
              error: platformFeeError.message,
              stack: platformFeeError.stack,
              userId,
              originalTransferReference: transaction.reference
            });
            // Don't fail the main transfer if platform fee transfer fails
          }

          // Update existing beneficiary usage stats if this recipient is already saved
          try {
            const beneficiaryService = require('./beneficiary');
            
            const existingBeneficiary = await beneficiaryService.findBeneficiary(userId, {
              accountNumber: accountValidation.accountNumber,
              bankCode: transferData.bankCode
            });
            
            if (existingBeneficiary) {
              // Update existing beneficiary usage
              await existingBeneficiary.updateUsage(feeCalculation.amount);
              logger.info('Updated existing beneficiary usage', {
                beneficiaryId: existingBeneficiary.id,
                totalTransactions: existingBeneficiary.totalTransactions
              });
            }
          } catch (beneficiaryError) {
            // Don't fail transfer if beneficiary check fails
            logger.warn('Failed to check/update beneficiary', { 
              error: beneficiaryError.message,
              userId 
            });
          }

          // Create mobile app notification for successful transfer
          try {
            const notificationService = require('./notificationService');
            const updatedTransaction = await transactionService.getTransactionByReference(transaction.reference);
            if (updatedTransaction) {
              await notificationService.createTransactionNotification(userId, updatedTransaction, 'debit');
            }
          } catch (notifyError) {
            logger.warn('Failed to create transfer notification', {
              error: notifyError.message,
              userId,
              reference: transaction.reference
            });
          }

          // Send success notification to user (with fallback handling)
          try {
            await this.sendTransferSuccessNotification(user, accountValidation, feeCalculation, transaction.reference, transferData.bankCode);
          } catch (notificationError) {
            // Don't fail the transfer if notification fails
            logger.warn('Failed to send transfer success notification', { 
              error: notificationError.message, 
              userId: user.id,
              reference: transaction.reference 
            });
          }

          return {
            success: true,
            transaction: {
              reference: transaction.reference,
              amount: feeCalculation.amount,
              fee: feeCalculation.totalFee,
              totalAmount: feeCalculation.totalAmount,
              accountNumber: accountValidation.accountNumber,
              accountName: accountValidation.accountName,
              bankName: accountValidation.bank,
              status: 'completed',
              estimatedArrival: '5-15 minutes'
            },
            provider: transferResult
          };
        } else {
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: transferResult.message || 'Transfer failed'
          });

          // Create mobile app notification for failed transfer
          try {
            const notificationService = require('./notificationService');
            const failedTransaction = await transactionService.getTransactionByReference(transaction.reference);
            if (failedTransaction) {
              await notificationService.createTransferFailedNotification(
                userId,
                failedTransaction,
                transferResult.message || 'Transfer failed'
              );
            }
          } catch (notifyError) {
            logger.warn('Failed to create transfer failed notification', {
              error: notifyError.message,
              userId
            });
          }

          throw new Error(transferResult.message || 'Bank transfer failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

        // Create mobile app notification for failed transfer
        try {
          const notificationService = require('./notificationService');
          const failedTransaction = await transactionService.getTransactionByReference(transaction.reference);
          if (failedTransaction) {
            await notificationService.createTransferFailedNotification(
              userId,
              failedTransaction,
              providerError.message
            );
          }
        } catch (notifyError) {
          logger.warn('Failed to create transfer failed notification', {
            error: notifyError.message,
            userId
          });
        }

        throw new Error(`Bank transfer failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Bank transfer failed', { error: error.message, userId, transferData });
      
      // Provide more specific error messages based on error type
      if (error.message.includes('Insufficient wallet balance')) {
        throw new Error(error.message);
      } else if (error.message.includes('Invalid bank account details')) {
        throw new Error('Invalid bank account details. Please check the account number and bank.');
      } else if (error.message.includes('User not found')) {
        throw new Error('Account not found. Please contact support.');
      } else if (error.message.includes('PIN')) {
        throw new Error('Invalid PIN. Please try again.');
      } else if (error.message.includes('Transfer processed')) {
        // This is a misleading error - the transfer actually succeeded
        throw new Error('Transfer completed successfully, but notification failed. Please check your transaction history.');
      } else {
        throw new Error(`Transfer failed: ${error.message}`);
      }
    }
  }

  // Process transfer through Rubies API
  async processRubiesTransfer(transferData) {
    try {
      if (!process.env.RUBIES_API_KEY) {
        // Mock response for testing
        logger.warn('Rubies API not configured, using mock response');
        return {
          success: true,
          reference: `MOCK_TRANSFER_${Date.now()}`,
          sessionId: `SESSION_${Date.now()}`,
          message: 'Transfer successful (mock)',
          response: {
            status: 'success',
            ...transferData
          }
        };
      }

      // Use Rubies service for actual transfer
      const result = await rubiesService.initiateTransfer(transferData);
      
      // Rubies API returns responseCode '00' for success
      const isSuccess = result.success === true || 
                        result.responseCode === '00' || 
                        result.status === 'success';
      
      logger.info('Rubies transfer result', {
        isSuccess,
        responseCode: result.responseCode,
        responseMessage: result.responseMessage,
        hasSuccess: result.success,
        reference: result.reference
      });
      
      return {
        success: isSuccess,
        reference: result.reference || result.transaction_id,
        sessionId: result.session_id || result.sessionId,
        message: result.responseMessage || result.message || 'Transfer processed',
        response: result.response || result,
        responseCode: result.responseCode
      };
    } catch (error) {
      logger.error('Rubies transfer failed', { error: error.message, transferData });
      
      return {
        success: false,
        message: error.message || 'Transfer processing failed',
        response: error.response?.data
      };
    }
  }

  // Helper function to transfer amount to parent account before processing service purchase
  async transferToParentAccount(userId, amount, serviceType, transactionReference) {
    try {
      // MiiMii Technologies parent account for service purchases (airtime, data, bills)
      const parentAccountNumber = process.env.RUBIES_PARENT_ACCOUNT || '1000000963';
      const parentBankCode = '090175'; // Rubies MFB code
      const parentAccountName = 'MiiMii Technologies';
      const parentBankName = 'Rubies MFB';
      
      logger.info('Transferring to parent account before service purchase', {
        userId,
        amount,
        serviceType,
        transactionReference,
        parentAccountNumber,
        parentAccountName,
        parentBankName
      });

      // Transfer amount to parent account
      const parentTransfer = await this.processRubiesTransfer({
        userId: userId,
        accountNumber: parentAccountNumber,
        bankCode: parentBankCode,
        amount: amount,
        narration: `Service purchase: ${serviceType} - ${transactionReference}`,
        reference: `SVC${transactionReference}`,
        senderName: 'MiiMii Platform',
        beneficiaryName: parentAccountName,
        bankName: parentBankName
      });

      if (parentTransfer.success) {
        // Create internal transaction record
        const transactionService = require('./transaction');
        await transactionService.createTransaction(userId, {
          type: 'debit',
          category: 'fee_charge',
          amount: amount,
          fee: 0,
          totalAmount: amount,
          description: `Service purchase funding: ${serviceType} - ${transactionReference}`,
          reference: `SVC${transactionReference}`,
          recipientDetails: {
            accountNumber: parentAccountNumber,
            accountName: parentAccountName,
            bankCode: parentBankCode,
            bankName: parentBankName
          },
          metadata: {
            isInternal: true,
            isVisibleToUser: false,
            isServicePurchaseFunding: true,
            serviceType: serviceType,
            parentTransactionReference: transactionReference,
            service: 'service_purchase_funding',
            providerReference: parentTransfer.reference
          },
          status: 'completed'
        });

        logger.info('Parent account transfer successful', {
          userId,
          amount,
          serviceType,
          transactionReference,
          parentTransferReference: parentTransfer.reference
        });

        return { success: true, reference: parentTransfer.reference };
      } else {
        throw new Error(`Failed to transfer to parent account: ${parentTransfer.message}`);
      }
    } catch (error) {
      logger.error('Failed to transfer to parent account', {
        error: error.message,
        userId,
        amount,
        serviceType,
        transactionReference
      });
      throw error;
    }
  }

  // Send transfer success notification with fallback handling
  async sendTransferSuccessNotification(user, accountValidation, feeCalculation, reference, bankCode) {
    try {
      const receiptService = require('./receipt');
      const whatsappService = require('./whatsapp');
      
      // Get proper bank name for receipt using enhanced resolution
      const bankName = accountValidation.bankName || 
                     accountValidation.bank || 
                     await this.getBankNameFromCode(bankCode || accountValidation.bankCode) || 
                     'Bank';

      const receiptData = {
        type: 'Bank Transfer',
        amount: parseFloat(feeCalculation.amount),
        fee: parseFloat(feeCalculation.totalFee),
        totalAmount: parseFloat(feeCalculation.totalAmount),
        recipientName: accountValidation.accountName,
        recipientBank: bankName,
        recipientAccount: accountValidation.accountNumber,
        reference: reference,
        date: new Date().toLocaleString('en-GB'),
        senderName: `${user.firstName} ${user.lastName}`.trim() || 'MiiMii User'
      };
      
      // Try to generate and send receipt image
      try {
        const receiptBuffer = await receiptService.generateTransferReceipt(receiptData);
        await whatsappService.sendImageMessage(user.whatsappNumber, receiptBuffer, 'transfer-receipt.jpg', 'Transfer Receipt');
        logger.info('Transfer receipt image sent successfully', { userId: user.id, reference });
      } catch (imageError) {
        logger.warn('Failed to generate/send receipt image, falling back to text', { 
          error: imageError.message,
          userId: user.id,
          reference 
        });
        
        // Fallback to text message
        const textMessage = `✅ *Transfer Successful!*\n\n` +
                          `💰 Amount: ₦${feeCalculation.amount.toLocaleString()}\n` +
                          `💸 Fee: ₦${feeCalculation.totalFee}\n` +
                          `👤 To: ${accountValidation.accountName}\n` +
                          `🏦 Bank: ${bankName}\n` +
                          `🔢 Account: ${accountValidation.accountNumber}\n` +
                          `📋 Reference: ${reference}\n` +
                          `📅 Date: ${new Date().toLocaleString('en-GB')}\n\n` +
                          `Your transfer has been completed successfully! 🎉`;
        
        await whatsappService.sendTextMessage(user.whatsappNumber, textMessage);
        logger.info('Transfer success text message sent', { userId: user.id, reference });
      }
      
      // Check if this is a new beneficiary and ask to save
      const beneficiaryService = require('./beneficiary');
      const existingBeneficiary = await beneficiaryService.findBeneficiary(user.id, {
        accountNumber: accountValidation.accountNumber,
        bankCode: bankCode || accountValidation.bankCode
      });
      
      if (!existingBeneficiary) {
        // Store pending beneficiary data in conversation state
        const conversationStateToSave = {
          intent: 'save_beneficiary_prompt',
          awaitingInput: 'save_beneficiary_confirmation',
          context: 'post_transfer',
          pendingBeneficiary: {
            accountNumber: accountValidation.accountNumber,
            bankCode: bankCode || accountValidation.bankCode,
            bankName: accountValidation.bankName || accountValidation.bank || bankName,
            recipientName: accountValidation.accountName,
            amount: feeCalculation.amount
          }
        };
        
        await user.updateConversationState(conversationStateToSave);
        
        // Wait a bit to ensure state is persisted to database
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Reload user to verify state was saved
        await user.reload();
        
        // Verify state was actually saved
        if (!user.conversationState || user.conversationState?.awaitingInput !== 'save_beneficiary_confirmation') {
          logger.error('Save beneficiary conversation state was not saved correctly', {
            userId: user.id,
            expectedState: conversationStateToSave,
            actualState: user.conversationState
          });
          
          // Retry saving the state once more
          try {
            await user.updateConversationState(conversationStateToSave);
            await new Promise(resolve => setTimeout(resolve, 200));
            await user.reload();
            
            if (!user.conversationState || user.conversationState?.awaitingInput !== 'save_beneficiary_confirmation') {
              logger.error('Retry failed - conversation state still not saved', {
                userId: user.id,
                actualState: user.conversationState
              });
              throw new Error('Failed to save conversation state for beneficiary prompt');
            }
          } catch (retryError) {
            logger.error('Failed to retry saving conversation state', {
              error: retryError.message,
              userId: user.id
            });
            throw retryError;
          }
        }
        
        // Ask user if they want to save this beneficiary
        const savePrompt = `💡 *Save Beneficiary?*\n\n` +
                          `Would you like to save *${accountValidation.accountName}* as a beneficiary?\n\n` +
                          `Next time, you can just say:\n` +
                          `"Send ₦1k to ${accountValidation.accountName}"\n\n` +
                          `Or add a nickname like "my mum", "my brother", "my babe" and say:\n` +
                          `"Send ₦1k to my mum"\n\n` +
                          `Reply *YES* to save or *NO* to skip.`;
        
        await whatsappService.sendTextMessage(user.whatsappNumber, savePrompt);
        
        // Final reload to verify state is still there
        await user.reload();
        
        logger.info('Sent save beneficiary prompt and stored pending data', {
          userId: user.id,
          recipientName: accountValidation.accountName,
          accountNumber: accountValidation.accountNumber,
          bankCode: bankCode || accountValidation.bankCode,
          conversationStateAfterSave: user.conversationState,
          stateWasSaved: !!user.conversationState,
          awaitingInput: user.conversationState?.awaitingInput,
          hasPendingBeneficiary: !!user.conversationState?.pendingBeneficiary
        });
      }
      
    } catch (error) {
      logger.error('Failed to send transfer success notification', { 
        error: error.message, 
        userId: user.id, 
        reference 
      });
      throw error;
    }
  }

  // Get transfer history
  async getTransferHistory(userId, limit = 10, offset = 0) {
    try {
      const { supabase } = require('../database/connection');
      
      const { data: transactions, error, count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('userId', userId)
        .eq('category', 'bank_transfer')
        .eq('type', 'debit')
        .order('createdAt', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;

      return {
        transactions: (transactions || []).map(tx => ({
          reference: tx.reference,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          totalAmount: parseFloat(tx.totalAmount),
          accountNumber: tx.metadata?.recipientDetails?.accountNumber,
          accountName: tx.metadata?.recipientDetails?.accountName,
          bankName: tx.metadata?.recipientDetails?.bankName,
          narration: tx.metadata?.recipientDetails?.narration,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.metadata?.processedAt || null,
          estimatedArrival: tx.status === 'completed' ? 'Delivered' : '5-15 minutes'
        })),
        pagination: {
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get transfer history', { error: error.message, userId });
      throw error;
    }
  }

  // Get transfer limits for user
  async getTransferLimits(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const { supabase } = require('../database/connection');

      const [dailyResult, monthlyResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount')
          .eq('userId', userId)
          .eq('category', 'bank_transfer')
          .eq('status', 'completed')
          .gte('createdAt', today.toISOString()),
        supabase
          .from('transactions')
          .select('amount')
          .eq('userId', userId)
          .eq('category', 'bank_transfer')
          .eq('status', 'completed')
          .gte('createdAt', monthStart.toISOString())
      ]);
      
      const dailyUsed = (dailyResult.data || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const monthlyUsed = (monthlyResult.data || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      return {
        limits: this.limits,
        usage: {
          dailyUsed: dailyUsed || 0,
          monthlyUsed: monthlyUsed || 0,
          dailyRemaining: this.limits.dailyLimit - (dailyUsed || 0),
          monthlyRemaining: this.limits.monthlyLimit - (monthlyUsed || 0)
        },
        fees: this.fees
      };
    } catch (error) {
      logger.error('Failed to get transfer limits', { error: error.message, userId });
      throw error;
    }
  }

  // Get recent beneficiaries
  async getRecentBeneficiaries(userId, limit = 5) {
    try {
      const databaseService = require('./database');
      const supabaseHelper = require('./supabaseHelper');

      const transactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', {
          userId,
          category: 'bank_transfer',
          type: 'debit',
          status: 'completed'
        }, {
          orderBy: 'createdAt',
          order: 'desc',
          limit: parseInt(limit) * 2 // Get more to filter duplicates
        });
      });

      // Remove duplicates based on account number
      const uniqueBeneficiaries = [];
      const seen = new Set();

      for (const tx of transactions) {
        const accountNumber = tx.metadata?.recipientDetails?.accountNumber;
        if (!seen.has(accountNumber) && accountNumber) {
          seen.add(accountNumber);
          uniqueBeneficiaries.push({
            accountNumber,
            accountName: tx.metadata?.recipientDetails?.accountName,
            bankCode: tx.metadata?.recipientDetails?.bankCode,
            bankName: tx.metadata?.recipientDetails?.bankName,
            lastAmount: parseFloat(tx.amount),
            lastTransfer: tx.createdAt
          });
          
          if (uniqueBeneficiaries.length >= limit) break;
        }
      }

      return uniqueBeneficiaries;
    } catch (error) {
      logger.error('Failed to get recent beneficiaries', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new BankTransferService();
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

    // Transfer fees structure - Flat fee for all transfers
    this.fees = {
      flatFee: 15, // Fixed 15 naira fee for ALL transfers regardless of amount
      sameBankFee: 15, // Same as flat fee
      otherBankFee: 15, // Same as flat fee
      percentageFee: 0, // No percentage fee
      freeThreshold: 0 // Not applicable with flat fee
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

  // Calculate transfer fees
  calculateTransferFee(amount, transferType, sameBank = false) {
    const numAmount = parseFloat(amount);
    
    // Flat fee of 15 naira for ALL transfers regardless of amount
    const totalFee = 15;
    
    return {
      baseFee: 15,
      percentageFee: 0,
      totalFee: 15,
      amount: numAmount,
      totalAmount: numAmount + totalFee
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
      
      const { Transaction } = require('../models');
      const dailyTransfers = await Transaction.sum('amount', {
        where: {
          userId,
          category: 'bank_transfer',
          status: 'completed',
          createdAt: {
            [require('sequelize').Op.gte]: today
          }
        }
      });

      const totalDailyAmount = (dailyTransfers || 0) + numAmount;
      if (totalDailyAmount > this.limits.dailyLimit) {
        throw new Error(`Daily transfer limit of ₦${this.limits.dailyLimit.toLocaleString()} exceeded`);
      }

      // Check monthly limits
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthlyTransfers = await Transaction.sum('amount', {
        where: {
          userId,
          category: 'bank_transfer',
          status: 'completed',
          createdAt: {
            [require('sequelize').Op.gte]: monthStart
          }
        }
      });

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
      const wallet = await walletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const walletBalance = parseFloat(wallet.balance);
      const totalAmount = feeCalculation.totalAmount;

      // Check if user has sufficient balance
      if (walletBalance < totalAmount) {
        const shortfall = totalAmount - walletBalance;
        throw new Error(`Insufficient wallet balance. You need ₦${totalAmount.toLocaleString()} but only have ₦${walletBalance.toLocaleString()}. Please fund your wallet with ₦${shortfall.toLocaleString()} more.`);
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

          throw new Error(transferResult.message || 'Bank transfer failed');
        }
      } catch (providerError) {
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message
        });

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
        await user.updateConversationState({
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
        });
        
        // Ask user if they want to save this beneficiary
        const savePrompt = `💡 *Save Beneficiary?*\n\n` +
                          `Would you like to save *${accountValidation.accountName}* as a beneficiary?\n\n` +
                          `Next time, you can simply say:\n` +
                          `"Send 1k to ${accountValidation.accountName}"\n\n` +
                          `Reply *YES* to save or *NO* to skip.`;
        
        await whatsappService.sendTextMessage(user.whatsappNumber, savePrompt);
        
        // Reload user to verify state was saved
        await user.reload();
        
        logger.info('Sent save beneficiary prompt and stored pending data', {
          userId: user.id,
          recipientName: accountValidation.accountName,
          accountNumber: accountValidation.accountNumber,
          bankCode: bankCode || accountValidation.bankCode,
          conversationStateAfterSave: user.conversationState,
          stateWasSaved: !!user.conversationState
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
      const { Transaction } = require('../models');
      
      const transactions = await Transaction.findAndCountAll({
        where: {
          userId,
          category: 'bank_transfer',
          type: 'debit'
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return {
        transactions: transactions.rows.map(tx => ({
          reference: tx.reference,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          totalAmount: parseFloat(tx.totalAmount),
          accountNumber: tx.recipientDetails?.accountNumber,
          accountName: tx.recipientDetails?.accountName,
          bankName: tx.recipientDetails?.bankName,
          narration: tx.recipientDetails?.narration,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.processedAt,
          estimatedArrival: tx.status === 'completed' ? 'Delivered' : '5-15 minutes'
        })),
        pagination: {
          total: transactions.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(transactions.count / limit)
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

      const { Transaction } = require('../models');

      const [dailyUsed, monthlyUsed] = await Promise.all([
        Transaction.sum('amount', {
          where: {
            userId,
            category: 'bank_transfer',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: today }
          }
        }),
        Transaction.sum('amount', {
          where: {
            userId,
            category: 'bank_transfer',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: monthStart }
          }
        })
      ]);

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
      const { Transaction } = require('../models');

      const transactions = await Transaction.findAll({
        where: {
          userId,
          category: 'bank_transfer',
          type: 'debit',
          status: 'completed'
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit) * 2, // Get more to filter duplicates
        attributes: ['recipientDetails', 'createdAt', 'amount']
      });

      // Remove duplicates based on account number
      const uniqueBeneficiaries = [];
      const seen = new Set();

      for (const tx of transactions) {
        const accountNumber = tx.recipientDetails?.accountNumber;
        if (!seen.has(accountNumber) && accountNumber) {
          seen.add(accountNumber);
          uniqueBeneficiaries.push({
            accountNumber,
            accountName: tx.recipientDetails.accountName,
            bankCode: tx.recipientDetails.bankCode,
            bankName: tx.recipientDetails.bankName,
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
const rubiesService = require('./rubies');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const activityLogger = require('./activityLogger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { supabase } = require('../database/connection');

class RubiesWalletService {
  constructor() {
    this.rubiesService = rubiesService;
  }

  // Create a Rubies wallet for a user
  async createRubiesWallet(userId) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate required user data
      const requiredFields = ['firstName', 'lastName', 'bvn', 'dateOfBirth', 'whatsappNumber'];
      for (const field of requiredFields) {
        if (!user[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const payload = {
        bvn: user.bvn.toString().trim(),
        countryCode: '234',
        currency: 'NGN',
        dob: user.dateOfBirth, // Format: YYYY-MM-DD
        email: user.email || `${user.whatsappNumber.replace('+', '')}@miimii.com`,
        firstName: user.firstName.trim(),
        lastName: user.lastName.trim(),
        phoneNumber: user.whatsappNumber.replace('+', '')
      };

      logger.info('Creating Rubies wallet', {
        userId,
        phoneNumber: payload.phoneNumber,
        bvn: payload.bvn.substring(0, 3) + '***' + payload.bvn.substring(payload.bvn.length - 3)
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/create-wallet', payload);

      if (response.responseCode === '00') {
        logger.info('Rubies wallet created successfully', {
          userId,
          accountNumber: response.accountNumber,
          customerId: response.customerId
        });

        // Update user's wallet with Rubies account details
        const wallet = await walletService.getUserWallet(userId);
        if (wallet) {
          await databaseService.executeWithRetry(async () => {
            const { error } = await supabase
              .from('wallets')
              .update({
                virtualAccountNumber: response.accountNumber,
                virtualAccountBank: 'Rubies MFB',
                virtualAccountName: `${user.firstName} ${user.lastName}`,
                accountReference: response.customerId,
                updatedAt: new Date().toISOString()
              })
              .eq('id', wallet.id);
            
            if (error) throw error;
          });
        }

        // Log activity
        await activityLogger.logUserActivity(
          userId,
          'wallet_funding',
          'rubies_wallet_created',
          {
            description: 'Rubies wallet created successfully',
            provider: 'rubies',
            success: true,
            accountNumber: response.accountNumber,
            customerId: response.customerId,
            source: 'api'
          }
        );

        return {
          success: true,
          accountNumber: response.accountNumber,
          customerId: response.customerId,
          message: 'Rubies wallet created successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to create Rubies wallet');
      }
    } catch (error) {
      logger.error('Rubies wallet creation error', {
        userId,
        error: error.message,
        stack: error.stack
      });

      // Log activity
      await activityLogger.logUserActivity(
        userId,
        'wallet_funding',
        'rubies_wallet_creation_error',
        {
          description: 'Rubies wallet creation failed',
          provider: 'rubies',
          success: false,
          error: error.message,
          source: 'api'
        }
      );

      return {
        success: false,
        error: error.message,
        message: 'Failed to create Rubies wallet. Please try again later.'
      };
    }
  }

  // Get Rubies wallet details
  async getRubiesWalletDetails(accountNumber) {
    try {
      const payload = {
        accountNumber: accountNumber
      };

      logger.info('Retrieving Rubies wallet details', { accountNumber });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/retrieve-wallet-details', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          wallet: {
            accountId: response.accountId,
            accountCustomerId: response.accountCustomerId,
            accountNumber: response.accountNumber,
            accountName: response.accountName,
            accountCurrency: response.accountCurrency,
            accountBalance: parseFloat(response.accountBalance || 0),
            accountStatus: response.accountStatus,
            accountLedgerBalance: parseFloat(response.accountLedgerBalance || 0),
            accountPhone: response.accountPhone,
            accountEmail: response.accountEmail,
            accountBvn: response.accountBvn
          }
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve wallet details');
      }
    } catch (error) {
      logger.error('Failed to retrieve Rubies wallet details', {
        accountNumber,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve wallet details'
      };
    }
  }

  // Get all Rubies wallet transactions
  async getRubiesWalletTransactions(accountNumber, startDate = null, endDate = null, page = 1) {
    try {
      const payload = {
        accountNumber: accountNumber,
        page: page
      };

      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;

      logger.info('Retrieving Rubies wallet transactions', { 
        accountNumber, 
        startDate, 
        endDate, 
        page 
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/read-wallet-transaction', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          transactions: response.data || [],
          totalTransactions: response.data ? response.data.length : 0
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve wallet transactions');
      }
    } catch (error) {
      logger.error('Failed to retrieve Rubies wallet transactions', {
        accountNumber,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve wallet transactions'
      };
    }
  }

  // Get all Rubies wallets (for admin purposes)
  async getAllRubiesWallets(startDate = null, endDate = null, searchItem = null, page = 1, pageSize = 10) {
    try {
      const payload = {
        page: page,
        pageSize: pageSize
      };

      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      if (searchItem) payload.searchItem = searchItem;

      logger.info('Retrieving all Rubies wallets', { 
        startDate, 
        endDate, 
        searchItem, 
        page, 
        pageSize 
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/read-wallet-list', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          wallets: response.data || [],
          totalWallets: response.data ? response.data.length : 0
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve wallets');
      }
    } catch (error) {
      logger.error('Failed to retrieve all Rubies wallets', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve wallets'
      };
    }
  }

  // Get all wallet transactions (for admin purposes)
  async getAllRubiesWalletTransactions(startDate = null, endDate = null, searchItem = null, page = 1) {
    try {
      const payload = {
        page: page
      };

      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      if (searchItem) payload.searchItem = searchItem;

      logger.info('Retrieving all Rubies wallet transactions', { 
        startDate, 
        endDate, 
        searchItem, 
        page 
      });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/read-all-wallet-transactions', payload);

      if (response.responseCode === '00') {
        return {
          success: true,
          transactions: response.data || [],
          totalTransactions: response.data ? response.data.length : 0
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to retrieve all wallet transactions');
      }
    } catch (error) {
      logger.error('Failed to retrieve all Rubies wallet transactions', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve all wallet transactions'
      };
    }
  }

  // Create sub-account (for business accounts)
  async createSubAccount(accountName) {
    try {
      const payload = {
        accountName: accountName
      };

      logger.info('Creating Rubies sub-account', { accountName });

      const response = await this.rubiesService.makeRequest('POST', '/baas-wallet/create-sub-account', payload);

      if (response.responseCode === '00') {
        logger.info('Rubies sub-account created successfully', {
          accountNumber: response.accountNumber,
          customerId: response.customerId
        });

        return {
          success: true,
          accountNumber: response.accountNumber,
          customerId: response.customerId,
          message: 'Sub-account created successfully'
        };
      } else {
        throw new Error(response.responseMessage || 'Failed to create sub-account');
      }
    } catch (error) {
      logger.error('Rubies sub-account creation error', {
        accountName,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to create sub-account. Please try again later.'
      };
    }
  }

  // Sync Rubies wallet balance with local wallet
  async syncWalletBalance(userId) {
    try {
      const wallet = await walletService.getUserWallet(userId);
      if (!wallet || !wallet.virtualAccountNumber) {
        throw new Error('Rubies wallet not found for user');
      }

      const walletDetails = await this.getRubiesWalletDetails(wallet.virtualAccountNumber);
      
      if (walletDetails.success) {
        const rubiesBalance = walletDetails.wallet.accountBalance;
        const rubiesLedgerBalance = walletDetails.wallet.accountLedgerBalance;

        // Update local wallet with Rubies balance
        await databaseService.executeWithRetry(async () => {
          const { error } = await supabase
            .from('wallets')
            .update({
              balance: rubiesBalance,
              ledgerBalance: rubiesLedgerBalance,
              updatedAt: new Date().toISOString()
            })
            .eq('id', wallet.id);
          
          if (error) throw error;
        });

        logger.info('Wallet balance synced with Rubies', {
          userId,
          accountNumber: wallet.virtualAccountNumber,
          balance: rubiesBalance,
          ledgerBalance: rubiesLedgerBalance
        });

        return {
          success: true,
          balance: rubiesBalance,
          ledgerBalance: rubiesLedgerBalance,
          message: 'Wallet balance synced successfully'
        };
      } else {
        throw new Error(walletDetails.error || 'Failed to sync wallet balance');
      }
    } catch (error) {
      logger.error('Failed to sync wallet balance', {
        userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to sync wallet balance'
      };
    }
  }

  // Check if user has Rubies wallet
  async hasRubiesWallet(userId) {
    try {
      const wallet = await walletService.getUserWallet(userId);
      return !!(wallet && wallet.virtualAccountNumber && wallet.virtualAccountBank === 'Rubies MFB');
    } catch (error) {
      logger.error('Failed to check Rubies wallet status', {
        userId,
        error: error.message
      });
      return false;
    }
  }

  // Get Rubies wallet status
  async getRubiesWalletStatus(userId) {
    try {
      const wallet = await walletService.getUserWallet(userId);
      
      if (!wallet) {
        return {
          hasWallet: false,
          status: 'NO_WALLET',
          message: 'No wallet found'
        };
      }

      if (!wallet.virtualAccountNumber || wallet.virtualAccountBank !== 'Rubies MFB') {
        return {
          hasWallet: false,
          status: 'NO_RUBIES_WALLET',
          message: 'No Rubies wallet found'
        };
      }

      // Get current status from Rubies
      const walletDetails = await this.getRubiesWalletDetails(wallet.virtualAccountNumber);
      
      if (walletDetails.success) {
        return {
          hasWallet: true,
          status: walletDetails.wallet.accountStatus,
          accountNumber: walletDetails.wallet.accountNumber,
          balance: walletDetails.wallet.accountBalance,
          message: 'Rubies wallet is active'
        };
      } else {
        return {
          hasWallet: true,
          status: 'ERROR',
          message: 'Failed to retrieve wallet status from Rubies'
        };
      }
    } catch (error) {
      logger.error('Failed to get Rubies wallet status', {
        userId,
        error: error.message
      });

      return {
        hasWallet: false,
        status: 'ERROR',
        message: 'Failed to check wallet status'
      };
    }
  }
}

module.exports = new RubiesWalletService();

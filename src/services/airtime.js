const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');

class AirtimeService {
  constructor() {
    // Bilal API configuration for airtime services
    this.baseURL = process.env.BILAL_BASE_URL;
    this.apiKey = process.env.BILAL_API_KEY;
    this.serviceId = process.env.BILAL_SERVICE_ID;
    
    // Nigerian network operators
    this.networks = {
      MTN: 'mtn',
      AIRTEL: 'airtel',
      GLO: 'glo',
      '9MOBILE': '9mobile'
    };

    // Airtime minimum and maximum amounts
    this.limits = {
      minimum: 50,
      maximum: 50000
    };

    // Supported amounts for quick selection
    this.quickAmounts = [100, 200, 500, 1000, 2000, 5000, 10000];
  }

  // Get all available networks
  async getNetworks() {
    try {
      return Object.keys(this.networks).map(name => ({
        name,
        code: this.networks[name],
        label: name === '9MOBILE' ? '9mobile' : name.charAt(0) + name.slice(1).toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to get networks', { error: error.message });
      throw error;
    }
  }

  // Get airtime limits and quick amounts
  async getAirtimeLimits() {
    try {
      return {
        limits: this.limits,
        quickAmounts: this.quickAmounts,
        supportedNetworks: await this.getNetworks()
      };
    } catch (error) {
      logger.error('Failed to get airtime limits', { error: error.message });
      throw error;
    }
  }

  // Clean phone number for processing (removed network validation - let provider API handle it)
  async cleanPhoneNumber(phoneNumber) {
    try {
      const cleanNumber = userService.cleanPhoneNumber(phoneNumber);
      return { valid: true, cleanNumber };
    } catch (error) {
      logger.error('Phone number cleaning failed', { error: error.message, phoneNumber });
      throw error;
    }
  }

  // Validate airtime amount
  validateAmount(amount) {
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (numAmount < this.limits.minimum) {
      throw new Error(`Minimum airtime amount is ₦${this.limits.minimum}`);
    }
    
    if (numAmount > this.limits.maximum) {
      throw new Error(`Maximum airtime amount is ₦${this.limits.maximum}`);
    }
    
    return numAmount;
  }

  // Purchase airtime
  async purchaseAirtime(userId, phoneNumber, network, amount, pin) {
    try {
      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Validate amount
      const validAmount = this.validateAmount(amount);

      // Clean phone number for processing
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
      // Calculate fee (typically 0-2% for airtime)
      const fee = Math.ceil(validAmount * 0.01); // 1% fee
      const totalAmount = validAmount + fee;

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Create transaction record
      const transaction = await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'airtime_purchase',
        amount: validAmount,
        fee: fee,
        totalAmount: totalAmount,
        description: `Airtime purchase: ₦${validAmount} for ${validation.cleanNumber} (${network})`,
        recipientDetails: {
          phoneNumber: validation.cleanNumber,
          network: validation.network,
          amount: validAmount
        },
        metadata: {
          service: 'airtime',
          network: validation.network,
          amount: validAmount,
          phoneNumber: validation.cleanNumber
        }
      });

      try {
        // Step 1: Check user wallet balance FIRST
        const walletBalance = await walletService.getWalletBalance(userId, true);
        if (walletBalance.available < totalAmount) {
          throw new Error(`Insufficient wallet balance. Required: ₦${totalAmount}, Available: ₦${walletBalance.available}`);
        }
        
        // Step 2: Check provider (Bilal) balance
        // Use airtime-specific balance check
        const bilalService = require('./bilal');
        await bilalService.checkProviderBalance(validAmount, true); // true = for airtime
        
        // Step 3: Process airtime purchase through Bilal API FIRST (before debiting user)
        // This ensures provider purchase succeeds before we debit the user
        const purchaseResult = await this.processBilalAirtimePurchase(user, validation.cleanNumber, network, validAmount, pin);
        
        if (!purchaseResult.success) {
          // Provider purchase failed - user was never debited, just update transaction
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: purchaseResult.message || 'Provider purchase failed',
            providerResponse: purchaseResult.response
          });

          throw new Error(purchaseResult.message || 'Airtime purchase failed');
        }
        
        // Step 4: Provider purchase succeeded - now debit user wallet
        // Use actual amount from provider response if available, otherwise use requested amount
        const actualAmount = purchaseResult.data?.amount ? parseFloat(purchaseResult.data.amount) : validAmount;
        const actualTotalAmount = actualAmount + fee;
        
        // Re-check wallet balance before debiting (in case it changed)
        const finalWalletBalance = await walletService.getWalletBalance(userId, true);
        if (finalWalletBalance.available < actualTotalAmount) {
          // This should rarely happen, but if it does, we need to handle it
          // The provider purchase already succeeded, so we need to log this as a critical error
          logger.error('Critical: Provider purchase succeeded but user wallet insufficient after purchase', {
            userId,
            required: actualTotalAmount,
            available: finalWalletBalance.available,
            transactionReference: transaction.reference
          });
          
          // Update transaction as failed
          await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
            failureReason: 'Insufficient wallet balance after provider purchase',
            providerReference: purchaseResult.reference,
            providerResponse: purchaseResult.response,
            criticalError: true
          });
          
          throw new Error('Insufficient wallet balance after provider purchase. Please contact support.');
        }
        
        // Debit wallet with actual amount
        await walletService.debitWallet(userId, actualTotalAmount, `Airtime purchase: ₦${actualAmount}`, {
          category: 'airtime_purchase',
          transactionId: transaction.id,
          providerReference: purchaseResult.reference,
          providerResponse: purchaseResult.response
        });
        
        // Step 5: Transfer amount to parent account (after successful purchase and debit)
        const bankTransferService = require('./bankTransfer');
        await bankTransferService.transferToParentAccount(userId, actualTotalAmount, 'airtime', transaction.reference);
        
        // Step 6: Update transaction status
        await transactionService.updateTransactionStatus(transaction.reference, 'completed', {
          providerReference: purchaseResult.reference,
          providerResponse: purchaseResult.response,
          actualAmount: actualAmount,
          actualTotalAmount: actualTotalAmount
        });

        // Step 7: Generate and send receipt
        let receiptSent = false;
        try {
          const receiptService = require('./receipt');
          const whatsappService = require('./whatsapp');
          const activityLogger = require('./activityLogger');
          
          const receiptData = {
            network: purchaseResult.data?.network || network,
            phoneNumber: purchaseResult.data?.phone_number || validation.cleanNumber,
            amount: actualAmount,
            reference: purchaseResult.reference || transaction.reference,
            date: new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            status: 'Successful',
            discount: purchaseResult.data?.discount || 0
          };

          const receiptBuffer = await receiptService.generateAirtimeReceipt(receiptData);
          await whatsappService.sendImageMessage(user.whatsappNumber, receiptBuffer, 'receipt.jpg');
          receiptSent = true;
          
          // Log activity
          await activityLogger.logUserActivity(
            userId,
            'airtime_purchase',
            'airtime_purchased',
            {
              description: 'Airtime purchased successfully',
              network: receiptData.network,
              phoneNumber: receiptData.phoneNumber,
              amount: actualAmount,
              discount: receiptData.discount,
              provider: 'bilal',
              success: true,
              source: 'api'
            }
          );
        } catch (receiptError) {
          logger.warn('Failed to generate receipt, sending text message only', { error: receiptError.message });
          const whatsappService = require('./whatsapp');
          const successMessage = `✅ *Airtime Purchase Successful!*\n\n` +
            `Network: ${purchaseResult.data?.network || network}\n` +
            `Phone: ${purchaseResult.data?.phone_number || validation.cleanNumber}\n` +
            `Amount: ₦${actualAmount}\n` +
            `Reference: ${purchaseResult.reference || transaction.reference}\n\n` +
            `${purchaseResult.data?.message || 'Airtime purchase completed successfully'}`;
          await whatsappService.sendTextMessage(user.whatsappNumber, successMessage);
          receiptSent = true; // Mark as sent even if it's text fallback
        }

        logger.info('Airtime purchase completed successfully', {
          userId,
          phoneNumber: validation.cleanNumber,
          network: validation.network,
          amount: actualAmount,
          fee,
          totalAmount: actualTotalAmount,
          reference: transaction.reference,
          receiptSent
        });

        return {
          success: true,
          transaction: {
            reference: transaction.reference,
            amount: actualAmount,
            fee,
            totalAmount: actualTotalAmount,
            phoneNumber: validation.cleanNumber,
            network: validation.network,
            status: 'completed'
          },
          provider: purchaseResult
        };
      } catch (providerError) {
        // Provider error - user was never debited, so no refund needed
        const isBalanceCheckError = providerError.message && providerError.message.includes('Provider has insufficient balance');
        
        logger.info('Airtime purchase failed before user debit', {
          userId,
          transactionReference: transaction.reference,
          error: providerError.message,
          isBalanceCheckError
        });
        
        // Update transaction as failed
        await transactionService.updateTransactionStatus(transaction.reference, 'failed', {
          failureReason: providerError.message,
          awaitingRefund: false // User was never debited
        });

        // Send error message to user
        try {
          const whatsappService = require('./whatsapp');
          const errorMessage = `❌ Airtime purchase failed!\n\nReason: ${providerError.message}\n\nPlease try again or contact support.`;
          await whatsappService.sendTextMessage(user.whatsappNumber, errorMessage);
        } catch (messageError) {
          logger.warn('Failed to send error message to user', { error: messageError.message });
        }

        throw new Error(`Airtime purchase failed: ${providerError.message}`);
      }
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId, phoneNumber, network, amount });
      throw error;
    }
  }

  // Process airtime purchase through Bilal API
  async processBilalAirtimePurchase(user, phoneNumber, network, amount, pin) {
    try {
      const bilalService = require('./bilal');
      
      logger.info('Processing airtime purchase through Bilal API', {
        userId: user.id,
        phoneNumber,
        network,
        amount
      });

      const airtimeData = {
        phoneNumber,
        network,
        amount,
        pin: pin // Use the validated PIN
      };

      const result = await bilalService.purchaseAirtime(user, airtimeData, phoneNumber);
      
      logger.info('Bilal airtime purchase completed', {
        success: result.success,
        userId: user.id,
        phoneNumber,
        network,
        amount,
        reference: result.reference
      });

      return result;
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId: user.id, phoneNumber, network, amount });
      throw error;
    }
  }

  // Get airtime purchase history for user
  async getAirtimePurchaseHistory(userId, limit = 10, offset = 0) {
    try {
      const { supabase } = require('../database/connection');
      const { data: transactions, error, count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('userId', userId)
        .eq('category', 'airtime_purchase')
        .eq('type', 'debit')
        .order('createdAt', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;

      return {
        transactions: (transactions || []).map(tx => ({
          reference: tx.reference,
          amount: parseFloat(tx.amount || 0),
          fee: parseFloat(tx.fee || 0),
          totalAmount: parseFloat(tx.totalAmount || 0),
          phoneNumber: tx.metadata?.recipientDetails?.phoneNumber,
          network: tx.metadata?.recipientDetails?.network,
          status: tx.status,
          description: tx.description,
          createdAt: tx.createdAt,
          processedAt: tx.metadata?.processedAt || null
        })),
        pagination: {
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get airtime purchase history', { error: error.message, userId });
      throw error;
    }
  }

  // Get network from phone number
  async detectNetwork(phoneNumber) {
    try {
      const cleanNumber = userService.cleanPhoneNumber(phoneNumber);
      
      // Nigerian network prefixes
      const prefixes = {
        mtn: ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906'],
        airtel: ['0802', '0808', '0708', '0812', '0701', '0902', '0907', '0901', '0904'], // Added 0904 for AIRTEL
        glo: ['0805', '0807', '0705', '0815', '0811', '0905'],
        '9mobile': ['0809', '0818', '0817', '0909', '0908']
      };

      const prefix = cleanNumber.substring(0, 4);
      
      for (const [network, networkPrefixes] of Object.entries(prefixes)) {
        if (networkPrefixes.includes(prefix)) {
          return {
            phoneNumber: cleanNumber,
            network,
            networkName: network === '9mobile' ? '9mobile' : network.toUpperCase()
          };
        }
      }

      throw new Error('Unable to detect network for this phone number');
    } catch (error) {
      logger.error('Network detection failed', { error: error.message, phoneNumber });
      throw error;
    }
  }

  // Check airtime balance (if supported by network)
  async checkAirtimeBalance(phoneNumber, network) {
    try {
      const validation = await this.cleanPhoneNumber(phoneNumber);
      
      // Most Nigerian networks don't provide balance check APIs
      // Users typically dial network-specific codes
      const balanceCodes = {
        mtn: '*556#',
        airtel: '*123#',
        glo: '*124#',
        '9mobile': '*232#'
      };

      return {
        phoneNumber: validation.cleanNumber,
        network: validation.network,
        balanceCode: balanceCodes[validation.network],
        message: `To check your airtime balance, dial ${balanceCodes[validation.network]} from your phone.`
      };
    } catch (error) {
      logger.error('Airtime balance check failed', { error: error.message, phoneNumber, network });
      throw error;
    }
  }
}

module.exports = new AirtimeService();
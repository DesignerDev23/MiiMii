const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const transactionService = require('./transaction');
const crypto = require('crypto');

class VirtualCardService {
  constructor() {
    // Card configuration
    this.cardConfig = {
      types: {
        VIRTUAL_DEBIT: 'virtual_debit',
        VIRTUAL_CREDIT: 'virtual_credit'
      },
      brands: {
        VISA: 'visa',
        MASTERCARD: 'mastercard',
        VERVE: 'verve'
      },
      limits: {
        daily: 500000, // ₦500,000
        monthly: 5000000, // ₦5,000,000
        transaction: 100000, // ₦100,000 per transaction
        minimum: 100 // ₦100 minimum
      },
      fees: {
        creation: 1000, // ₦1,000 card creation fee
        maintenance: 100, // ₦100 monthly maintenance (virtual card specific)
        transaction: 0.015, // 1.5% transaction fee
        maxTransactionFee: 1000 // Maximum ₦1,000 per transaction
      }
    };

    // Card statuses
    this.cardStatuses = {
      ACTIVE: 'active',
      INACTIVE: 'inactive',
      FROZEN: 'frozen',
      EXPIRED: 'expired',
      BLOCKED: 'blocked'
    };
  }

  // Generate virtual card number
  generateCardNumber(brand = 'visa') {
    const prefixes = {
      visa: '4',
      mastercard: '5',
      verve: '5061'
    };

    let cardNumber = prefixes[brand] || prefixes.visa;
    
    // Generate remaining digits
    const remainingLength = 16 - cardNumber.length - 1; // -1 for check digit
    for (let i = 0; i < remainingLength; i++) {
      cardNumber += Math.floor(Math.random() * 10);
    }

    // Add Luhn check digit
    cardNumber += this.calculateLuhnCheckDigit(cardNumber);
    
    return cardNumber;
  }

  // Calculate Luhn check digit
  calculateLuhnCheckDigit(cardNumber) {
    let sum = 0;
    let isEven = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return (10 - (sum % 10)) % 10;
  }

  // Generate CVV
  generateCVV() {
    return Math.floor(Math.random() * 900) + 100; // 3-digit CVV
  }

  // Generate expiry date (2 years from now)
  generateExpiryDate() {
    const now = new Date();
    const expiryDate = new Date(now.getFullYear() + 2, now.getMonth(), 1);
    const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
    const year = String(expiryDate.getFullYear()).slice(-2);
    return `${month}/${year}`;
  }

  // Create virtual card
  async createVirtualCard(userId, cardData, pin) {
    try {
      const { cardType = 'virtual_debit', brand = 'visa', fundingAmount = 0 } = cardData;

      // Get user and validate
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate PIN
      await userService.validateUserPin(userId, pin);

      // Check if user can create cards (KYC required)
      if (!user.canPerformTransactions()) {
        throw new Error('KYC verification required to create virtual cards');
      }

      // Calculate total cost (creation fee + funding amount)
      const totalCost = this.cardConfig.fees.creation + parseFloat(fundingAmount || 0);

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < totalCost) {
        throw new Error('Insufficient wallet balance');
      }

      // Check card limit (max 5 active cards per user)
      const { VirtualCard } = require('../models');
      const activeCards = await VirtualCard.count({
        where: {
          userId,
          status: ['active', 'inactive']
        }
      });

      if (activeCards >= 5) {
        throw new Error('Maximum of 5 virtual cards allowed per user');
      }

      // Generate card details
      const cardNumber = this.generateCardNumber(brand);
      const cvv = this.generateCVV();
      const expiryDate = this.generateExpiryDate();
      const cardHash = crypto.createHash('sha256').update(cardNumber).digest('hex');

      // Create card record
      const virtualCard = await VirtualCard.create({
        userId,
        cardType,
        brand,
        cardNumber: cardHash, // Store hash for security
        maskedCardNumber: `**** **** **** ${cardNumber.slice(-4)}`,
        cvv: crypto.createHash('sha256').update(cvv.toString()).digest('hex'), // Store hash
        expiryDate,
        balance: parseFloat(fundingAmount || 0),
        status: this.cardStatuses.ACTIVE,
        dailyLimit: this.cardConfig.limits.daily,
        monthlyLimit: this.cardConfig.limits.monthly,
        transactionLimit: this.cardConfig.limits.transaction,
        metadata: {
          createdDate: new Date(),
          lastUsed: null,
          totalSpent: 0,
          transactionCount: 0
        }
      });

      // Debit wallet for creation fee and funding
      if (totalCost > 0) {
        await walletService.debitWallet(userId, totalCost, 
          `Virtual card creation${fundingAmount > 0 ? ` and funding: ₦${fundingAmount}` : ''}`, {
          category: 'virtual_card',
          cardId: virtualCard.id,
          breakdown: {
            creationFee: this.cardConfig.fees.creation,
            fundingAmount: parseFloat(fundingAmount || 0)
          }
        });
      }

      // Create transaction record
      if (totalCost > 0) {
        await transactionService.createTransaction(userId, {
          type: 'debit',
          category: 'virtual_card',
          amount: totalCost,
          fee: 0,
          totalAmount: totalCost,
          description: `Virtual card creation - ${brand.toUpperCase()}`,
          reference: `CARD_${Date.now()}`,
          metadata: {
            service: 'virtual_card',
            action: 'create',
            cardId: virtualCard.id,
            cardType,
            brand
          }
        });
      }

      logger.info('Virtual card created successfully', {
        userId,
        cardId: virtualCard.id,
        cardType,
        brand,
        fundingAmount
      });

      return {
        success: true,
        card: {
          id: virtualCard.id,
          cardType,
          brand,
          cardNumber, // Return actual number only once during creation
          cvv, // Return actual CVV only once during creation
          expiryDate,
          maskedCardNumber: virtualCard.maskedCardNumber,
          balance: virtualCard.balance,
          status: virtualCard.status,
          limits: {
            daily: virtualCard.dailyLimit,
            monthly: virtualCard.monthlyLimit,
            transaction: virtualCard.transactionLimit
          },
          createdAt: virtualCard.createdAt
        },
        warning: 'Please save these card details securely. They will not be shown again.'
      };
    } catch (error) {
      logger.error('Virtual card creation failed', { error: error.message, userId, cardData });
      throw error;
    }
  }

  // Get user's virtual cards
  async getUserCards(userId) {
    try {
      const { VirtualCard } = require('../models');
      
      const cards = await VirtualCard.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']]
      });

      return cards.map(card => ({
        id: card.id,
        cardType: card.cardType,
        brand: card.brand,
        maskedCardNumber: card.maskedCardNumber,
        expiryDate: card.expiryDate,
        balance: parseFloat(card.balance),
        status: card.status,
        limits: {
          daily: card.dailyLimit,
          monthly: card.monthlyLimit,
          transaction: card.transactionLimit
        },
        metadata: card.metadata,
        createdAt: card.createdAt
      }));
    } catch (error) {
      logger.error('Failed to get user cards', { error: error.message, userId });
      throw error;
    }
  }

  // Get card details (masked)
  async getCardDetails(userId, cardId) {
    try {
      const { VirtualCard } = require('../models');
      
      const card = await VirtualCard.findOne({
        where: { id: cardId, userId }
      });

      if (!card) {
        throw new Error('Card not found');
      }

      return {
        id: card.id,
        cardType: card.cardType,
        brand: card.brand,
        maskedCardNumber: card.maskedCardNumber,
        expiryDate: card.expiryDate,
        balance: parseFloat(card.balance),
        status: card.status,
        limits: {
          daily: card.dailyLimit,
          monthly: card.monthlyLimit,
          transaction: card.transactionLimit
        },
        usage: await this.getCardUsageStats(cardId),
        metadata: card.metadata,
        createdAt: card.createdAt
      };
    } catch (error) {
      logger.error('Failed to get card details', { error: error.message, userId, cardId });
      throw error;
    }
  }

  // Fund virtual card
  async fundCard(userId, cardId, amount, pin) {
    try {
      // Validate user and PIN
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userService.validateUserPin(userId, pin);

      // Get card
      const { VirtualCard } = require('../models');
      const card = await VirtualCard.findOne({
        where: { id: cardId, userId }
      });

      if (!card) {
        throw new Error('Card not found');
      }

      if (card.status !== this.cardStatuses.ACTIVE) {
        throw new Error('Card is not active');
      }

      const fundingAmount = parseFloat(amount);
      if (fundingAmount < this.cardConfig.limits.minimum) {
        throw new Error(`Minimum funding amount is ₦${this.cardConfig.limits.minimum}`);
      }

      // Check wallet balance
      const walletBalance = await walletService.getWalletBalance(userId);
      if (walletBalance < fundingAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Update card balance
      const newBalance = parseFloat(card.balance) + fundingAmount;
      await card.update({ balance: newBalance });

      // Debit wallet
      await walletService.debitWallet(userId, fundingAmount, 
        `Virtual card funding - ${card.maskedCardNumber}`, {
        category: 'virtual_card',
        cardId: card.id,
        action: 'fund'
      });

      // Create transaction record
      await transactionService.createTransaction(userId, {
        type: 'debit',
        category: 'virtual_card',
        amount: fundingAmount,
        fee: 0,
        totalAmount: fundingAmount,
        description: `Card funding - ${card.maskedCardNumber}`,
        reference: `FUND_${Date.now()}`,
        metadata: {
          service: 'virtual_card',
          action: 'fund',
          cardId: card.id,
          previousBalance: parseFloat(card.balance),
          newBalance: newBalance
        }
      });

      logger.info('Virtual card funded successfully', {
        userId,
        cardId,
        amount: fundingAmount,
        newBalance
      });

      return {
        success: true,
        card: {
          id: card.id,
          maskedCardNumber: card.maskedCardNumber,
          previousBalance: parseFloat(card.balance),
          fundedAmount: fundingAmount,
          newBalance: newBalance
        }
      };
    } catch (error) {
      logger.error('Card funding failed', { error: error.message, userId, cardId, amount });
      throw error;
    }
  }

  // Freeze/Unfreeze card
  async toggleCardStatus(userId, cardId, action, pin) {
    try {
      // Validate user and PIN
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userService.validateUserPin(userId, pin);

      // Get card
      const { VirtualCard } = require('../models');
      const card = await VirtualCard.findOne({
        where: { id: cardId, userId }
      });

      if (!card) {
        throw new Error('Card not found');
      }

      let newStatus;
      let actionDescription;

      switch (action) {
        case 'freeze':
          if (card.status !== this.cardStatuses.ACTIVE) {
            throw new Error('Only active cards can be frozen');
          }
          newStatus = this.cardStatuses.FROZEN;
          actionDescription = 'Card frozen';
          break;
        case 'unfreeze':
          if (card.status !== this.cardStatuses.FROZEN) {
            throw new Error('Only frozen cards can be unfrozen');
          }
          newStatus = this.cardStatuses.ACTIVE;
          actionDescription = 'Card unfrozen';
          break;
        case 'block':
          if (card.status === this.cardStatuses.BLOCKED) {
            throw new Error('Card is already blocked');
          }
          newStatus = this.cardStatuses.BLOCKED;
          actionDescription = 'Card blocked';
          break;
        default:
          throw new Error('Invalid action');
      }

      // Update card status
      await card.update({ 
        status: newStatus,
        metadata: {
          ...card.metadata,
          statusChanges: [
            ...(card.metadata.statusChanges || []),
            {
              from: card.status,
              to: newStatus,
              action,
              timestamp: new Date()
            }
          ]
        }
      });

      logger.info('Card status changed', {
        userId,
        cardId,
        action,
        oldStatus: card.status,
        newStatus
      });

      return {
        success: true,
        card: {
          id: card.id,
          maskedCardNumber: card.maskedCardNumber,
          status: newStatus,
          action: actionDescription
        }
      };
    } catch (error) {
      logger.error('Card status change failed', { error: error.message, userId, cardId, action });
      throw error;
    }
  }

  // Get card usage statistics
  async getCardUsageStats(cardId) {
    try {
      const { Transaction } = require('../models');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [dailySpent, monthlySpent, totalTransactions] = await Promise.all([
        Transaction.sum('amount', {
          where: {
            'metadata.cardId': cardId,
            category: 'virtual_card_transaction',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: today }
          }
        }),
        Transaction.sum('amount', {
          where: {
            'metadata.cardId': cardId,
            category: 'virtual_card_transaction',
            status: 'completed',
            createdAt: { [require('sequelize').Op.gte]: monthStart }
          }
        }),
        Transaction.count({
          where: {
            'metadata.cardId': cardId,
            category: 'virtual_card_transaction',
            status: 'completed'
          }
        })
      ]);

      return {
        dailySpent: parseFloat(dailySpent || 0),
        monthlySpent: parseFloat(monthlySpent || 0),
        totalTransactions: totalTransactions || 0,
        lastTransaction: await this.getLastTransaction(cardId)
      };
    } catch (error) {
      logger.error('Failed to get card usage stats', { error: error.message, cardId });
      return {
        dailySpent: 0,
        monthlySpent: 0,
        totalTransactions: 0,
        lastTransaction: null
      };
    }
  }

  // Get last transaction for card
  async getLastTransaction(cardId) {
    try {
      const { Transaction } = require('../models');
      
      const lastTransaction = await Transaction.findOne({
        where: {
          'metadata.cardId': cardId,
          category: 'virtual_card_transaction'
        },
        order: [['createdAt', 'DESC']]
      });

      if (!lastTransaction) return null;

      return {
        amount: parseFloat(lastTransaction.amount),
        description: lastTransaction.description,
        status: lastTransaction.status,
        createdAt: lastTransaction.createdAt
      };
    } catch (error) {
      logger.error('Failed to get last transaction', { error: error.message, cardId });
      return null;
    }
  }

  // Get card transaction history
  async getCardTransactions(userId, cardId, limit = 10, offset = 0) {
    try {
      const { Transaction } = require('../models');
      
      // Verify card belongs to user
      const { VirtualCard } = require('../models');
      const card = await VirtualCard.findOne({
        where: { id: cardId, userId }
      });

      if (!card) {
        throw new Error('Card not found');
      }

      const transactions = await Transaction.findAndCountAll({
        where: {
          'metadata.cardId': cardId,
          category: ['virtual_card', 'virtual_card_transaction']
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return {
        transactions: transactions.rows.map(tx => ({
          reference: tx.reference,
          type: tx.type,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          description: tx.description,
          status: tx.status,
          createdAt: tx.createdAt,
          metadata: tx.metadata
        })),
        pagination: {
          total: transactions.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(transactions.count / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get card transactions', { error: error.message, userId, cardId });
      throw error;
    }
  }

  // Delete/Close card
  async deleteCard(userId, cardId, pin) {
    try {
      // Validate user and PIN
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userService.validateUserPin(userId, pin);

      // Get card
      const { VirtualCard } = require('../models');
      const card = await VirtualCard.findOne({
        where: { id: cardId, userId }
      });

      if (!card) {
        throw new Error('Card not found');
      }

      // Check if card has balance
      if (parseFloat(card.balance) > 0) {
        // Refund balance to wallet
        await walletService.creditWallet(userId, parseFloat(card.balance), 
          `Card closure refund - ${card.maskedCardNumber}`, {
          category: 'virtual_card',
          cardId: card.id,
          action: 'refund'
        });

        // Create refund transaction
        await transactionService.createTransaction(userId, {
          type: 'credit',
          category: 'virtual_card',
          amount: parseFloat(card.balance),
          fee: 0,
          totalAmount: parseFloat(card.balance),
          description: `Card closure refund - ${card.maskedCardNumber}`,
          reference: `REFUND_${Date.now()}`,
          metadata: {
            service: 'virtual_card',
            action: 'refund',
            cardId: card.id
          }
        });
      }

      // Update card status to blocked (soft delete)
      await card.update({ 
        status: this.cardStatuses.BLOCKED,
        metadata: {
          ...card.metadata,
          deletedAt: new Date(),
          deletionReason: 'User requested deletion'
        }
      });

      logger.info('Virtual card deleted successfully', {
        userId,
        cardId,
        refundedAmount: parseFloat(card.balance)
      });

      return {
        success: true,
        message: 'Card closed successfully',
        refundedAmount: parseFloat(card.balance)
      };
    } catch (error) {
      logger.error('Card deletion failed', { error: error.message, userId, cardId });
      throw error;
    }
  }
}

module.exports = new VirtualCardService();
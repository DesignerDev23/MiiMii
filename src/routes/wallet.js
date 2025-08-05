const express = require('express');
const walletService = require('../services/wallet');
const userService = require('../services/user');
const { body, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to validate request
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get wallet balance by phone number
router.get('/balance/:phoneNumber', 
  param('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const balance = await walletService.getWalletBalance(user.id);
      
      res.json({
        success: true,
        balance,
        user: {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.whatsappNumber,
          phone: user.whatsappNumber,
          kycStatus: user.kycStatus
        }
      });
    } catch (error) {
      logger.error('Failed to get wallet balance', { error: error.message });
      res.status(500).json({ error: 'Failed to get balance' });
    }
  }
);

// Get wallet transactions
router.get('/transactions/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const transactions = await walletService.getWalletTransactions(
        user.id, 
        parseInt(limit), 
        parseInt(offset)
      );
      
      res.json({
        success: true,
        transactions: transactions.map(tx => ({
          reference: tx.reference,
          type: tx.type,
          category: tx.category,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          description: tx.description,
          status: tx.status,
          createdAt: tx.createdAt,
          processedAt: tx.processedAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get wallet transactions', { error: error.message });
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  }
);

// Credit wallet (admin use)
router.post('/credit',
  body('phoneNumber').isMobilePhone('any'),
  body('amount').isFloat({ min: 1 }),
  body('description').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, amount, description, adminNote } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await walletService.creditWallet(
        user.id,
        amount,
        description,
        {
          category: 'admin_adjustment',
          adminCredit: true,
          adminNote
        }
      );
      
      res.json({
        success: true,
        transaction: {
          reference: result.transaction.reference,
          amount: parseFloat(result.transaction.amount),
          newBalance: result.newBalance,
          previousBalance: result.previousBalance
        }
      });
    } catch (error) {
      logger.error('Failed to credit wallet', { error: error.message });
      res.status(500).json({ error: 'Failed to credit wallet' });
    }
  }
);

// Debit wallet (admin use)
router.post('/debit',
  body('phoneNumber').isMobilePhone('any'),
  body('amount').isFloat({ min: 1 }),
  body('description').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, amount, description, adminNote } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await walletService.debitWallet(
        user.id,
        amount,
        description,
        {
          category: 'admin_adjustment',
          adminDebit: true,
          adminNote
        }
      );
      
      res.json({
        success: true,
        transaction: {
          reference: result.transaction.reference,
          amount: parseFloat(result.transaction.amount),
          newBalance: result.newBalance,
          previousBalance: result.previousBalance
        }
      });
    } catch (error) {
      logger.error('Failed to debit wallet', { error: error.message });
      res.status(500).json({ error: error.response?.data?.message || 'Failed to debit wallet' });
    }
  }
);

// Freeze wallet
router.post('/freeze',
  body('phoneNumber').isMobilePhone('any'),
  body('reason').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, reason } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await walletService.freezeWallet(user.id, reason);
      
      res.json({
        success: true,
        message: 'Wallet frozen successfully'
      });
    } catch (error) {
      logger.error('Failed to freeze wallet', { error: error.message });
      res.status(500).json({ error: 'Failed to freeze wallet' });
    }
  }
);

// Unfreeze wallet
router.post('/unfreeze',
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await walletService.unfreezeWallet(user.id);
      
      res.json({
        success: true,
        message: 'Wallet unfrozen successfully'
      });
    } catch (error) {
      logger.error('Failed to unfreeze wallet', { error: error.message });
      res.status(500).json({ error: 'Failed to unfreeze wallet' });
    }
  }
);

// Create virtual account
router.post('/create-virtual-account',
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const virtualAccount = await walletService.createVirtualAccountForWallet(user.id);
      
      res.json({
        success: true,
        virtualAccount
      });
    } catch (error) {
      logger.error('Failed to create virtual account', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Charge maintenance fee manually
router.post('/charge-maintenance-fee',
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await walletService.chargeMaintenanceFee(user.id);
      
      if (!result) {
        return res.json({
          success: true,
          message: 'Maintenance fee not charged (not due or insufficient balance)'
        });
      }
      
      res.json({
        success: true,
        result: {
          fee: parseFloat(result.transaction.amount),
          newBalance: result.newBalance
        }
      });
    } catch (error) {
      logger.error('Failed to charge maintenance fee', { error: error.message });
      res.status(500).json({ error: 'Failed to charge maintenance fee' });
    }
  }
);

module.exports = router;
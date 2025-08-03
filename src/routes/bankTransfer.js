const express = require('express');
const bankTransferService = require('../services/bankTransfer');
const userService = require('../services/user');
const { body, param, query, validationResult } = require('express-validator');
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

// Get all supported banks
router.get('/banks', async (req, res) => {
  try {
    const banks = await bankTransferService.getSupportedBanks();
    
    res.json({
      success: true,
      banks: banks.map(bank => ({
        code: bank.code,
        name: bank.name,
        slug: bank.slug,
        type: bank.type
      }))
    });
  } catch (error) {
    logger.error('Failed to get banks', { error: error.message });
    res.status(500).json({ error: 'Failed to get banks' });
  }
});

// Validate bank account
router.post('/validate-account',
  body('accountNumber').isLength({ min: 10, max: 10 }).isNumeric(),
  body('bankCode').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const validation = await bankTransferService.validateBankAccount(accountNumber, bankCode);
      
      res.json({
        success: validation.valid,
        ...validation
      });
    } catch (error) {
      logger.error('Account validation failed', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Calculate transfer fee
router.post('/calculate-fee',
  body('amount').isFloat({ min: 100, max: 1000000 }),
  body('bankCode').optional().notEmpty(),
  body('sameBank').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { amount, bankCode, sameBank = false } = req.body;
      const feeCalculation = bankTransferService.calculateTransferFee(amount, 'wallet_to_bank', sameBank);
      
      res.json({
        success: true,
        fee: feeCalculation
      });
    } catch (error) {
      logger.error('Fee calculation failed', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get transfer limits for user
router.get('/limits/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const limits = await bankTransferService.getTransferLimits(user.id);
      
      res.json({
        success: true,
        ...limits
      });
    } catch (error) {
      logger.error('Failed to get transfer limits', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get transfer limits' });
    }
  }
);

// Process bank transfer
router.post('/transfer',
  body('userPhone').isMobilePhone('any'),
  body('accountNumber').isLength({ min: 10, max: 10 }).isNumeric(),
  body('bankCode').notEmpty(),
  body('amount').isFloat({ min: 100, max: 1000000 }),
  body('narration').optional().isLength({ max: 100 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('reference').optional().notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, accountNumber, bankCode, amount, narration, pin, reference } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found. Please register first.' });
      }

      // Check if user can perform transactions
      if (!user.canPerformTransactions()) {
        return res.status(403).json({ 
          error: 'Account not eligible for transactions. Please complete KYC verification.' 
        });
      }

      const transferData = {
        accountNumber,
        bankCode,
        amount,
        narration,
        reference
      };

      const result = await bankTransferService.processBankTransfer(user.id, transferData, pin);
      
      res.json({
        success: true,
        message: 'Bank transfer successful',
        data: result
      });
    } catch (error) {
      logger.error('Bank transfer failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get transfer history
router.get('/history/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const history = await bankTransferService.getTransferHistory(user.id, limit, offset);
      
      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Failed to get transfer history', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get transfer history' });
    }
  }
);

// Get recent beneficiaries
router.get('/beneficiaries/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('limit').optional().isInt({ min: 1, max: 20 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { limit = 5 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const beneficiaries = await bankTransferService.getRecentBeneficiaries(user.id, limit);
      
      res.json({
        success: true,
        beneficiaries
      });
    } catch (error) {
      logger.error('Failed to get beneficiaries', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get beneficiaries' });
    }
  }
);

// Get transfer summary for user
router.get('/summary/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { startDate, endDate } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { Transaction } = require('../models');
      const { Op } = require('sequelize');

      const where = {
        userId: user.id,
        category: 'bank_transfer',
        type: 'debit'
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      const [totalTransfers, successfulTransfers, totalAmount, totalFees, bankBreakdown] = await Promise.all([
        Transaction.count({ where }),
        Transaction.count({ where: { ...where, status: 'completed' } }),
        Transaction.sum('amount', { where: { ...where, status: 'completed' } }),
        Transaction.sum('fee', { where: { ...where, status: 'completed' } }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [
            [require('sequelize').literal("recipientDetails->>'bankName'"), 'bankName'],
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount']
          ],
          group: [require('sequelize').literal("recipientDetails->>'bankName'")],
          raw: true
        })
      ]);

      res.json({
        success: true,
        summary: {
          totalTransfers,
          successfulTransfers,
          totalAmount: parseFloat(totalAmount || 0),
          totalFees: parseFloat(totalFees || 0),
          successRate: totalTransfers > 0 ? ((successfulTransfers / totalTransfers) * 100).toFixed(2) : 0,
          bankBreakdown: bankBreakdown.map(item => ({
            bankName: item.bankName,
            count: parseInt(item.count),
            totalAmount: parseFloat(item.totalAmount)
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get transfer summary', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get transfer summary' });
    }
  }
);

// Validate transfer before processing
router.post('/validate-transfer',
  body('userPhone').isMobilePhone('any'),
  body('accountNumber').isLength({ min: 10, max: 10 }).isNumeric(),
  body('bankCode').notEmpty(),
  body('amount').isFloat({ min: 100, max: 1000000 }),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, accountNumber, bankCode, amount } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate account
      const accountValidation = await bankTransferService.validateBankAccount(accountNumber, bankCode);
      if (!accountValidation.valid) {
        return res.status(400).json({ error: 'Invalid bank account details' });
      }

      // Validate limits
      const limitsValidation = await bankTransferService.validateTransferLimits(user.id, amount);
      
      // Calculate fees
      const feeCalculation = bankTransferService.calculateTransferFee(amount, 'wallet_to_bank');

      // Check wallet balance
      const walletService = require('../services/wallet');
      const walletBalance = await walletService.getWalletBalance(user.id);

      res.json({
        success: true,
        validation: {
          accountValidation,
          limitsValidation,
          feeCalculation,
          walletBalance,
          canProceed: walletBalance >= feeCalculation.totalAmount && limitsValidation.valid
        }
      });
    } catch (error) {
      logger.error('Transfer validation failed', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get popular banks (most used by platform)
router.get('/popular-banks', async (req, res) => {
  try {
    const { Transaction } = require('../models');

    const popularBanks = await Transaction.findAll({
      where: {
        category: 'bank_transfer',
        type: 'debit',
        status: 'completed'
      },
      attributes: [
        [require('sequelize').literal("recipientDetails->>'bankCode'"), 'bankCode'],
        [require('sequelize').literal("recipientDetails->>'bankName'"), 'bankName'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'usageCount'],
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalVolume']
      ],
      group: [
        require('sequelize').literal("recipientDetails->>'bankCode'"),
        require('sequelize').literal("recipientDetails->>'bankName'")
      ],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']],
      limit: 10,
      raw: true
    });

    const allBanks = await bankTransferService.getSupportedBanks();

    res.json({
      success: true,
      popularBanks: popularBanks.map(item => ({
        bankCode: item.bankCode,
        bankName: item.bankName,
        usageCount: parseInt(item.usageCount),
        totalVolume: parseFloat(item.totalVolume)
      })),
      allBanks: allBanks.length
    });
  } catch (error) {
    logger.error('Failed to get popular banks', { error: error.message });
    res.status(500).json({ error: 'Failed to get popular banks' });
  }
});

module.exports = router;
const express = require('express');
const airtimeService = require('../services/airtime');
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

// Get all available networks
router.get('/networks', async (req, res) => {
  try {
    const networks = await airtimeService.getNetworks();
    
    res.json({
      success: true,
      networks
    });
  } catch (error) {
    logger.error('Failed to get networks', { error: error.message });
    res.status(500).json({ error: 'Failed to get networks' });
  }
});

// Get airtime limits and quick amounts
router.get('/limits', async (req, res) => {
  try {
    const limits = await airtimeService.getAirtimeLimits();
    
    res.json({
      success: true,
      ...limits
    });
  } catch (error) {
    logger.error('Failed to get airtime limits', { error: error.message });
    res.status(500).json({ error: 'Failed to get airtime limits' });
  }
});

// Validate phone number for specific network
router.post('/validate-phone',
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network } = req.body;
      const validation = await airtimeService.validatePhoneNumber(phoneNumber, network);
      
      res.json({
        success: true,
        validation
      });
    } catch (error) {
      logger.error('Phone number validation failed', { error: error.message, phoneNumber: req.body.phoneNumber, network: req.body.network });
      res.status(400).json({ error: error.message });
    }
  }
);

// Auto-detect network from phone number
router.post('/detect-network',
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      const networkInfo = await airtimeService.detectNetwork(phoneNumber);
      
      res.json({
        success: true,
        networkInfo
      });
    } catch (error) {
      logger.error('Network detection failed', { error: error.message, phoneNumber: req.body.phoneNumber });
      res.status(400).json({ error: error.message });
    }
  }
);

// Purchase airtime
router.post('/purchase',
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  body('amount').isFloat({ min: 50, max: 50000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('userPhone').optional().isMobilePhone('any'), // Phone number of the user making the purchase
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network, amount, pin, userPhone } = req.body;
      
      // Determine which user is making the purchase
      const purchaserPhone = userPhone || phoneNumber;
      const user = await userService.getUserByPhoneNumber(purchaserPhone);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found. Please register first.' });
      }

      // Check if user can perform transactions
      if (!user.canPerformTransactions()) {
        return res.status(403).json({ 
          error: 'Account not eligible for transactions. Please complete KYC verification.' 
        });
      }

      const result = await airtimeService.purchaseAirtime(user.id, phoneNumber, network, amount, pin);
      
      res.json({
        success: true,
        message: 'Airtime purchase successful',
        data: result
      });
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get airtime purchase history
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

      const history = await airtimeService.getAirtimePurchaseHistory(user.id, limit, offset);
      
      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Failed to get airtime purchase history', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get purchase history' });
    }
  }
);

// Check airtime balance
router.post('/check-balance',
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network } = req.body;
      const balanceInfo = await airtimeService.checkAirtimeBalance(phoneNumber, network);
      
      res.json({
        success: true,
        balanceInfo
      });
    } catch (error) {
      logger.error('Airtime balance check failed', { error: error.message, phoneNumber: req.body.phoneNumber, network: req.body.network });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get user's airtime purchase summary
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
        category: 'airtime_purchase',
        type: 'debit'
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      const [totalTransactions, successfulTransactions, totalSpent, totalFees, networkBreakdown] = await Promise.all([
        Transaction.count({ where }),
        Transaction.count({ where: { ...where, status: 'completed' } }),
        Transaction.sum('amount', { where: { ...where, status: 'completed' } }),
        Transaction.sum('fee', { where: { ...where, status: 'completed' } }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [
            [require('sequelize').literal("metadata->>'network'"), 'network'],
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount'],
            [require('sequelize').fn('SUM', require('sequelize').col('fee')), 'totalFees']
          ],
          group: [require('sequelize').literal("metadata->>'network'")],
          raw: true
        })
      ]);

      res.json({
        success: true,
        summary: {
          totalTransactions,
          successfulTransactions,
          totalSpent: parseFloat(totalSpent || 0),
          totalFees: parseFloat(totalFees || 0),
          successRate: totalTransactions > 0 ? ((successfulTransactions / totalTransactions) * 100).toFixed(2) : 0,
          networkBreakdown: networkBreakdown.map(item => ({
            network: item.network,
            count: parseInt(item.count),
            totalAmount: parseFloat(item.totalAmount),
            totalFees: parseFloat(item.totalFees)
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get airtime purchase summary', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get purchase summary' });
    }
  }
);

// Validate airtime amount
router.post('/validate-amount',
  body('amount').isFloat({ min: 1 }),
  validateRequest,
  async (req, res) => {
    try {
      const { amount } = req.body;
      const validAmount = airtimeService.validateAmount(amount);
      
      res.json({
        success: true,
        validAmount,
        fee: Math.ceil(validAmount * 0.01), // 1% fee
        totalAmount: validAmount + Math.ceil(validAmount * 0.01)
      });
    } catch (error) {
      logger.error('Amount validation failed', { error: error.message, amount: req.body.amount });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get recent airtime recipients for a user (for quick recharge)
router.get('/recent-recipients/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('limit').optional().isInt({ min: 1, max: 10 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { limit = 5 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { Transaction } = require('../models');

      const transactions = await Transaction.findAll({
        where: {
          userId: user.id,
          category: 'airtime_purchase',
          type: 'debit',
          status: 'completed'
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit) * 2, // Get more to filter duplicates
        attributes: ['recipientDetails', 'createdAt', 'amount']
      });

      // Remove duplicates based on phone number
      const uniqueRecipients = [];
      const seen = new Set();

      for (const tx of transactions) {
        const phoneNumber = tx.recipientDetails?.phoneNumber;
        if (!seen.has(phoneNumber) && phoneNumber) {
          seen.add(phoneNumber);
          uniqueRecipients.push({
            phoneNumber,
            network: tx.recipientDetails.network,
            lastAmount: parseFloat(tx.amount),
            lastPurchase: tx.createdAt
          });
          
          if (uniqueRecipients.length >= limit) break;
        }
      }

      res.json({
        success: true,
        recentRecipients: uniqueRecipients
      });
    } catch (error) {
      logger.error('Failed to get recent recipients', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get recent recipients' });
    }
  }
);

module.exports = router;
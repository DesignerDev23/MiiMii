const express = require('express');
const utilityService = require('../services/utility');
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

// Get all utility categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await utilityService.getUtilityCategories();
    
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    logger.error('Failed to get utility categories', { error: error.message });
    res.status(500).json({ error: 'Failed to get utility categories' });
  }
});

// Get providers for a specific utility category
router.get('/providers/:category',
  param('category').isIn(['electricity', 'cable', 'internet', 'water']),
  validateRequest,
  async (req, res) => {
    try {
      const { category } = req.params;
      const providers = await utilityService.getProviders(category);
      
      res.json({
        success: true,
        ...providers
      });
    } catch (error) {
      logger.error('Failed to get providers', { error: error.message, category: req.params.category });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get cable TV plans for a provider
router.get('/cable-plans/:provider',
  param('provider').isIn(['dstv', 'gotv', 'startimes', 'strong']),
  validateRequest,
  async (req, res) => {
    try {
      const { provider } = req.params;
      const plans = await utilityService.getCablePlans(provider);
      
      res.json({
        success: true,
        ...plans
      });
    } catch (error) {
      logger.error('Failed to get cable plans', { error: error.message, provider: req.params.provider });
      res.status(500).json({ error: error.message });
    }
  }
);

// Validate customer details
router.post('/validate-customer',
  body('category').isIn(['electricity', 'cable', 'internet', 'water']),
  body('provider').notEmpty(),
  body('customerNumber').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { category, provider, customerNumber } = req.body;
      const validation = await utilityService.validateCustomer(category, provider, customerNumber);
      
      res.json({
        success: validation.valid,
        ...validation
      });
    } catch (error) {
      logger.error('Customer validation failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Pay utility bill
router.post('/pay',
  body('userPhone').isMobilePhone('any'),
  body('category').isIn(['electricity', 'cable', 'internet', 'water']),
  body('provider').notEmpty(),
  body('customerNumber').notEmpty(),
  body('amount').isFloat({ min: 100, max: 100000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('planId').optional().notEmpty(), // Required for cable TV
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, category, provider, customerNumber, amount, pin, planId } = req.body;
      
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

      const result = await utilityService.payBill(user.id, category, provider, customerNumber, amount, pin, planId);
      
      res.json({
        success: true,
        message: 'Bill payment successful',
        data: result
      });
    } catch (error) {
      logger.error('Utility bill payment failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get utility payment history
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

      const history = await utilityService.getUtilityPaymentHistory(user.id, limit, offset);
      
      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Failed to get utility payment history', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get payment history' });
    }
  }
);

// Get recent customers for quick payment
router.get('/recent-customers/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('category').optional().isIn(['electricity', 'cable', 'internet', 'water']),
  query('limit').optional().isInt({ min: 1, max: 10 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { category, limit = 5 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const recentCustomers = await utilityService.getRecentCustomers(user.id, category, limit);
      
      res.json({
        success: true,
        recentCustomers
      });
    } catch (error) {
      logger.error('Failed to get recent customers', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get recent customers' });
    }
  }
);

// Get user's utility payment summary
router.get('/summary/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('category').optional().isIn(['electricity', 'cable', 'internet', 'water']),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { startDate, endDate, category } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { Transaction } = require('../models');
      const { Op } = require('sequelize');

      const where = {
        userId: user.id,
        category: 'utility',
        type: 'debit'
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      if (category) {
        where['$recipientDetails.category$'] = category;
      }

      const [totalTransactions, successfulTransactions, totalSpent, totalFees, categoryBreakdown, providerBreakdown] = await Promise.all([
        Transaction.count({ where }),
        Transaction.count({ where: { ...where, status: 'completed' } }),
        Transaction.sum('amount', { where: { ...where, status: 'completed' } }),
        Transaction.sum('fee', { where: { ...where, status: 'completed' } }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [
            [require('sequelize').literal("recipientDetails->>'category'"), 'category'],
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount'],
            [require('sequelize').fn('SUM', require('sequelize').col('fee')), 'totalFees']
          ],
          group: [require('sequelize').literal("recipientDetails->>'category'")],
          raw: true
        }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [
            [require('sequelize').literal("recipientDetails->>'provider'"), 'provider'],
            [require('sequelize').literal("recipientDetails->>'category'"), 'category'],
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount']
          ],
          group: [
            require('sequelize').literal("recipientDetails->>'provider'"),
            require('sequelize').literal("recipientDetails->>'category'")
          ],
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
          categoryBreakdown: categoryBreakdown.map(item => ({
            category: item.category,
            count: parseInt(item.count),
            totalAmount: parseFloat(item.totalAmount),
            totalFees: parseFloat(item.totalFees)
          })),
          providerBreakdown: providerBreakdown.map(item => ({
            provider: item.provider,
            category: item.category,
            count: parseInt(item.count),
            totalAmount: parseFloat(item.totalAmount)
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get utility payment summary', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get payment summary' });
    }
  }
);

// Get all providers across all categories
router.get('/all-providers', async (req, res) => {
  try {
    const categories = ['electricity', 'cable', 'internet', 'water'];
    const allProviders = {};
    
    for (const category of categories) {
      allProviders[category] = await utilityService.getProviders(category);
    }
    
    res.json({
      success: true,
      providers: allProviders
    });
  } catch (error) {
    logger.error('Failed to get all providers', { error: error.message });
    res.status(500).json({ error: 'Failed to get providers' });
  }
});

// Estimate bill payment fee
router.post('/estimate-fee',
  body('category').isIn(['electricity', 'cable', 'internet', 'water']),
  body('amount').isFloat({ min: 100, max: 100000 }),
  validateRequest,
  async (req, res) => {
    try {
      const { category, amount } = req.body;
      const billAmount = parseFloat(amount);
      
      // Calculate fee (1-2% for utility bills)
      const feeRate = category === 'electricity' ? 0.015 : 0.02; // 1.5% for electricity, 2% for others
      const fee = Math.ceil(billAmount * feeRate);
      const totalAmount = billAmount + fee;
      
      res.json({
        success: true,
        estimate: {
          billAmount,
          fee,
          totalAmount,
          feeRate: (feeRate * 100).toFixed(1) + '%'
        }
      });
    } catch (error) {
      logger.error('Failed to estimate fee', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get popular utility providers (most used)
router.get('/popular-providers/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  query('limit').optional().isInt({ min: 1, max: 20 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      const { limit = 10 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { Transaction } = require('../models');

      const popularProviders = await Transaction.findAll({
        where: {
          userId: user.id,
          category: 'utility',
          type: 'debit',
          status: 'completed'
        },
        attributes: [
          [require('sequelize').literal("recipientDetails->>'provider'"), 'provider'],
          [require('sequelize').literal("recipientDetails->>'category'"), 'category'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'usageCount'],
          [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalSpent'],
          [require('sequelize').fn('MAX', require('sequelize').col('createdAt')), 'lastUsed']
        ],
        group: [
          require('sequelize').literal("recipientDetails->>'provider'"),
          require('sequelize').literal("recipientDetails->>'category'")
        ],
        order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']],
        limit: parseInt(limit),
        raw: true
      });

      res.json({
        success: true,
        popularProviders: popularProviders.map(item => ({
          provider: item.provider,
          category: item.category,
          usageCount: parseInt(item.usageCount),
          totalSpent: parseFloat(item.totalSpent),
          lastUsed: item.lastUsed
        }))
      });
    } catch (error) {
      logger.error('Failed to get popular providers', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get popular providers' });
    }
  }
);

module.exports = router;
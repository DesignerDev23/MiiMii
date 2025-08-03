const express = require('express');
const dataService = require('../services/data');
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
    const networks = await dataService.getNetworks();
    
    res.json({
      success: true,
      networks
    });
  } catch (error) {
    logger.error('Failed to get networks', { error: error.message });
    res.status(500).json({ error: 'Failed to get networks' });
  }
});

// Get data plans for a specific network
router.get('/plans/:network',
  param('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  validateRequest,
  async (req, res) => {
    try {
      const { network } = req.params;
      const plans = await dataService.getDataPlans(network);
      
      res.json({
        success: true,
        network: network.toLowerCase(),
        networkName: network.toUpperCase(),
        plans
      });
    } catch (error) {
      logger.error('Failed to get data plans', { error: error.message, network: req.params.network });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all data plans for all networks
router.get('/plans', async (req, res) => {
  try {
    const allPlans = await dataService.getAllDataPlans();
    
    res.json({
      success: true,
      plans: allPlans
    });
  } catch (error) {
    logger.error('Failed to get all data plans', { error: error.message });
    res.status(500).json({ error: 'Failed to get data plans' });
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
      const validation = await dataService.validatePhoneNumber(phoneNumber, network);
      
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

// Purchase data
router.post('/purchase',
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  body('planId').notEmpty(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('userPhone').optional().isMobilePhone('any'), // Phone number of the user making the purchase
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network, planId, pin, userPhone } = req.body;
      
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

      const result = await dataService.purchaseData(user.id, phoneNumber, network, planId, pin);
      
      res.json({
        success: true,
        message: 'Data purchase successful',
        data: result
      });
    } catch (error) {
      logger.error('Data purchase failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get data purchase history
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

      const history = await dataService.getDataPurchaseHistory(user.id, limit, offset);
      
      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Failed to get data purchase history', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get purchase history' });
    }
  }
);

// Check data balance
router.post('/check-balance',
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network } = req.body;
      const balanceInfo = await dataService.checkDataBalance(phoneNumber, network);
      
      res.json({
        success: true,
        balanceInfo
      });
    } catch (error) {
      logger.error('Data balance check failed', { error: error.message, phoneNumber: req.body.phoneNumber, network: req.body.network });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get user's data purchase summary
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
        category: 'data',
        type: 'debit'
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      const [totalTransactions, successfulTransactions, totalSpent, networkBreakdown] = await Promise.all([
        Transaction.count({ where }),
        Transaction.count({ where: { ...where, status: 'completed' } }),
        Transaction.sum('amount', { where: { ...where, status: 'completed' } }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [
            [require('sequelize').literal("metadata->>'network'"), 'network'],
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount']
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
          successRate: totalTransactions > 0 ? ((successfulTransactions / totalTransactions) * 100).toFixed(2) : 0,
          networkBreakdown: networkBreakdown.map(item => ({
            network: item.network,
            count: parseInt(item.count),
            totalAmount: parseFloat(item.totalAmount)
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get data purchase summary', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get purchase summary' });
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
      
      // Use the airtime service's detect network function (same logic)
      const airtimeService = require('../services/airtime');
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

module.exports = router;
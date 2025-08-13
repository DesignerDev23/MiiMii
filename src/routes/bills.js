const express = require('express');
const billsService = require('../services/bills');
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

// Get all available electricity discos
router.get('/electricity/discos', async (req, res) => {
  try {
    const discos = await billsService.getElectricityDiscos();
    
    res.json({
      success: true,
      discos
    });
  } catch (error) {
    logger.error('Failed to get electricity discos', { error: error.message });
    res.status(500).json({ error: 'Failed to get electricity discos' });
  }
});

// Get all available cable providers
router.get('/cable/providers', async (req, res) => {
  try {
    const providers = await billsService.getCableProviders();
    
    res.json({
      success: true,
      providers
    });
  } catch (error) {
    logger.error('Failed to get cable providers', { error: error.message });
    res.status(500).json({ error: 'Failed to get cable providers' });
  }
});

// Get bill payment limits and available services
router.get('/limits', async (req, res) => {
  try {
    const limits = await billsService.getBillLimits();
    
    res.json({
      success: true,
      ...limits
    });
  } catch (error) {
    logger.error('Failed to get bill limits', { error: error.message });
    res.status(500).json({ error: 'Failed to get bill limits' });
  }
});

// Validate meter number
router.post('/electricity/validate-meter',
  body('meterNumber').isLength({ min: 10 }),
  body('disco').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { meterNumber, disco } = req.body;
      const cleanMeterNumber = billsService.validateMeterNumber(meterNumber, disco);
      
      res.json({
        success: true,
        validation: {
          valid: true,
          cleanMeterNumber,
          disco
        }
      });
    } catch (error) {
      logger.error('Meter number validation failed', { error: error.message, meterNumber: req.body.meterNumber, disco: req.body.disco });
      res.status(400).json({ error: error.message });
    }
  }
);

// Validate IUC number
router.post('/cable/validate-iuc',
  body('iucNumber').isLength({ min: 8 }),
  body('provider').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { iucNumber, provider } = req.body;
      const cleanIUCNumber = billsService.validateIUCNumber(iucNumber, provider);
      
      res.json({
        success: true,
        validation: {
          valid: true,
          cleanIUCNumber,
          provider
        }
      });
    } catch (error) {
      logger.error('IUC number validation failed', { error: error.message, iucNumber: req.body.iucNumber, provider: req.body.provider });
      res.status(400).json({ error: error.message });
    }
  }
);

// Pay electricity bill
router.post('/electricity/pay',
  body('disco').notEmpty(),
  body('meterType').isIn(['prepaid', 'postpaid']),
  body('meterNumber').isLength({ min: 10 }),
  body('amount').isFloat({ min: 100, max: 100000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('userPhone').optional().isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { disco, meterType, meterNumber, amount, pin, userPhone } = req.body;
      
      // Get user by phone number
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate PIN
      if (!userService.validatePin(user, pin)) {
        return res.status(400).json({ error: 'Invalid PIN' });
      }

      const result = await billsService.payElectricityBill(user, {
        disco,
        meterType,
        meterNumber,
        amount: parseFloat(amount),
        pin
      }, userPhone);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Electricity bill payment failed', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Pay cable TV bill
router.post('/cable/pay',
  body('provider').notEmpty(),
  body('iucNumber').isLength({ min: 8 }),
  body('amount').isFloat({ min: 100, max: 50000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('planId').optional().isInt({ min: 1 }),
  body('userPhone').optional().isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { provider, iucNumber, amount, pin, planId, userPhone } = req.body;
      
      // Get user by phone number
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate PIN
      if (!userService.validatePin(user, pin)) {
        return res.status(400).json({ error: 'Invalid PIN' });
      }

      const result = await billsService.payCableBill(user, {
        provider,
        iucNumber,
        amount: parseFloat(amount),
        pin,
        planId: planId ? parseInt(planId) : 1
      }, userPhone);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Cable bill payment failed', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

// Get bill payment history
router.get('/history/:userPhone',
  param('userPhone').isMobilePhone('any'),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone } = req.params;
      const { limit = 10 } = req.query;
      
      // Get user by phone number
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const history = await billsService.getBillPaymentHistory(user.id, parseInt(limit));
      
      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Failed to get bill payment history', { error: error.message, userPhone: req.params.userPhone });
      res.status(500).json({ error: 'Failed to get bill payment history' });
    }
  }
);

// Calculate bill payment fee
router.post('/calculate-fee',
  body('amount').isFloat({ min: 100 }),
  body('billType').isIn(['electricity', 'cable']),
  validateRequest,
  async (req, res) => {
    try {
      const { amount, billType } = req.body;
      
      const feeCalculation = billsService.calculateBillFee(parseFloat(amount), billType);
      
      res.json({
        success: true,
        feeCalculation
      });
    } catch (error) {
      logger.error('Failed to calculate bill fee', { error: error.message, body: req.body });
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;

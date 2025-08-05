const express = require('express');
const virtualCardService = require('../services/virtualCard');
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

// Create virtual card
router.post('/create',
  body('userPhone').isMobilePhone('any'),
  body('cardType').optional().isIn(['virtual_debit', 'virtual_credit']),
  body('brand').optional().isIn(['visa', 'mastercard', 'verve']),
  body('fundingAmount').optional().isFloat({ min: 0, max: 100000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, cardType = 'virtual_debit', brand = 'visa', fundingAmount = 0, pin } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found. Please register first.' });
      }

      // Check if user can perform transactions
      if (!user.canPerformTransactions()) {
        return res.status(403).json({ 
          error: 'KYC verification required to create virtual cards.' 
        });
      }

      const cardData = { cardType, brand, fundingAmount };
      const result = await virtualCardService.createVirtualCard(user.id, cardData, pin);
      
      res.json({
        success: true,
        message: 'Virtual card created successfully',
        data: result
      });
    } catch (error) {
      logger.error('Virtual card creation failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get user's virtual cards
router.get('/cards/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const cards = await virtualCardService.getUserCards(user.id);
      
      res.json({
        success: true,
        cards
      });
    } catch (error) {
      logger.error('Failed to get user cards', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get cards' });
    }
  }
);

// Get card details
router.get('/card/:phoneNumber/:cardId',
  param('phoneNumber').isMobilePhone('any'),
  param('cardId').isUUID(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, cardId } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const cardDetails = await virtualCardService.getCardDetails(user.id, cardId);
      
      res.json({
        success: true,
        card: cardDetails
      });
    } catch (error) {
      logger.error('Failed to get card details', { error: error.message, params: req.params });
      res.status(500).json({ error: error.message });
    }
  }
);

// Fund virtual card
router.post('/fund',
  body('userPhone').isMobilePhone('any'),
  body('cardId').isUUID(),
  body('amount').isFloat({ min: 100, max: 100000 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, cardId, amount, pin } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await virtualCardService.fundCard(user.id, cardId, amount, pin);
      
      res.json({
        success: true,
        message: 'Card funded successfully',
        data: result
      });
    } catch (error) {
      logger.error('Card funding failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Freeze/Unfreeze/Block card
router.post('/toggle-status',
  body('userPhone').isMobilePhone('any'),
  body('cardId').isUUID(),
  body('action').isIn(['freeze', 'unfreeze', 'block']),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, cardId, action, pin } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await virtualCardService.toggleCardStatus(user.id, cardId, action, pin);
      
      res.json({
        success: true,
        message: `Card ${action} successful`,
        data: result
      });
    } catch (error) {
      logger.error('Card status change failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get card transaction history
router.get('/transactions/:phoneNumber/:cardId',
  param('phoneNumber').isMobilePhone('any'),
  param('cardId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, cardId } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const transactions = await virtualCardService.getCardTransactions(user.id, cardId, limit, offset);
      
      res.json({
        success: true,
        transactions
      });
    } catch (error) {
      logger.error('Failed to get card transactions', { error: error.message, params: req.params });
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete/Close card
router.delete('/card',
  body('userPhone').isMobilePhone('any'),
  body('cardId').isUUID(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { userPhone, cardId, pin } = req.body;
      
      const user = await userService.getUserByPhoneNumber(userPhone);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await virtualCardService.deleteCard(user.id, cardId, pin);
      
      res.json({
        success: true,
        message: 'Card closed successfully',
        data: result
      });
    } catch (error) {
      logger.error('Card deletion failed', { error: error.message, body: req.body });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get card configuration and limits
router.get('/config', async (req, res) => {
  try {
    const config = {
      cardTypes: ['virtual_debit', 'virtual_credit'],
      brands: ['visa', 'mastercard', 'verve'],
      limits: {
        daily: 500000,
        monthly: 5000000,
        transaction: 100000,
        minimum: 100,
        maxCards: 5
      },
      fees: {
        creation: 1000,
        maintenance: 100,
        transaction: 1.5, // percentage
        maxTransactionFee: 1000
      }
    };
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Failed to get card config', { error: error.message });
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Get card usage statistics
router.get('/usage/:phoneNumber/:cardId',
  param('phoneNumber').isMobilePhone('any'),
  param('cardId').isUUID(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, cardId } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify card belongs to user first
      const cardDetails = await virtualCardService.getCardDetails(user.id, cardId);
      
      res.json({
        success: true,
        usage: cardDetails.usage,
        limits: cardDetails.limits
      });
    } catch (error) {
      logger.error('Failed to get card usage', { error: error.message, params: req.params });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all cards summary for user
router.get('/summary/:phoneNumber',
  param('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.params;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const cards = await virtualCardService.getUserCards(user.id);
      
      const summary = {
        totalCards: cards.length,
        activeCards: cards.filter(card => card.status === 'active').length,
        totalBalance: cards.reduce((sum, card) => sum + card.balance, 0),
        cardsByType: cards.reduce((acc, card) => {
          acc[card.cardType] = (acc[card.cardType] || 0) + 1;
          return acc;
        }, {}),
        cardsByBrand: cards.reduce((acc, card) => {
          acc[card.brand] = (acc[card.brand] || 0) + 1;
          return acc;
        }, {}),
        cardsByStatus: cards.reduce((acc, card) => {
          acc[card.status] = (acc[card.status] || 0) + 1;
          return acc;
        }, {})
      };
      
      res.json({
        success: true,
        summary,
        cards: cards.map(card => ({
          id: card.id,
          cardType: card.cardType,
          brand: card.brand,
          maskedCardNumber: card.maskedCardNumber,
          balance: card.balance,
          status: card.status,
          createdAt: card.createdAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get cards summary', { error: error.message, phoneNumber: req.params.phoneNumber });
      res.status(500).json({ error: 'Failed to get cards summary' });
    }
  }
);

module.exports = router;
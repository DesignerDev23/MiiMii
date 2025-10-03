const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const beneficiaryService = require('../services/beneficiary');
const userService = require('../services/user');
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

// Get user's beneficiaries
router.get('/',
  query('phoneNumber').isMobilePhone('any'),
  query('category').optional().isIn(['family', 'friend', 'business', 'vendor', 'other']),
  query('type').optional().isIn(['bank_account', 'phone_number', 'miimii_user']),
  query('isFavorite').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, category, type, isFavorite } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const beneficiaries = await beneficiaryService.getUserBeneficiaries(user.id, {
        category,
        type,
        isFavorite: isFavorite === 'true' ? true : isFavorite === 'false' ? false : null
      });

      res.json({
        success: true,
        beneficiaries: beneficiaries.map(b => b.getDisplayInfo())
      });
    } catch (error) {
      logger.error('Failed to get beneficiaries', { error: error.message });
      res.status(500).json({ error: 'Failed to get beneficiaries' });
    }
  }
);

// Get beneficiary stats
router.get('/stats',
  query('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const stats = await beneficiaryService.getBeneficiaryStats(user.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get beneficiary stats', { error: error.message });
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }
);

// Search beneficiaries
router.get('/search',
  query('phoneNumber').isMobilePhone('any'),
  query('q').isString().notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, q } = req.query;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const results = await beneficiaryService.searchBeneficiaries(user.id, q);

      res.json({
        success: true,
        results: results.map(b => b.getDisplayInfo())
      });
    } catch (error) {
      logger.error('Failed to search beneficiaries', { error: error.message });
      res.status(500).json({ error: 'Failed to search beneficiaries' });
    }
  }
);

// Update beneficiary
router.put('/:beneficiaryId',
  param('beneficiaryId').isUUID(),
  body('phoneNumber').isMobilePhone('any'),
  body('nickname').optional().isString(),
  body('category').optional().isIn(['family', 'friend', 'business', 'vendor', 'other']),
  body('notes').optional().isString(),
  body('isFavorite').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { beneficiaryId } = req.params;
      const { phoneNumber, nickname, category, notes, isFavorite } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const beneficiary = await beneficiaryService.updateBeneficiary(user.id, beneficiaryId, {
        nickname,
        category,
        notes,
        isFavorite
      });

      res.json({
        success: true,
        message: 'Beneficiary updated successfully',
        beneficiary: beneficiary.getDisplayInfo()
      });
    } catch (error) {
      logger.error('Failed to update beneficiary', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete beneficiary
router.delete('/:beneficiaryId',
  param('beneficiaryId').isUUID(),
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { beneficiaryId } = req.params;
      const { phoneNumber } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await beneficiaryService.deleteBeneficiary(user.id, beneficiaryId);

      res.json(result);
    } catch (error) {
      logger.error('Failed to delete beneficiary', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Toggle favorite
router.post('/:beneficiaryId/favorite',
  param('beneficiaryId').isUUID(),
  body('phoneNumber').isMobilePhone('any'),
  validateRequest,
  async (req, res) => {
    try {
      const { beneficiaryId } = req.params;
      const { phoneNumber } = req.body;
      
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const beneficiary = await beneficiaryService.toggleFavorite(user.id, beneficiaryId);

      res.json({
        success: true,
        message: `Beneficiary ${beneficiary.isFavorite ? 'added to' : 'removed from'} favorites`,
        beneficiary: beneficiary.getDisplayInfo()
      });
    } catch (error) {
      logger.error('Failed to toggle favorite', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;


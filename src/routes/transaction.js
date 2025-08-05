const express = require('express');
const { Transaction, User } = require('../models');
const transactionService = require('../services/transaction');
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

// Get transaction by reference
router.get('/:reference',
  param('reference').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { reference } = req.params;
      
      const transaction = await Transaction.findOne({
        where: { reference },
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber'] }]
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json({
        success: true,
        transaction: {
          id: transaction.id,
          reference: transaction.reference,
          type: transaction.type,
          category: transaction.category,
          amount: parseFloat(transaction.amount),
          fee: parseFloat(transaction.fee),
          totalAmount: parseFloat(transaction.totalAmount),
          status: transaction.status,
          description: transaction.description,
          user: transaction.user ? `${transaction.user.firstName || ''} ${transaction.user.lastName || ''}`.trim() || transaction.user.whatsappNumber : 'Unknown',
          userPhone: transaction.user?.whatsappNumber,
          recipientDetails: transaction.recipientDetails,
          balanceBefore: transaction.balanceBefore ? parseFloat(transaction.balanceBefore) : null,
          balanceAfter: transaction.balanceAfter ? parseFloat(transaction.balanceAfter) : null,
          metadata: transaction.metadata,
          createdAt: transaction.createdAt,
          processedAt: transaction.processedAt,
          failureReason: transaction.failureReason
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction', { error: error.message });
      res.status(500).json({ error: 'Failed to get transaction' });
    }
  }
);

// Get transactions with filters
router.get('/',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('phoneNumber').optional().isMobilePhone('any'),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  query('type').optional().isIn(['credit', 'debit', 'transfer', 'airtime', 'data', 'utility']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const { phoneNumber, status, type, startDate, endDate } = req.query;

      const where = {};
      
      if (phoneNumber) {
        const user = await userService.getUserByPhoneNumber(phoneNumber);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        where.userId = user.id;
      }
      
      if (status) where.status = status;
      if (type) where.type = type;
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[require('sequelize').Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[require('sequelize').Op.lte] = new Date(endDate);
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber'] }],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        },
        transactions: transactions.map(tx => ({
          reference: tx.reference,
          type: tx.type,
          category: tx.category,
          amount: parseFloat(tx.amount),
          fee: parseFloat(tx.fee),
          status: tx.status,
          description: tx.description,
          user: tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.whatsappNumber : 'Unknown',
          userPhone: tx.user?.whatsappNumber,
          createdAt: tx.createdAt,
          processedAt: tx.processedAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get transactions', { error: error.message });
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  }
);

// Initiate transfer
router.post('/transfer',
  body('senderPhone').isMobilePhone('any'),
  body('recipientPhone').isMobilePhone('any'),
  body('amount').isFloat({ min: 1 }),
  body('description').optional().isString(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { senderPhone, recipientPhone, amount, description, pin } = req.body;
      
      const sender = await userService.getUserByPhoneNumber(senderPhone);
      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' });
      }

      // Validate PIN
      await userService.validateUserPin(sender.id, pin);

      const result = await transactionService.initiateTransfer(sender, {
        recipientPhone,
        amount: parseFloat(amount),
        description: description || 'Wallet transfer'
      });

      res.json({
        success: true,
        transfer: result
      });
    } catch (error) {
      logger.error('Failed to initiate transfer', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Get transaction statistics
router.get('/stats/overview',
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRequest,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const dateFilter = {};
      if (startDate || endDate) {
        if (startDate) dateFilter[require('sequelize').Op.gte] = new Date(startDate);
        if (endDate) dateFilter[require('sequelize').Op.lte] = new Date(endDate);
      }

      const where = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

      const [
        totalTransactions,
        completedTransactions,
        totalVolume,
        completedVolume,
        avgTransactionAmount,
        transactionsByType,
        transactionsByStatus
      ] = await Promise.all([
        Transaction.count({ where }),
        Transaction.count({ where: { ...where, status: 'completed' } }),
        Transaction.sum('amount', { where }),
        Transaction.sum('amount', { where: { ...where, status: 'completed' } }),
        Transaction.findAll({
          where: { ...where, status: 'completed' },
          attributes: [[require('sequelize').fn('AVG', require('sequelize').col('amount')), 'avg']]
        }),
        Transaction.findAll({
          where,
          attributes: [
            'type',
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'volume']
          ],
          group: ['type']
        }),
        Transaction.findAll({
          where,
          attributes: [
            'status',
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
          ],
          group: ['status']
        })
      ]);

      res.json({
        success: true,
        stats: {
          totalTransactions,
          completedTransactions,
          totalVolume: parseFloat(totalVolume || 0),
          completedVolume: parseFloat(completedVolume || 0),
          avgTransactionAmount: parseFloat(avgTransactionAmount[0]?.dataValues?.avg || 0),
          successRate: totalTransactions > 0 ? (completedTransactions / totalTransactions * 100).toFixed(2) : 0,
          transactionsByType: transactionsByType.map(type => ({
            type: type.type,
            count: parseInt(type.dataValues.count),
            volume: parseFloat(type.dataValues.volume || 0)
          })),
          transactionsByStatus: transactionsByStatus.reduce((acc, status) => {
            acc[status.status] = parseInt(status.dataValues.count);
            return acc;
          }, {})
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction stats', { error: error.message });
      res.status(500).json({ error: 'Failed to get transaction statistics' });
    }
  }
);

// Update transaction status (admin use)
router.patch('/:reference/status',
  param('reference').notEmpty(),
  body('status').isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  body('reason').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { reference } = req.params;
      const { status, reason } = req.body;
      
      const transaction = await Transaction.findOne({ where: { reference } });
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const updateData = { 
        status,
        processedAt: ['completed', 'failed', 'cancelled'].includes(status) ? new Date() : null
      };

      if (reason) {
        updateData.failureReason = reason;
      }

      await transaction.update(updateData);

      res.json({
        success: true,
        message: 'Transaction status updated successfully',
        transaction: {
          reference: transaction.reference,
          status: transaction.status,
          processedAt: transaction.processedAt
        }
      });
    } catch (error) {
      logger.error('Failed to update transaction status', { error: error.message });
      res.status(500).json({ error: 'Failed to update transaction status' });
    }
  }
);

module.exports = router;
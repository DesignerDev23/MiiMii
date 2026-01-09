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
      
      const { supabase } = require('../database/connection');
      const { data: transaction } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
        `)
        .eq('reference', reference)
        .maybeSingle();

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

      const { supabase } = require('../database/connection');
      let query = supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
        `, { count: 'exact' });
      
      if (where.userId) query = query.eq('userId', where.userId);
      if (where.status) query = query.eq('status', where.status);
      if (where.type) query = query.eq('type', where.type);
      if (where.category) query = query.eq('category', where.category);
      
      query = query.order('createdAt', { ascending: false })
                   .range(offset, offset + limit - 1);
      
      const { data: transactions, error, count } = await query;
      if (error) throw error;

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
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
          processedAt: tx.metadata?.processedAt || null
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

      const { supabase } = require('../database/connection');
      
      // Build base query
      let baseQuery = supabase.from('transactions');
      if (where.createdAt) {
        if (where.createdAt[require('sequelize').Op.gte]) {
          baseQuery = baseQuery.gte('createdAt', where.createdAt[require('sequelize').Op.gte].toISOString());
        }
        if (where.createdAt[require('sequelize').Op.lte]) {
          baseQuery = baseQuery.lte('createdAt', where.createdAt[require('sequelize').Op.lte].toISOString());
        }
      }
      
      const [
        totalTransactionsResult,
        completedTransactionsResult,
        allTransactionsResult,
        completedTransactionsDataResult,
        allTransactionsDataResult
      ] = await Promise.all([
        baseQuery.select('*', { count: 'exact', head: true }),
        baseQuery.select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        baseQuery.select('amount'),
        baseQuery.select('amount').eq('status', 'completed'),
        baseQuery.select('type, status, amount')
      ]);
      
      const totalTransactions = totalTransactionsResult.count || 0;
      const completedTransactions = completedTransactionsResult.count || 0;
      const totalVolume = (allTransactionsResult.data || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const completedVolume = (completedTransactionsDataResult.data || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const avgTransactionAmount = completedTransactions > 0 ? completedVolume / completedTransactions : 0;
      
      // Group by type
      const transactionsByType = {};
      (allTransactionsDataResult.data || []).forEach(tx => {
        const type = tx.type || 'unknown';
        if (!transactionsByType[type]) {
          transactionsByType[type] = { count: 0, volume: 0 };
        }
        transactionsByType[type].count++;
        transactionsByType[type].volume += parseFloat(tx.amount || 0);
      });
      
      // Group by status
      const transactionsByStatus = {};
      (allTransactionsDataResult.data || []).forEach(tx => {
        const status = tx.status || 'unknown';
        transactionsByStatus[status] = (transactionsByStatus[status] || 0) + 1;
      });

      res.json({
        success: true,
        stats: {
          totalTransactions,
          completedTransactions,
          totalVolume: parseFloat(totalVolume || 0),
          completedVolume: parseFloat(completedVolume || 0),
          avgTransactionAmount: parseFloat(avgTransactionAmount || 0),
          successRate: totalTransactions > 0 ? (completedTransactions / totalTransactions * 100).toFixed(2) : 0,
          transactionsByType: Object.entries(transactionsByType).map(([type, data]) => ({
            type,
            count: data.count,
            volume: data.volume
          })),
          transactionsByStatus: transactionsByStatus
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
      
      const { supabase } = require('../database/connection');
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('reference', reference)
        .maybeSingle();
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const updateData = { 
        status,
        metadata: {
          ...(transaction.metadata || {}),
          processedAt: ['completed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : null
        },
        updatedAt: new Date().toISOString()
      };

      if (reason) {
        updateData.failureReason = reason;
      }

      await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction.id);

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
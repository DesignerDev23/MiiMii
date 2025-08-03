const express = require('express');
const { User, Wallet, Transaction, SupportTicket, WebhookLog } = require('../models');
const userService = require('../services/user');
const walletService = require('../services/wallet');
const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
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

// Dashboard overview
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTransactions,
      totalVolume,
      pendingTransactions,
      openTickets,
      recentTransactions
    ] = await Promise.all([
      User.count(),
      User.count({ where: { isActive: true, isBanned: false } }),
      Transaction.count(),
      Transaction.sum('amount', { where: { status: 'completed' } }),
      Transaction.count({ where: { status: 'pending' } }),
      SupportTicket.count({ where: { status: 'open' } }),
      Transaction.findAll({
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber'] }],
        order: [['createdAt', 'DESC']],
        limit: 10
      })
    ]);

    // KYC stats
    const kycStats = await User.findAll({
      attributes: [
        'kycStatus',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['kycStatus']
    });

    // Transaction type breakdown
    const transactionTypes = await Transaction.findAll({
      attributes: [
        'type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'volume']
      ],
      where: { status: 'completed' },
      group: ['type']
    });

    res.json({
      success: true,
      overview: {
        totalUsers,
        activeUsers,
        totalTransactions,
        totalVolume: parseFloat(totalVolume || 0),
        pendingTransactions,
        openTickets
      },
      kycStats: kycStats.reduce((acc, stat) => {
        acc[stat.kycStatus] = parseInt(stat.dataValues.count);
        return acc;
      }, {}),
      transactionTypes: transactionTypes.map(type => ({
        type: type.type,
        count: parseInt(type.dataValues.count),
        volume: parseFloat(type.dataValues.volume || 0)
      })),
      recentTransactions: recentTransactions.map(tx => ({
        reference: tx.reference,
        type: tx.type,
        amount: parseFloat(tx.amount),
        user: tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.whatsappNumber : 'Unknown',
        status: tx.status,
        createdAt: tx.createdAt
      }))
    });
  } catch (error) {
    logger.error('Failed to get dashboard overview', { error: error.message });
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Get all users with pagination
router.get('/users',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('kycStatus').optional().isIn(['incomplete', 'pending', 'verified', 'rejected']),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const { search, kycStatus } = req.query;

      const where = {};
      
      if (search) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { whatsappNumber: { [Op.like]: `%${search}%` } }
        ];
      }
      
      if (kycStatus) {
        where.kycStatus = kycStatus;
      }

      const { count, rows: users } = await User.findAndCountAll({
        where,
        include: [{ model: Wallet, as: 'wallet' }],
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
        users: users.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.whatsappNumber,
          whatsappNumber: user.whatsappNumber,
          email: user.email,
          kycStatus: user.kycStatus,
          isActive: user.isActive,
          isBanned: user.isBanned,
          balance: user.wallet ? parseFloat(user.wallet.balance) : 0,
          lastSeen: user.lastSeen,
          createdAt: user.createdAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get users', { error: error.message });
      res.status(500).json({ error: 'Failed to get users' });
    }
  }
);

// Get user details
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId, {
      include: [
        { model: Wallet, as: 'wallet' },
        { 
          model: Transaction, 
          as: 'transactions',
          order: [['createdAt', 'DESC']],
          limit: 20
        },
        {
          model: SupportTicket,
          as: 'supportTickets',
          order: [['createdAt', 'DESC']],
          limit: 10
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await userService.getUserStats(userId);

    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        whatsappNumber: user.whatsappNumber,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
        bvn: user.bvn,
        kycStatus: user.kycStatus,
        kycData: user.kycData,
        isActive: user.isActive,
        isBanned: user.isBanned,
        lastSeen: user.lastSeen,
        metadata: user.metadata,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      wallet: user.wallet ? {
        balance: parseFloat(user.wallet.balance),
        virtualAccountNumber: user.wallet.virtualAccountNumber,
        virtualAccountBank: user.wallet.virtualAccountBank,
        isActive: user.wallet.isActive,
        isFrozen: user.wallet.isFrozen
      } : null,
      stats,
      recentTransactions: user.transactions?.slice(0, 10) || [],
      supportTickets: user.supportTickets || []
    });
  } catch (error) {
    logger.error('Failed to get user details', { error: error.message });
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Ban user
router.post('/users/:userId/ban',
  body('reason').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      
      await userService.banUser(userId, reason);
      
      res.json({
        success: true,
        message: 'User banned successfully'
      });
    } catch (error) {
      logger.error('Failed to ban user', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Unban user
router.post('/users/:userId/unban', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await userService.unbanUser(userId);
    
    res.json({
      success: true,
      message: 'User unbanned successfully'
    });
  } catch (error) {
    logger.error('Failed to unban user', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get all transactions with pagination
router.get('/transactions',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  query('type').optional().isIn(['credit', 'debit', 'transfer', 'airtime', 'data', 'utility']),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const { status, type } = req.query;

      const where = {};
      if (status) where.status = status;
      if (type) where.type = type;

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
          id: tx.id,
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

// Get support tickets
router.get('/support-tickets',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const { status } = req.query;

      const where = {};
      if (status) where.status = status;

      const { count, rows: tickets } = await SupportTicket.findAndCountAll({
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
        tickets: tickets.map(ticket => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          type: ticket.type,
          priority: ticket.priority,
          status: ticket.status,
          subject: ticket.subject,
          description: ticket.description,
          user: ticket.user ? `${ticket.user.firstName || ''} ${ticket.user.lastName || ''}`.trim() || ticket.user.whatsappNumber : 'Unknown',
          userPhone: ticket.user?.whatsappNumber,
          createdAt: ticket.createdAt,
          resolvedAt: ticket.resolvedAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get support tickets', { error: error.message });
      res.status(500).json({ error: 'Failed to get support tickets' });
    }
  }
);

// Get webhook logs
router.get('/webhook-logs',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('provider').optional().isIn(['whatsapp', 'bellbank', 'bilal', 'dojah']),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const { provider } = req.query;

      const where = {};
      if (provider) where.provider = provider;

      const { count, rows: logs } = await WebhookLog.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        attributes: { exclude: ['payload'] } // Exclude large payload from list view
      });

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        },
        logs: logs.map(log => ({
          id: log.id,
          provider: log.provider,
          event: log.event,
          verified: log.verified,
          processed: log.processed,
          responseCode: log.responseCode,
          errorMessage: log.errorMessage,
          retryCount: log.retryCount,
          createdAt: log.createdAt,
          processedAt: log.processedAt
        }))
      });
    } catch (error) {
      logger.error('Failed to get webhook logs', { error: error.message });
      res.status(500).json({ error: 'Failed to get webhook logs' });
    }
  }
);

// Update KYC status
router.post('/users/:userId/kyc-status',
  body('status').isIn(['incomplete', 'pending', 'verified', 'rejected']),
  body('reason').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { status, reason } = req.body;
      
      const user = await userService.updateUser(userId, {
        kycStatus: status,
        metadata: {
          ...(await User.findByPk(userId)).metadata,
          kycUpdatedAt: new Date(),
          kycUpdateReason: reason
        }
      });
      
      res.json({
        success: true,
        message: 'KYC status updated successfully',
        user: {
          id: user.id,
          kycStatus: user.kycStatus
        }
      });
    } catch (error) {
      logger.error('Failed to update KYC status', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
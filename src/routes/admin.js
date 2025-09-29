const express = require('express');
const { User, Wallet, Transaction, SupportTicket, WebhookLog } = require('../models');
const userService = require('../services/user');
const walletService = require('../services/wallet');
const rubiesService = require('../services/rubies');
const whatsappService = require('../services/whatsapp');
const { Op } = require('sequelize');
const { body, query, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();
const KVStore = require('../models/KVStore');
const { sequelize } = require('../database/connection');

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
          bvnVerified: user.bvnVerified,
          bvnVerificationDate: user.bvnVerificationDate,
          onboardingStep: user.onboardingStep,
          isActive: user.isActive,
          isBanned: user.isBanned,
          balance: user.wallet ? parseFloat(user.wallet.balance) : 0,
          virtualAccountNumber: user.wallet ? user.wallet.virtualAccountNumber : null,
          virtualAccountBank: user.wallet ? user.wallet.virtualAccountBank : null,
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

// Freeze wallet
router.post('/users/:userId/wallet/freeze',
  param('userId').isUUID(),
  body('reason').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      const wallet = await walletService.freezeWallet(userId, reason);
      res.json({ success: true, message: 'Wallet frozen', wallet: { isFrozen: wallet.isFrozen, freezeReason: wallet.freezeReason } });
    } catch (error) {
      logger.error('Failed to freeze wallet', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Unfreeze wallet
router.post('/users/:userId/wallet/unfreeze',
  param('userId').isUUID(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const wallet = await walletService.unfreezeWallet(userId);
      res.json({ success: true, message: 'Wallet unfrozen', wallet: { isFrozen: wallet.isFrozen } });
    } catch (error) {
      logger.error('Failed to unfreeze wallet', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Credit wallet (admin)
router.post('/users/:userId/wallet/credit',
  param('userId').isUUID(),
  body('amount').isFloat({ min: 1 }),
  body('description').notEmpty(),
  body('notify').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount, description, notify = true } = req.body;
      const adminEmail = req.admin?.email;
      const result = await walletService.creditWallet(
        userId,
        parseFloat(amount),
        description,
        { category: 'admin_adjustment', adminCredit: true, notify, creditedBy: adminEmail }
      );
      res.json({ success: true, message: 'Wallet credited', result });
    } catch (error) {
      logger.error('Failed to credit wallet', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Data pricing management
// Get current data plans with retail and selling prices
router.get('/data-pricing', async (req, res) => {
  try {
    const { DATA_PLANS } = require('./flowEndpoint');
    const record = await KVStore.findByPk('data_pricing_overrides');
    const overrides = record?.value || {};
    
    // Combine retail prices from DATA_PLANS with admin-set selling prices
    const dataPlansWithPricing = {};
    
    for (const [network, plans] of Object.entries(DATA_PLANS)) {
      dataPlansWithPricing[network] = plans.map(plan => ({
        id: plan.id,
        title: plan.title,
        validity: plan.validity,
        type: plan.type,
        retailPrice: plan.price, // Provider's retail price
        sellingPrice: overrides[network]?.[plan.id] || plan.price, // Admin-set price or default to retail
        margin: (overrides[network]?.[plan.id] || plan.price) - plan.price
      }));
    }
    
    res.json({ 
      success: true, 
      dataPlans: dataPlansWithPricing,
      overrides: overrides
    });
  } catch (error) {
    logger.error('Failed to get data pricing', { error: error.message });
    res.status(500).json({ error: 'Failed to get data pricing' });
  }
});

// Set individual plan pricing
router.post('/data-pricing/plan',
  body('network').isString(),
  body('planId').isInt(),
  body('sellingPrice').isFloat({ min: 0 }),
  validateRequest,
  async (req, res) => {
    try {
      const { network, planId, sellingPrice } = req.body;
      
      // Get current overrides
      const record = await KVStore.findByPk('data_pricing_overrides');
      const overrides = record?.value || {};
      
      // Initialize network if it doesn't exist
      if (!overrides[network]) {
        overrides[network] = {};
      }
      
      // Set the selling price for the specific plan
      overrides[network][planId] = parseFloat(sellingPrice);
      
      // Save updated overrides
      await KVStore.upsert({ key: 'data_pricing_overrides', value: overrides });
      
      res.json({ 
        success: true, 
        message: 'Plan pricing updated',
        plan: {
          network,
          planId,
          sellingPrice: parseFloat(sellingPrice)
        }
      });
    } catch (error) {
      logger.error('Failed to update plan pricing', { error: error.message });
      res.status(500).json({ error: 'Failed to update plan pricing' });
    }
  }
);

// Set bulk overrides
router.post('/data-pricing',
  body('overrides').isObject(),
  validateRequest,
  async (req, res) => {
    try {
      const { overrides } = req.body;
      // Structure: { [network]: { [planId]: price } }
      const record = await KVStore.upsert({ key: 'data_pricing_overrides', value: overrides });
      res.json({ success: true, message: 'Bulk pricing updated', overrides });
    } catch (error) {
      logger.error('Failed to update data pricing overrides', { error: error.message });
      res.status(500).json({ error: 'Failed to update overrides' });
    }
  }
);

// Delete overrides
router.delete('/data-pricing', async (req, res) => {
  try {
    await KVStore.destroy({ where: { key: 'data_pricing_overrides' } });
    res.json({ success: true, message: 'Overrides cleared' });
  } catch (error) {
    logger.error('Failed to clear data pricing overrides', { error: error.message });
    res.status(500).json({ error: 'Failed to clear overrides' });
  }
});

// Get data plans (what users see)
router.get('/data-plans', async (req, res) => {
  try {
    const { DATA_PLANS } = require('./flowEndpoint');
    const record = await KVStore.findByPk('data_pricing_overrides');
    const overrides = record?.value || {};
    
    // Return plans with admin-set selling prices (what users see)
    const dataPlans = {};
    
    for (const [network, plans] of Object.entries(DATA_PLANS)) {
      dataPlans[network] = plans.map(plan => ({
        id: plan.id,
        title: plan.title,
        validity: plan.validity,
        type: plan.type,
        price: overrides[network]?.[plan.id] || plan.price // Admin-set price or retail
      }));
    }
    
    res.json({ 
      success: true, 
      dataPlans: dataPlans
    });
  } catch (error) {
    logger.error('Failed to get data plans', { error: error.message });
    res.status(500).json({ error: 'Failed to get data plans' });
  }
});

// Add new data plan
router.post('/data-plans',
  body('network').isString(),
  body('title').isString(),
  body('retailPrice').isFloat({ min: 0 }),
  body('validity').isString(),
  body('type').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { network, title, retailPrice, validity, type = 'SME' } = req.body;
      
      // Get the next available plan ID for the network
      const { DATA_PLANS } = require('./flowEndpoint');
      const networkPlans = DATA_PLANS[network.toUpperCase()] || [];
      const maxId = Math.max(...networkPlans.map(p => p.id), 0);
      const newPlanId = maxId + 1;
      
      // Create new plan object
      const newPlan = {
        id: newPlanId,
        title,
        price: parseFloat(retailPrice),
        validity,
        type
      };
      
      // Note: In a real implementation, you would update the DATA_PLANS constant
      // or store this in a database. For now, we'll just return the plan structure
      // that should be added to the DATA_PLANS constant.
      
      res.json({
        success: true,
        message: 'New data plan created',
        plan: newPlan,
        note: 'This plan needs to be manually added to the DATA_PLANS constant in flowEndpoint.js'
      });
    } catch (error) {
      logger.error('Failed to add new data plan', { error: error.message });
      res.status(500).json({ error: 'Failed to add new data plan' });
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

// Admin endpoint to retry failed virtual account creations
router.post('/retry-virtual-accounts', async (req, res) => {
  try {
    const { userId, force } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const walletService = require('../services/wallet');
    const { User, Wallet } = require('../models');

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if wallet exists
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found for user'
      });
    }

    // Check if virtual account already exists
    if (wallet.virtualAccountNumber && !force) {
      return res.status(400).json({
        success: false,
        message: 'Virtual account already exists. Use force=true to recreate.',
        existingAccount: {
          accountNumber: wallet.virtualAccountNumber,
          bankName: wallet.virtualAccountBank,
          accountName: wallet.virtualAccountName
        }
      });
    }

    // If force is true and account exists, clear it first
    if (force && wallet.virtualAccountNumber) {
      await wallet.update({
        virtualAccountNumber: null,
        virtualAccountBank: null,
        virtualAccountName: null
      });
    }

    // Attempt to create virtual account
    const result = await walletService.createVirtualAccountForWallet(userId);

    res.json({
      success: true,
      message: 'Virtual account creation retry completed',
      result
    });

  } catch (error) {
    logger.error('Admin retry virtual account creation failed', {
      error: error.message,
      userId: req.body.userId
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retry virtual account creation',
      error: error.message
    });
  }
});

// Admin endpoint to check BellBank API status
router.get('/bellbank-status', async (req, res) => {
  try {
    const bellBankService = require('../services/bellbank');
    
    // Test token generation
    const startTime = Date.now();
    const token = await bellBankService.generateToken();
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      message: 'BellBank API is accessible',
      data: {
        environment: bellBankService.selectedEnvironment,
        baseURL: bellBankService.baseURL,
        tokenGenerated: !!token,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('BellBank API status check failed', { error: error.message });

    res.status(500).json({
      success: false,
      message: 'BellBank API is not accessible',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin endpoint to get users without virtual accounts
router.get('/users-without-va', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const { User, Wallet } = require('../models');

    const usersWithoutVA = await User.findAll({
      include: [
        {
          model: Wallet,
          as: 'wallet',
          where: {
            virtualAccountNumber: null
          }
        }
      ],
      where: {
        isActive: true,
        isBanned: false
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalCount = await User.count({
      include: [
        {
          model: Wallet,
          as: 'wallet',
          where: {
            virtualAccountNumber: null
          }
        }
      ],
      where: {
        isActive: true,
        isBanned: false
      }
    });

    res.json({
      success: true,
      data: {
        users: usersWithoutVA.map(user => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          whatsappNumber: user.whatsappNumber,
          hasBvn: !!user.bvn,
          hasGender: !!user.gender,
          hasDateOfBirth: !!user.dateOfBirth,
          createdAt: user.createdAt,
          missingFields: ['firstName', 'lastName', 'whatsappNumber', 'bvn', 'gender', 'dateOfBirth']
            .filter(field => !user[field])
        })),
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get users without virtual accounts', { error: error.message });

    res.status(500).json({
      success: false,
      message: 'Failed to get users without virtual accounts',
      error: error.message
    });
  }
});

// Revenue statistics
// Streams: transfer out charges (bank_transfer fees), monthly maintenance fees, data margin, airtime margin (+₦2 per purchase)
router.get('/revenue/stats', async (req, res) => {
    try {
      const { fn, col } = require('sequelize');
      const whereBase = { status: 'completed' };

      // Transfer out charges: sum of fee for completed bank transfers
      const transferOutFee = parseFloat(
        (await require('../models').Transaction.findOne({
          where: { ...whereBase, category: 'bank_transfer', type: 'debit' },
          attributes: [[fn('SUM', col('fee')), 'sumFee']],
          raw: true
        }))?.sumFee || 0
      );

      // Maintenance fees: sum of debited amount for maintenance_fee
      const maintenanceRevenue = parseFloat(
        (await require('../models').Transaction.findOne({
          where: { ...whereBase, category: 'maintenance_fee', type: 'debit' },
          attributes: [[fn('SUM', col('amount')), 'sumAmount']],
          raw: true
        }))?.sumAmount || 0
      );

      // Data margin: sum(selling - retail)
      const dataRows = await require('../models').Transaction.findAll({
        where: { ...whereBase, category: 'data_purchase', type: 'debit' },
        attributes: ['amount', 'metadata'],
        raw: true
      });
      let dataMargin = 0;
      for (const row of dataRows) {
        let meta = row.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (_) { meta = null; }
        }
        // Get retail price from metadata or use a default calculation
        const retail = parseFloat(meta?.retailPrice ?? meta?.planRetailPrice ?? 0);
        // selling price is the transaction amount
        const selling = parseFloat(row.amount ?? 0);
        if (!isNaN(retail) && !isNaN(selling) && selling >= retail) {
          dataMargin += (selling - retail);
        }
      }

      // Airtime margin: ₦2 per completed airtime debit
      const airtimeCount = await require('../models').Transaction.count({
        where: { ...whereBase, category: 'airtime_purchase', type: 'debit' }
      });
      const airtimeMargin = airtimeCount * 2;

      const totalRevenue = transferOutFee + maintenanceRevenue + dataMargin + airtimeMargin;

      res.json({
        success: true,
        streams: {
          transferOutFees: parseFloat(transferOutFee.toFixed(2)),
          monthlyMaintenanceFees: parseFloat(maintenanceRevenue.toFixed(2)),
          dataMargin: parseFloat(dataMargin.toFixed(2)),
          airtimeMargin: airtimeMargin
        },
        totalRevenue: parseFloat(totalRevenue.toFixed(2))
      });
    } catch (error) {
      logger.error('Failed to compute revenue stats', { error: error.message });
      res.status(500).json({ error: 'Failed to compute revenue stats' });
    }
  }
);

// Transaction Requery Endpoint
router.post('/transactions/requery', 
  [
    body('reference').notEmpty().withMessage('Transaction reference is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { reference } = req.body;
      
      // Query transaction status from Rubies
      const rubiesResult = await rubiesService.queryTransactionStatus(reference);
      
      if (rubiesResult.success) {
        // Update local transaction status
        const transaction = await Transaction.findOne({ where: { reference } });
        if (transaction) {
          await transaction.update({
            status: 'completed',
            providerResponse: rubiesResult
          });
        }
        
        res.json({
          success: true,
          message: 'Transaction status updated successfully',
          transaction: rubiesResult
        });
      } else {
        res.json({
          success: false,
          message: 'Transaction query failed',
          error: rubiesResult.responseMessage
        });
      }
    } catch (error) {
      logger.error('Transaction requery failed', { error: error.message });
      res.status(500).json({ error: 'Transaction requery failed' });
    }
  }
);

// Get User Transactions
router.get('/users/:userId/transactions',
  [
    param('userId').isUUID().withMessage('Invalid user ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      const transactions = await Transaction.findAndCountAll({
        where: { userId },
        include: [
          { model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber'] }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });
      
      res.json({
        success: true,
        transactions: transactions.rows,
        total: transactions.count,
        limit,
        offset
      });
    } catch (error) {
      logger.error('Failed to get user transactions', { error: error.message });
      res.status(500).json({ error: 'Failed to get user transactions' });
    }
  }
);

// Get Transaction Details
router.get('/transactions/:transactionId',
  [
    param('transactionId').isUUID().withMessage('Invalid transaction ID')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { transactionId } = req.params;
      
      const transaction = await Transaction.findOne({
        where: { id: transactionId },
        include: [
          { model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber', 'email'] },
          { model: Wallet, as: 'wallet', attributes: ['virtualAccountNumber', 'virtualAccountBank'] }
        ]
      });
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      res.json({
        success: true,
        transaction
      });
    } catch (error) {
      logger.error('Failed to get transaction details', { error: error.message });
      res.status(500).json({ error: 'Failed to get transaction details' });
    }
  }
);

// Update Dashboard Stats for New KYC Service
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTransactions,
      totalVolume,
      pendingTransactions,
      openTickets,
      kycStats,
      rubiesStats
    ] = await Promise.all([
      User.count(),
      User.count({ where: { isActive: true, isBanned: false } }),
      Transaction.count(),
      Transaction.sum('amount', { where: { status: 'completed' } }),
      Transaction.count({ where: { status: 'pending' } }),
      SupportTicket.count({ where: { status: 'open' } }),
      // KYC stats with Rubies integration
      User.findAll({
        attributes: [
          'kycStatus',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['kycStatus']
      }),
      // Rubies-specific stats
      Transaction.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
        ],
        where: {
          category: 'bank_transfer',
          createdAt: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        group: ['status']
      })
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          kycBreakdown: kycStats
        },
        transactions: {
          total: totalTransactions,
          volume: totalVolume || 0,
          pending: pendingTransactions,
          rubiesStats: rubiesStats
        },
        support: {
          openTickets: openTickets
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// Push Notification to All Users
router.post('/notifications/push',
  [
    body('title').notEmpty().withMessage('Notification title is required'),
    body('message').notEmpty().withMessage('Notification message is required'),
    body('type').optional().isIn(['info', 'warning', 'success', 'error']).withMessage('Invalid notification type'),
    body('targetUsers').optional().isIn(['all', 'active', 'new']).withMessage('Invalid target users type'),
    body('schedule').optional().isISO8601().withMessage('Invalid schedule date format')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { title, message, type = 'info', targetUsers = 'all', schedule } = req.body;
      
      // Check if notification is scheduled for later
      if (schedule && new Date(schedule) > new Date()) {
        // TODO: Implement scheduled notifications
        return res.status(400).json({ 
          error: 'Scheduled notifications not yet implemented' 
        });
      }
      
      // Build where clause based on target users
      let whereClause = { isActive: true, isBanned: false };
      
      if (targetUsers === 'active') {
        // Users who have been active in the last 30 days
        whereClause.lastSeen = {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        };
      } else if (targetUsers === 'new') {
        // Users created in the last 7 days
        whereClause.createdAt = {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        };
      }
      
      // Get target users
      const users = await User.findAll({
        where: whereClause,
        attributes: ['id', 'whatsappNumber', 'firstName', 'lastSeen']
      });
      
      if (users.length === 0) {
        return res.json({
          success: true,
          message: 'No users found matching the criteria',
          stats: {
            total: 0,
            successful: 0,
            failed: 0
          }
        });
      }
      
      // Format notification based on type
      const typeEmojis = {
        info: '🔔',
        warning: '⚠️',
        success: '✅',
        error: '❌'
      };
      
      const emoji = typeEmojis[type] || '🔔';
      const formattedMessage = `${emoji} *${title}*\n\n${message}\n\n_MiiMii Team_`;
      
      let successCount = 0;
      let failCount = 0;
      const failedUsers = [];
      
      // Send notification to each user with rate limiting
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        
        try {
          // Add small delay to avoid rate limiting
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            formattedMessage
          );
          successCount++;
          
          // Log successful notification
          logger.info('Notification sent successfully', {
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            type
          });
          
        } catch (error) {
          logger.error('Failed to send notification to user', { 
            userId: user.id, 
            phoneNumber: user.whatsappNumber,
            error: error.message 
          });
          failCount++;
          failedUsers.push({
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            error: error.message
          });
        }
      }
      
      // Log notification campaign
      logger.info('Push notification campaign completed', {
        type,
        targetUsers,
        total: users.length,
        successful: successCount,
        failed: failCount,
        failedUsers: failedUsers.slice(0, 5) // Log first 5 failures
      });
      
      res.json({
        success: true,
        message: 'Push notification sent',
        notification: {
          title,
          message,
          type,
          targetUsers
        },
        stats: {
          total: users.length,
          successful: successCount,
          failed: failCount,
          successRate: `${((successCount / users.length) * 100).toFixed(1)}%`
        },
        failedUsers: failedUsers.length > 0 ? failedUsers.slice(0, 10) : undefined
      });
    } catch (error) {
      logger.error('Failed to send push notification', { error: error.message });
      res.status(500).json({ error: 'Failed to send push notification' });
    }
  }
);

// Get notification history/stats
router.get('/notifications/stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get user counts by activity
    const [totalUsers, activeUsers, newUsers] = await Promise.all([
      User.count({ where: { isActive: true, isBanned: false } }),
      User.count({ 
        where: { 
          isActive: true, 
          isBanned: false,
          lastSeen: { [Op.gte]: startDate }
        } 
      }),
      User.count({ 
        where: { 
          isActive: true, 
          isBanned: false,
          createdAt: { [Op.gte]: startDate }
        } 
      })
    ]);
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        newUsers,
        period: `${days} days`
      }
    });
  } catch (error) {
    logger.error('Failed to get notification stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get notification stats' });
  }
});

// Send notification to specific users
router.post('/notifications/send',
  [
    body('title').notEmpty().withMessage('Notification title is required'),
    body('message').notEmpty().withMessage('Notification message is required'),
    body('userIds').isArray().withMessage('User IDs must be an array'),
    body('userIds.*').isUUID().withMessage('Invalid user ID format'),
    body('type').optional().isIn(['info', 'warning', 'success', 'error']).withMessage('Invalid notification type')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { title, message, userIds, type = 'info' } = req.body;
      
      // Get specific users
      const users = await User.findAll({
        where: { 
          id: { [Op.in]: userIds },
          isActive: true, 
          isBanned: false 
        },
        attributes: ['id', 'whatsappNumber', 'firstName']
      });
      
      if (users.length === 0) {
        return res.status(404).json({ 
          error: 'No active users found with the provided IDs' 
        });
      }
      
      // Format notification based on type
      const typeEmojis = {
        info: '🔔',
        warning: '⚠️',
        success: '✅',
        error: '❌'
      };
      
      const emoji = typeEmojis[type] || '🔔';
      const formattedMessage = `${emoji} *${title}*\n\n${message}\n\n_MiiMii Team_`;
      
      let successCount = 0;
      let failCount = 0;
      const failedUsers = [];
      
      // Send notification to each user
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        
        try {
          // Add small delay to avoid rate limiting
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            formattedMessage
          );
          successCount++;
          
        } catch (error) {
          logger.error('Failed to send notification to user', { 
            userId: user.id, 
            phoneNumber: user.whatsappNumber,
            error: error.message 
          });
          failCount++;
          failedUsers.push({
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        message: 'Notifications sent to specified users',
        stats: {
          requested: userIds.length,
          found: users.length,
          successful: successCount,
          failed: failCount,
          successRate: `${((successCount / users.length) * 100).toFixed(1)}%`
        },
        failedUsers: failedUsers.length > 0 ? failedUsers : undefined
      });
    } catch (error) {
      logger.error('Failed to send targeted notifications', { error: error.message });
      res.status(500).json({ error: 'Failed to send targeted notifications' });
    }
  }
);

// Customer Support Endpoints

// Get All Support Tickets
router.get('/support/tickets', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    const whereClause = status ? { status } : {};
    
    const tickets = await SupportTicket.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      tickets: tickets.rows,
      total: tickets.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Failed to get support tickets', { error: error.message });
    res.status(500).json({ error: 'Failed to get support tickets' });
  }
});

// Update Support Ticket Status
router.patch('/support/tickets/:ticketId',
  [
    param('ticketId').isUUID().withMessage('Invalid ticket ID'),
    body('status').isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Invalid status'),
    body('response').optional().isString().withMessage('Response must be a string')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status, response } = req.body;
      
      const ticket = await SupportTicket.findByPk(ticketId, {
        include: [{ model: User, as: 'user' }]
      });
      
      if (!ticket) {
        return res.status(404).json({ error: 'Support ticket not found' });
      }
      
      await ticket.update({ status, resolution: response });
      
      // Send response to user if provided
      if (response && ticket.user) {
        await whatsappService.sendTextMessage(
          ticket.user.whatsappNumber,
          `📞 *Support Response*\n\n${response}\n\n_MiiMii Support Team_`
        );
      }
      
      res.json({
        success: true,
        message: 'Support ticket updated successfully',
        ticket
      });
    } catch (error) {
      logger.error('Failed to update support ticket', { error: error.message });
      res.status(500).json({ error: 'Failed to update support ticket' });
    }
  }
);

// Get Support Ticket Details
router.get('/support/tickets/:ticketId',
  [
    param('ticketId').isUUID().withMessage('Invalid ticket ID')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      
      const ticket = await SupportTicket.findByPk(ticketId, {
        include: [
          { model: User, as: 'user', attributes: ['firstName', 'lastName', 'whatsappNumber', 'email'] }
        ]
      });
      
      if (!ticket) {
        return res.status(404).json({ error: 'Support ticket not found' });
      }
      
      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to get support ticket details', { error: error.message });
      res.status(500).json({ error: 'Failed to get support ticket details' });
    }
  }
);

// Create Support Ticket (User endpoint)
router.post('/support/tickets',
  [
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userId, subject, description, priority = 'medium' } = req.body;
      
      // Verify user exists
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Generate unique ticket number
      const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      
      // Create support ticket
      const ticket = await SupportTicket.create({
        ticketNumber,
        userId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        status: 'open',
        type: 'inquiry' // Default type for user-created tickets
      });
      
      // Send confirmation to user
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `🎫 *Support Ticket Created*\n\n` +
        `Subject: ${subject}\n` +
        `Priority: ${priority.toUpperCase()}\n` +
        `Ticket ID: ${ticket.id}\n\n` +
        `We've received your support request and will get back to you within 24 hours.\n\n` +
        `_MiiMii Support Team_`
      );
      
      res.json({
        success: true,
        message: 'Support ticket created successfully',
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          priority: ticket.priority,
          status: ticket.status,
          createdAt: ticket.createdAt
        }
      });
    } catch (error) {
      logger.error('Failed to create support ticket', { 
        error: error.message,
        stack: error.stack,
        userId,
        subject,
        description,
        priority
      });
      res.status(500).json({ 
        error: 'Failed to create support ticket',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;
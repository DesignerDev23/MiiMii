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
    const { supabase } = require('../database/connection');
    const supabaseHelper = require('../services/supabaseHelper');
    
    // Get counts using Supabase
    const [
      totalUsersResult,
      activeUsersResult,
      totalTransactionsResult,
      completedTransactionsResult,
      pendingTransactionsResult,
      openTicketsResult
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('isActive', true).eq('isBanned', false),
      supabase.from('transactions').select('*', { count: 'exact', head: true }),
      supabase.from('transactions').select('amount').eq('status', 'completed'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('supportTickets').select('*', { count: 'exact', head: true }).eq('status', 'open')
    ]);
    
    const totalUsers = totalUsersResult.count || 0;
    const activeUsers = activeUsersResult.count || 0;
    const totalTransactions = totalTransactionsResult.count || 0;
    const totalVolume = completedTransactionsResult.data?.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0) || 0;
    const pendingTransactions = pendingTransactionsResult.count || 0;
    const openTickets = openTicketsResult.count || 0;
    
    // Get recent transactions with user info
    const { data: recentTransactionsData } = await supabase
      .from('transactions')
      .select(`
        *,
        user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
      `)
      .order('createdAt', { ascending: false })
      .limit(10);
    
    const recentTransactions = (recentTransactionsData || []).map(tx => ({
      reference: tx.reference,
      type: tx.type,
      amount: parseFloat(tx.amount),
      user: tx.user ? {
        firstName: tx.user.firstName,
        lastName: tx.user.lastName,
        whatsappNumber: tx.user.whatsappNumber
      } : null,
      status: tx.status,
      createdAt: tx.createdAt
    }));

    // KYC stats - group by kycStatus
    const { data: allUsers } = await supabase.from('users').select('kycStatus');
    const kycStats = {};
    (allUsers || []).forEach(user => {
      const status = user.kycStatus || 'not_required';
      kycStats[status] = (kycStats[status] || 0) + 1;
    });

    // Transaction type breakdown - group by type for completed transactions
    const { data: completedTxs } = await supabase
      .from('transactions')
      .select('type, amount')
      .eq('status', 'completed');
    
    const transactionTypes = {};
    (completedTxs || []).forEach(tx => {
      const type = tx.type || 'unknown';
      if (!transactionTypes[type]) {
        transactionTypes[type] = { count: 0, volume: 0 };
      }
      transactionTypes[type].count++;
      transactionTypes[type].volume += parseFloat(tx.amount || 0);
    });
    
    const transactionTypesArray = Object.entries(transactionTypes).map(([type, data]) => ({
      type,
      count: data.count,
      volume: data.volume
    }));

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
      kycStats: kycStats,
      transactionTypes: transactionTypesArray,
      recentTransactions: recentTransactions.map(tx => ({
        reference: tx.reference,
        type: tx.type,
        amount: tx.amount,
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

      // Use Supabase instead of Sequelize
      const { supabase } = require('../database/connection');
      const supabaseHelper = require('../services/supabaseHelper');
      
      // Build query
      let query = supabase.from('users').select('*', { count: 'exact' });
      
      // Apply search filter - Supabase uses or() with multiple conditions
      if (search) {
        const searchPattern = `%${search}%`;
        query = query.or(`firstName.ilike.${searchPattern},lastName.ilike.${searchPattern},whatsappNumber.ilike.${searchPattern}`);
      }
      
      // Apply kycStatus filter
      if (kycStatus) {
        query = query.eq('kycStatus', kycStatus);
      }
      
      // Apply pagination and ordering
      query = query.order('createdAt', { ascending: false })
                   .range(offset, offset + limit - 1);
      
      const { data: users, error, count } = await query;
      
      if (error) {
        logger.error('Failed to fetch users from Supabase', { error: error.message, search, kycStatus });
        throw error;
      }
      
      // Handle empty results
      if (!users) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        });
      }
      
      // Get wallets for users
      const userIds = users.map(u => u.id);
      const { data: wallets } = await supabase
        .from('wallets')
        .select('*')
        .in('userId', userIds);
      
      // Map wallets to users
      const walletMap = new Map(wallets.map(w => [w.userId, w]));
      users.forEach(user => {
        user.wallet = walletMap.get(user.id) || null;
      });

      // Get maintenance fee status for each user
      const usersWithMaintenanceStatus = await Promise.all(
        users.map(async (user) => {
          const maintenanceStatus = await walletService.getMaintenanceFeeStatus(user.id);
          return {
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
            createdAt: user.createdAt,
            maintenanceFee: {
              status: maintenanceStatus.status,
              isDue: maintenanceStatus.isDue,
              message: maintenanceStatus.message,
              monthsOverdue: maintenanceStatus.monthsOverdue || 0,
              totalOverdue: maintenanceStatus.totalOverdue || 0,
              lastPaidDate: maintenanceStatus.lastPaidDate,
              nextDueDate: maintenanceStatus.nextDueDate
            }
          };
        })
      );

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        data: usersWithMaintenanceStatus
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

// Debit maintenance fee (admin)
router.post('/users/:userId/maintenance-fee/debit',
  param('userId').isUUID(),
  body('months').optional().isInt({ min: 1, max: 12 }),
  body('notify').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { months = 1, notify = true } = req.body;
      const adminEmail = req.admin?.email;
      
      // Get current maintenance fee status
      const maintenanceStatus = await walletService.getMaintenanceFeeStatus(userId);
      
      if (!maintenanceStatus.isDue && maintenanceStatus.status === 'paid') {
        return res.status(400).json({ 
          error: 'Maintenance fee is already paid for the current month',
          maintenanceStatus 
        });
      }

      // Calculate fee for specified months
      const maintenanceFee = 50;
      const totalFee = maintenanceFee * months;
      
      // Check if user has sufficient balance
      const wallet = await walletService.getUserWallet(userId);
      if (parseFloat(wallet.balance) < totalFee) {
        return res.status(400).json({ 
          error: 'Insufficient wallet balance for maintenance fee',
          required: totalFee,
          available: parseFloat(wallet.balance)
        });
      }

      // Debit maintenance fee
      const result = await walletService.debitWallet(
        userId,
        totalFee,
        `Manual maintenance fee debit (${months} month${months > 1 ? 's' : ''}) by admin`,
        { 
          category: 'maintenance_fee', 
          feeType: 'maintenance',
          adminDebit: true,
          months,
          debitedBy: adminEmail
        }
      );

      // Update last maintenance fee date
      const now = new Date();
      const { supabase } = require('../database/connection');
      await supabase
        .from('wallets')
        .update({ 
          lastMaintenanceFee: new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString(),
          updatedAt: new Date().toISOString()
        })
        .eq('id', wallet.id);

      // Send notification if requested
      if (notify) {
        const user = await userService.getUserById(userId);
        const whatsappService = require('../services/whatsapp');
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `📋 *Maintenance Fee Charged (Admin)*\n\n` +
          `Amount: ₦${totalFee.toLocaleString()} (${months} month${months > 1 ? 's' : ''})\n` +
          `New Balance: ₦${result.newBalance.toLocaleString()}\n\n` +
          `Your maintenance fee has been manually processed by our admin team.`
        );
      }

      logger.info('Manual maintenance fee debit completed', {
        userId,
        months,
        totalFee,
        adminEmail,
        newBalance: result.newBalance
      });

      res.json({ 
        success: true, 
        message: `Maintenance fee debited for ${months} month(s)`, 
        result: {
          ...result,
          maintenanceFee: {
            months,
            totalFee,
            debitedBy: adminEmail
          }
        }
      });
    } catch (error) {
      logger.error('Failed to debit maintenance fee', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// Permanently delete a user account
router.delete('/users/:userId',
  param('userId').isUUID(),
  body('reason').optional().isString().isLength({ min: 3, max: 500 }),
  body('force').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason = null, force = false } = req.body || {};
      const deletedUser = await userService.deleteUser(userId, {
        reason,
        force,
        deletedBy: req.admin?.id || req.admin?.email || null
      });

      res.json({
        success: true,
        message: 'User account deleted successfully',
        user: deletedUser
      });
    } catch (error) {
      logger.error('Failed to delete user account', { error: error.message, userId: req.params.userId });
      const status = /wallet/i.test(error.message) ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  }
);

// Data pricing management
// Get current data plans with retail and selling prices
router.get('/data-pricing', async (req, res) => {
  try {
    const { DATA_PLANS } = require('./flowEndpoint');
    const { supabase } = require('../database/connection');
    const { data: record } = await supabase
      .from('kvStore')
      .select('*')
      .eq('key', 'data_pricing_overrides')
      .maybeSingle();
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
      const { supabase } = require('../database/connection');
    const { data: record } = await supabase
      .from('kvStore')
      .select('*')
      .eq('key', 'data_pricing_overrides')
      .maybeSingle();
      const overrides = record?.value || {};
      
      // Initialize network if it doesn't exist
      if (!overrides[network]) {
        overrides[network] = {};
      }
      
      // Set the selling price for the specific plan
      overrides[network][planId] = parseFloat(sellingPrice);
      
      // Save updated overrides
      await supabase
        .from('kvStore')
        .upsert({ key: 'data_pricing_overrides', value: overrides, updatedAt: new Date().toISOString() }, { onConflict: 'key' });
      
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
    await supabase
      .from('kvStore')
      .delete()
      .eq('key', 'data_pricing_overrides');
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
    const { supabase } = require('../database/connection');
    const { data: record } = await supabase
      .from('kvStore')
      .select('*')
      .eq('key', 'data_pricing_overrides')
      .maybeSingle();
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
    
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get wallet
    const wallet = await walletService.getUserWallet(userId);
    
    // Get transactions
    const { supabase } = require('../database/connection');
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(10);
    
    // Get support tickets
    const { data: supportTickets } = await supabase
      .from('supportTickets')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(10);

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
      wallet: wallet ? {
        balance: parseFloat(wallet.balance || 0),
        virtualAccountNumber: wallet.virtualAccountNumber,
        virtualAccountBank: wallet.virtualAccountBank,
        isActive: wallet.isActive,
        isFrozen: wallet.isFrozen
      } : null,
      stats,
      recentTransactions: transactions || [],
      supportTickets: supportTickets || []
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

      const { supabase } = require('../database/connection');
      
      // Build query
      let query = supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
        `, { count: 'exact' });
      
      if (status) query = query.eq('status', status);
      if (type) query = query.eq('type', type);
      
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
        transactions: (transactions || []).map(tx => ({
          id: tx.id,
          reference: tx.reference,
          type: tx.type,
          category: tx.category,
          amount: parseFloat(tx.amount || 0),
          fee: parseFloat(tx.fee || 0),
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

      const { supabase } = require('../database/connection');
      
      // Build query
      let query = supabase
        .from('supportTickets')
        .select(`
          *,
          user:users!supportTickets_userId_fkey(id, firstName, lastName, whatsappNumber)
        `, { count: 'exact' });
      
      if (status) query = query.eq('status', status);
      
      query = query.order('createdAt', { ascending: false })
                   .range(offset, offset + limit - 1);
      
      const { data: tickets, error, count } = await query;
      
      if (error) throw error;

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        tickets: (tickets || []).map(ticket => ({
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

      const supabaseHelper = require('../services/supabaseHelper');
      const { rows: logs, count } = await supabaseHelper.findAndCountAll('webhookLogs', where, {
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        logs: logs.map(log => ({
          id: log.id,
          source: log.source,
          eventType: log.eventType,
          processed: log.processed,
          responseStatus: log.responseStatus,
          errorMessage: log.errorMessage,
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
          ...(await userService.getUserById(userId))?.metadata || {},
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
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if wallet exists
    const wallet = await walletService.getUserWallet(userId);
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
      const { supabase } = require('../database/connection');
      await supabase
        .from('wallets')
        .update({
          virtualAccountNumber: null,
          virtualAccountBank: null,
          virtualAccountName: null,
          updatedAt: new Date().toISOString()
        })
        .eq('id', wallet.id);
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

    const { supabase } = require('../database/connection');
    
    // Get wallets without virtual accounts
    const { data: walletsWithoutVA } = await supabase
      .from('wallets')
      .select('userId')
      .is('virtualAccountNumber', null)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    const userIds = (walletsWithoutVA || []).map(w => w.userId);
    
    if (userIds.length === 0) {
      return res.json({
        success: true,
        data: {
          users: [],
          pagination: {
            total: 0,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: false
          }
        }
      });
    }
    
    // Get users for these wallets
    const { data: usersWithoutVA } = await supabase
      .from('users')
      .select('*')
      .eq('isActive', true)
      .eq('isBanned', false)
      .in('id', userIds)
      .order('createdAt', { ascending: false });
    
    // Get total count
    const { count: totalCount } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .is('virtualAccountNumber', null);
    
    // Get wallets for these users
    const { data: wallets } = await supabase
      .from('wallets')
      .select('*')
      .in('userId', userIds);
    
    const walletMap = new Map(wallets.map(w => [w.userId, w]));
    const usersWithWallets = (usersWithoutVA || []).map(user => ({
      ...user,
      wallet: walletMap.get(user.id) || null
    }));

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
      const { supabase } = require('../database/connection');

      // Transfer out charges: sum of fee for completed bank transfers
      const { data: transferOutTxs } = await supabase
        .from('transactions')
        .select('fee')
        .eq('status', 'completed')
        .eq('category', 'bank_transfer')
        .eq('type', 'debit');
      
      const transferOutFee = (transferOutTxs || []).reduce((sum, tx) => sum + parseFloat(tx.fee || 0), 0);

      // Maintenance fees: sum of debited amount for maintenance_fee
      const { data: maintenanceTxs } = await supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'completed')
        .eq('category', 'maintenance_fee')
        .eq('type', 'debit');
      
      const maintenanceRevenue = (maintenanceTxs || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      // Data margin: sum(selling - retail)
      const { data: dataRows } = await supabase
        .from('transactions')
        .select('amount, metadata')
        .eq('status', 'completed')
        .eq('category', 'data_purchase')
        .eq('type', 'debit');
      
      let dataMargin = 0;
      for (const row of dataRows || []) {
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
      const { count: airtimeCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .eq('category', 'airtime_purchase')
        .eq('type', 'debit');
      
      const airtimeMargin = (airtimeCount || 0) * 2;

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
        const { supabase } = require('../database/connection');
        const { data: transaction } = await supabase
          .from('transactions')
          .select('*')
          .eq('reference', reference)
          .maybeSingle();
        
        if (transaction) {
          await supabase
            .from('transactions')
            .update({
              status: 'completed',
              metadata: { ...(transaction.metadata || {}), providerResponse: rubiesResult },
              updatedAt: new Date().toISOString()
            })
            .eq('id', transaction.id);
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
      
      const { supabase } = require('../database/connection');
      const { data: transactions, error, count } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
        `, { count: 'exact' })
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      res.json({
        success: true,
        transactions: transactions || [],
        total: count || 0,
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
      
      const { supabase } = require('../database/connection');
      const { data: transaction } = await supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber, email),
          wallet:wallets!transactions_walletId_fkey(id, virtualAccountNumber, virtualAccountBank)
        `)
        .eq('id', transactionId)
        .maybeSingle();
      
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
    const { supabase } = require('../database/connection');
    
    // Get counts using Supabase
    const [
      totalUsersResult,
      activeUsersResult,
      totalTransactionsResult,
      completedTransactionsResult,
      pendingTransactionsResult,
      openTicketsResult,
      allUsersResult,
      rubiesTransactionsResult
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('isActive', true).eq('isBanned', false),
      supabase.from('transactions').select('*', { count: 'exact', head: true }),
      supabase.from('transactions').select('amount').eq('status', 'completed'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('supportTickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('users').select('kycStatus'),
      supabase.from('transactions')
        .select('status, amount')
        .eq('category', 'bank_transfer')
        .gte('createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);
    
    const totalUsers = totalUsersResult.count || 0;
    const activeUsers = activeUsersResult.count || 0;
    const totalTransactions = totalTransactionsResult.count || 0;
    const totalVolume = completedTransactionsResult.data?.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0) || 0;
    const pendingTransactions = pendingTransactionsResult.count || 0;
    const openTickets = openTicketsResult.count || 0;
    
    // KYC stats - group by kycStatus
    const kycStats = {};
    (allUsersResult.data || []).forEach(user => {
      const status = user.kycStatus || 'not_required';
      kycStats[status] = (kycStats[status] || 0) + 1;
    });
    
    // Rubies stats - group by status
    const rubiesStats = {};
    (rubiesTransactionsResult.data || []).forEach(tx => {
      const status = tx.status || 'unknown';
      if (!rubiesStats[status]) {
        rubiesStats[status] = { count: 0, totalAmount: 0 };
      }
      rubiesStats[status].count++;
      rubiesStats[status].totalAmount += parseFloat(tx.amount || 0);
    });
    
    const rubiesStatsArray = Object.entries(rubiesStats).map(([status, data]) => ({
      status,
      count: data.count,
      totalAmount: data.totalAmount
    }));

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
          rubiesStats: rubiesStatsArray
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
      const { supabase } = require('../database/connection');
      let query = supabase
        .from('users')
        .select('id, whatsappNumber, firstName, lastSeen');
      
      if (whereClause.isActive !== undefined) query = query.eq('isActive', whereClause.isActive);
      if (whereClause.isBanned !== undefined) query = query.eq('isBanned', whereClause.isBanned);
      if (whereClause.createdAt) {
        if (whereClause.createdAt[Op.gte]) {
          query = query.gte('createdAt', whereClause.createdAt[Op.gte].toISOString());
        }
      }
      if (whereClause.lastSeen) {
        if (whereClause.lastSeen[Op.gte]) {
          query = query.gte('lastSeen', whereClause.lastSeen[Op.gte].toISOString());
        }
      }
      
      const { data: users } = await query;
      
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
    const { supabase } = require('../database/connection');
    const [totalUsersResult, activeUsersResult, newUsersResult] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('isActive', true).eq('isBanned', false),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('isActive', true).eq('isBanned', false).gte('lastSeen', startDate.toISOString()),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('isActive', true).eq('isBanned', false).gte('createdAt', startDate.toISOString())
    ]);
    
    const totalUsers = totalUsersResult.count || 0;
    const activeUsers = activeUsersResult.count || 0;
    const newUsers = newUsersResult.count || 0;
    
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
      const { supabase } = require('../database/connection');
      const { data: users } = await supabase
        .from('users')
        .select('id, whatsappNumber, firstName')
        .in('id', userIds)
        .eq('isActive', true)
        .eq('isBanned', false);
      
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
      tickets: tickets || [],
      total: count || 0,
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
      
      const { supabase } = require('../database/connection');
      const { data: ticket } = await supabase
        .from('supportTickets')
        .select(`
          *,
          user:users!supportTickets_userId_fkey(*)
        `)
        .eq('id', ticketId)
        .maybeSingle();
      
      if (!ticket) {
        return res.status(404).json({ error: 'Support ticket not found' });
      }
      
      await supabase
        .from('supportTickets')
        .update({ status, resolution: response, updatedAt: new Date().toISOString() })
        .eq('id', ticketId);
      
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
      
      const { supabase } = require('../database/connection');
      const { data: ticket } = await supabase
        .from('supportTickets')
        .select(`
          *,
          user:users!supportTickets_userId_fkey(id, firstName, lastName, whatsappNumber, email)
        `)
        .eq('id', ticketId)
        .maybeSingle();
      
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
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Generate unique ticket number
      const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      
      // Create support ticket
      const { supabase } = require('../database/connection');
      const supabaseHelper = require('../services/supabaseHelper');
      const ticket = await supabaseHelper.create('supportTickets', {
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

// Get User Beneficiaries
router.get('/users/:userId/beneficiaries',
  [
    param('userId').isUUID().withMessage('Invalid user ID')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, search = '' } = req.query;
      
      const { supabase } = require('../database/connection');
      const supabaseHelper = require('../services/supabaseHelper');
      
      // Verify user exists
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Build query
      let query = supabase
        .from('beneficiaries')
        .select('*', { count: 'exact' })
        .eq('userId', userId)
        .eq('isActive', true)
        .order('lastUsedAt', { ascending: false, nullsFirst: false })
        .order('createdAt', { ascending: false });
      
      // Add search filter if provided
      if (search) {
        query = query.or(`name.ilike.%${search}%,nickname.ilike.%${search}%,accountNumber.ilike.%${search}%,phoneNumber.ilike.%${search}%`);
      }
      
      // Pagination
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;
      
      const { data: beneficiaries, error, count } = await query.range(from, to);
      
      if (error) {
        throw error;
      }
      
      res.json({
        success: true,
        beneficiaries: beneficiaries || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum)
        }
      });
    } catch (error) {
      logger.error('Failed to get user beneficiaries', { error: error.message, userId: req.params.userId });
      res.status(500).json({ error: 'Failed to get user beneficiaries' });
    }
  }
);

// Get Transfer Charges (Platform Fees)
router.get('/transfer-charges',
  async (req, res) => {
    try {
      const { startDate, endDate, page = 1, limit = 50 } = req.query;
      const { supabase } = require('../database/connection');
      
      // Build query for platform fee transactions
      // Platform fees are identified by metadata.isPlatformFee = true (not by category)
      let query = supabase
        .from('transactions')
        .select(`
          *,
          user:users!transactions_userId_fkey(id, firstName, lastName, whatsappNumber)
        `, { count: 'exact' })
        .eq('status', 'completed')
        .order('createdAt', { ascending: false });
      
      // Filter by platform fee using metadata
      // Note: Supabase doesn't support direct JSONB filtering in the same way
      // We'll filter in JavaScript after fetching, or use a different approach
      // For now, filter by category 'fee_charge' and reference prefix 'PFEE'
      query = query.eq('category', 'fee_charge')
                   .like('reference', 'PFEE%');
      
      // Add date filters if provided
      if (startDate) {
        query = query.gte('createdAt', new Date(startDate).toISOString());
      }
      if (endDate) {
        query = query.lte('createdAt', new Date(endDate).toISOString());
      }
      
      // Pagination
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;
      
      const { data: allCharges, error, count } = await query.range(from, to);
      
      if (error) {
        throw error;
      }
      
      // Filter to only platform fees (metadata.isPlatformFee = true)
      // Also filter by reference starting with 'PFEE' as additional check
      const charges = (allCharges || []).filter(charge => {
        const metadata = charge.metadata || {};
        return (metadata.isPlatformFee === true || metadata.isInternal === true) && 
               charge.reference?.startsWith('PFEE');
      });
      
      // Recalculate count for filtered results
      const filteredCount = charges.length;
      
      // Calculate totals
      const totalCharges = charges.reduce((sum, charge) => sum + parseFloat(charge.amount || 0), 0);
      
      res.json({
        success: true,
        charges: charges.map(charge => ({
          id: charge.id,
          reference: charge.reference,
          userId: charge.userId,
          user: charge.user ? {
            id: charge.user.id,
            firstName: charge.user.firstName,
            lastName: charge.user.lastName,
            whatsappNumber: charge.user.whatsappNumber
          } : null,
          amount: parseFloat(charge.amount),
          description: charge.description,
          parentTransactionReference: charge.metadata?.parentTransactionReference,
          createdAt: charge.createdAt
        })),
        summary: {
          totalCharges,
          totalCount: filteredCount
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredCount,
          totalPages: Math.ceil(filteredCount / limitNum)
        }
      });
    } catch (error) {
      logger.error('Failed to get transfer charges', { error: error.message });
      res.status(500).json({ error: 'Failed to get transfer charges' });
    }
  }
);

// Get Transfer Charges Summary (Stats)
router.get('/transfer-charges/summary',
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const { supabase } = require('../database/connection');
      
      // Build query for platform fee transactions
      // Filter by category 'fee_charge' and reference prefix 'PFEE'
      let query = supabase
        .from('transactions')
        .select('amount, createdAt, metadata, reference')
        .eq('category', 'fee_charge')
        .eq('status', 'completed')
        .like('reference', 'PFEE%');
      
      // Add date filters if provided
      if (startDate) {
        query = query.gte('createdAt', new Date(startDate).toISOString());
      }
      if (endDate) {
        query = query.lte('createdAt', new Date(endDate).toISOString());
      }
      
      const { data: allCharges, error } = await query;
      
      if (error) {
        throw error;
      }
      
      // Filter to only platform fees (metadata.isPlatformFee = true)
      const charges = (allCharges || []).filter(charge => {
        const metadata = charge.metadata || {};
        return (metadata.isPlatformFee === true || metadata.isInternal === true) && 
               charge.reference?.startsWith('PFEE');
      });
      
      // Calculate stats
      const totalCharges = charges.reduce((sum, charge) => sum + parseFloat(charge.amount || 0), 0);
      const totalCount = charges.length;
      
      // Group by date
      const chargesByDate = {};
      charges.forEach(charge => {
        const date = new Date(charge.createdAt).toISOString().split('T')[0];
        if (!chargesByDate[date]) {
          chargesByDate[date] = { count: 0, amount: 0 };
        }
        chargesByDate[date].count++;
        chargesByDate[date].amount += parseFloat(charge.amount || 0);
      });
      
      res.json({
        success: true,
        summary: {
          totalCharges,
          totalCount,
          averageCharge: totalCount > 0 ? totalCharges / totalCount : 0,
          chargesByDate
        }
      });
    } catch (error) {
      logger.error('Failed to get transfer charges summary', { error: error.message });
      res.status(500).json({ error: 'Failed to get transfer charges summary' });
    }
  }
);

// Sync data plans from Bilal dashboard
router.post('/data-plans/sync',
  async (req, res) => {
    try {
      const bilalService = require('../services/bilal');
      
      logger.info('Admin initiated data plans sync');
      
      const result = await bilalService.syncDataPlansFromDashboard();
      
      res.json({
        success: true,
        message: 'Data plans synced successfully from Bilal dashboard',
        data: {
          networks: result.networks,
          totalPlans: result.totalPlans,
          plansByNetwork: Object.keys(result.plans).reduce((acc, network) => {
            acc[network] = result.plans[network].length;
            return acc;
          }, {})
        }
      });
    } catch (error) {
      logger.error('Failed to sync data plans', { error: error.message });
      res.status(500).json({ 
        error: 'Failed to sync data plans',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get current data plans (cached or fresh)
router.get('/data-plans',
  query('network').optional().isIn(['MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  query('refresh').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const { network, refresh } = req.query;
      const bilalService = require('../services/bilal');
      
      let plans;
      if (refresh === 'true') {
        logger.info('Admin requested fresh data plans');
        const result = await bilalService.syncDataPlansFromDashboard();
        plans = result.plans;
      } else {
        plans = await bilalService.getCachedDataPlans();
      }
      
      // If specific network requested, filter
      if (network) {
        plans = { [network]: plans[network] || [] };
      }
      
      res.json({
        success: true,
        plans: plans,
        networks: Object.keys(plans),
        totalPlans: Object.values(plans).reduce((sum, networkPlans) => sum + networkPlans.length, 0)
      });
    } catch (error) {
      logger.error('Failed to get data plans', { error: error.message });
      res.status(500).json({ 
        error: 'Failed to get data plans',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;
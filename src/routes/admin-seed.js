const express = require('express');
const router = express.Router();
const { initializeDataPlans } = require('../database/self-healing-tables');
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

/**
 * Manual seeding endpoint for admin
 * POST /api/admin/seed-data-plans
 */
router.post('/seed-data-plans', async (req, res) => {
  try {
    logger.info('🌱 Manual data plans seeding requested by admin');
    
    // Initialize data plans (this will create table and seed data)
    await initializeDataPlans();
    
    // Get counts
    const totalPlans = await DataPlan.count();
    const activePlans = await DataPlan.count({ where: { isActive: true } });
    
    // Get plans by network
    const plansByNetwork = await DataPlan.findAll({
      attributes: [
        'network',
        [require('../database/connection').sequelize.fn('COUNT', require('../database/connection').sequelize.col('id')), 'count']
      ],
      where: { isActive: true },
      group: ['network'],
      raw: true
    });
    
    logger.info('📊 Data plans seeding completed:', {
      total: totalPlans,
      active: activePlans,
      byNetwork: plansByNetwork
    });
    
    res.json({
      success: true,
      message: 'Data plans seeded successfully',
      data: {
        total: totalPlans,
        active: activePlans,
        inactive: totalPlans - activePlans,
        byNetwork: plansByNetwork
      }
    });
    
  } catch (error) {
    logger.error('❌ Error seeding data plans:', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to seed data plans',
      details: error.message
    });
  }
});

/**
 * Check data plans status
 * GET /api/admin/data-plans-status
 */
router.get('/data-plans-status', async (req, res) => {
  try {
    const totalPlans = await DataPlan.count();
    const activePlans = await DataPlan.count({ where: { isActive: true } });
    
    const plansByNetwork = await DataPlan.findAll({
      attributes: [
        'network',
        [require('../database/connection').sequelize.fn('COUNT', require('../database/connection').sequelize.col('id')), 'count']
      ],
      where: { isActive: true },
      group: ['network'],
      raw: true
    });
    
    res.json({
      success: true,
      data: {
        total: totalPlans,
        active: activePlans,
        inactive: totalPlans - activePlans,
        byNetwork: plansByNetwork,
        isEmpty: totalPlans === 0
      }
    });
    
  } catch (error) {
    logger.error('❌ Error checking data plans status:', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to check data plans status',
      details: error.message
    });
  }
});

module.exports = router;

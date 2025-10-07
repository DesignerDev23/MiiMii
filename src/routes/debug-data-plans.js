const express = require('express');
const router = express.Router();
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

// Test endpoint to get data plans directly
router.get('/test-plans', async (req, res) => {
  try {
    logger.info('🔍 Test: Getting data plans directly...');
    
    // Get all plans without any filters
    const allPlans = await DataPlan.findAll({
      order: [['createdAt', 'ASC']]
    });
    
    // Get active plans only
    const activePlans = await DataPlan.findAll({
      where: { isActive: true },
      order: [['createdAt', 'ASC']]
    });
    
    res.json({
      success: true,
      test: {
        totalCount: allPlans.length,
        activeCount: activePlans.length,
        allPlans: allPlans.map(plan => ({
          id: plan.id,
          network: plan.network,
          dataSize: plan.dataSize,
          isActive: plan.isActive,
          retailPrice: plan.retailPrice,
          sellingPrice: plan.sellingPrice
        })),
        activePlans: activePlans.map(plan => ({
          id: plan.id,
          network: plan.network,
          dataSize: plan.dataSize,
          isActive: plan.isActive,
          retailPrice: plan.retailPrice,
          sellingPrice: plan.sellingPrice
        }))
      }
    });
  } catch (error) {
    logger.error('❌ Test error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Debug endpoint to check data plans
router.get('/debug', async (req, res) => {
  try {
    logger.info('🔍 Debug: Checking data plans...');
    
    // Check total count
    const totalCount = await DataPlan.count();
    logger.info(`📊 Total plans: ${totalCount}`);
    
    // Check active plans
    const activeCount = await DataPlan.count({ where: { isActive: true } });
    logger.info(`✅ Active plans: ${activeCount}`);
    
    // Get all plans (no filters)
    const allPlans = await DataPlan.findAll({
      limit: 10,
      order: [['createdAt', 'ASC']]
    });
    
    // Get active plans only
    const activePlans = await DataPlan.findAll({
      where: { isActive: true },
      limit: 10,
      order: [['createdAt', 'ASC']]
    });
    
    res.json({
      success: true,
      debug: {
        totalCount,
        activeCount,
        allPlans: allPlans.map(plan => ({
          id: plan.id,
          network: plan.network,
          dataSize: plan.dataSize,
          isActive: plan.isActive,
          retailPrice: plan.retailPrice,
          sellingPrice: plan.sellingPrice
        })),
        activePlans: activePlans.map(plan => ({
          id: plan.id,
          network: plan.network,
          dataSize: plan.dataSize,
          isActive: plan.isActive,
          retailPrice: plan.retailPrice,
          sellingPrice: plan.sellingPrice
        }))
      }
    });
  } catch (error) {
    logger.error('❌ Debug error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;

#!/usr/bin/env node

/**
 * Test script to check data plans in database
 */

const { sequelize } = require('../database/connection');
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

async function testDataPlans() {
  try {
    logger.info('🔍 Testing data plans in database...');
    
    // Test database connection
    await sequelize.authenticate();
    logger.info('✅ Database connection established');
    
    // Check total count
    const totalCount = await DataPlan.count();
    logger.info(`📊 Total plans in database: ${totalCount}`);
    
    // Check active plans
    const activeCount = await DataPlan.count({ where: { isActive: true } });
    logger.info(`✅ Active plans: ${activeCount}`);
    
    // Check inactive plans
    const inactiveCount = await DataPlan.count({ where: { isActive: false } });
    logger.info(`❌ Inactive plans: ${inactiveCount}`);
    
    // Check plans by network
    const plansByNetwork = await DataPlan.findAll({
      attributes: [
        'network',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN "isActive" = true THEN 1 END')), 'activeCount']
      ],
      group: ['network'],
      raw: true
    });
    
    logger.info('📱 Plans by Network:', plansByNetwork);
    
    // Get some sample plans
    const samplePlans = await DataPlan.findAll({
      limit: 5,
      order: [['createdAt', 'ASC']]
    });
    
    logger.info('📋 Sample Plans:', samplePlans.map(plan => ({
      id: plan.id,
      network: plan.network,
      dataSize: plan.dataSize,
      isActive: plan.isActive,
      retailPrice: plan.retailPrice,
      sellingPrice: plan.sellingPrice
    })));
    
    // Test the exact query that the API uses
    const apiQuery = await DataPlan.findAndCountAll({
      where: {
        isActive: true
      },
      order: [['createdAt', 'DESC']],
      limit: 50,
      offset: 0
    });
    
    logger.info('🔍 API Query Results:', {
      count: apiQuery.count,
      rows: apiQuery.rows.length,
      sampleRow: apiQuery.rows[0] ? {
        id: apiQuery.rows[0].id,
        network: apiQuery.rows[0].network,
        isActive: apiQuery.rows[0].isActive
      } : null
    });
    
    logger.info('🎉 Test completed successfully!');
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Error testing data plans:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  testDataPlans();
}

module.exports = { testDataPlans };

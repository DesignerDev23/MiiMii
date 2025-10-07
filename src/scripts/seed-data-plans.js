#!/usr/bin/env node

/**
 * Manual script to seed data plans into the database
 * Run this if the automatic seeding didn't work
 */

const { initializeDataPlans } = require('../database/self-healing-tables');
const { sequelize } = require('../database/connection');
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

async function seedDataPlans() {
  try {
    logger.info('🚀 Starting manual data plans seeding...');
    
    // Test database connection
    await sequelize.authenticate();
    logger.info('✅ Database connection established');
    
    // Initialize data plans (this will create table and seed data)
    await initializeDataPlans();
    
    // Verify seeding
    const totalPlans = await DataPlan.count();
    const activePlans = await DataPlan.count({ where: { isActive: true } });
    
    logger.info('📊 Seeding Results:', {
      total: totalPlans,
      active: activePlans,
      inactive: totalPlans - activePlans
    });
    
    // Show some sample plans
    const samplePlans = await DataPlan.findAll({
      limit: 5,
      order: [['createdAt', 'ASC']]
    });
    
    logger.info('📋 Sample Plans:', samplePlans.map(plan => ({
      id: plan.id,
      network: plan.network,
      dataSize: plan.dataSize,
      retailPrice: plan.retailPrice,
      sellingPrice: plan.sellingPrice
    })));
    
    logger.info('🎉 Data plans seeding completed successfully!');
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Error seeding data plans:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  seedDataPlans();
}

module.exports = { seedDataPlans };

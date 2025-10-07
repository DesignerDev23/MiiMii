const { sequelize } = require('../database/connection');
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

async function setupDataPlans() {
  try {
    logger.info('🚀 Setting up data plans...');

    // Check if table exists, if not create it
    const tableExists = await sequelize.getQueryInterface().showAllTables()
      .then(tables => tables.includes('data_plans'));

    if (!tableExists) {
      logger.info('📋 Creating data_plans table...');
      const migration = require('../database/migrations/2025-10-07-create-data-plans');
      await migration.up(sequelize.getQueryInterface(), sequelize);
      logger.info('✅ Data plans table created');
    } else {
      logger.info('✅ Data plans table already exists');
    }

    // Check if we have any data plans
    const existingPlans = await DataPlan.count();
    
    if (existingPlans === 0) {
      logger.info('🌱 Seeding initial data plans...');
      const seed = require('../database/seeds/2025-10-07-initial-data-plans');
      await seed.up(sequelize.getQueryInterface(), sequelize);
      logger.info('✅ Initial data plans seeded');
    } else {
      logger.info(`✅ Data plans already exist (${existingPlans} plans found)`);
    }

    // Show summary
    const totalPlans = await DataPlan.count();
    const activePlans = await DataPlan.count({ where: { isActive: true } });
    
    logger.info('📊 Data Plans Summary:', {
      total: totalPlans,
      active: activePlans,
      inactive: totalPlans - activePlans
    });

    // Show plans by network
    const plansByNetwork = await DataPlan.findAll({
      attributes: [
        'network',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: { isActive: true },
      group: ['network'],
      raw: true
    });

    logger.info('📱 Plans by Network:', plansByNetwork);

    logger.info('🎉 Data plans setup completed successfully!');
    
  } catch (error) {
    logger.error('❌ Error setting up data plans:', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  setupDataPlans()
    .then(() => {
      logger.info('✅ Setup completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupDataPlans;

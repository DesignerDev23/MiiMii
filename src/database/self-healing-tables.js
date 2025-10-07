const { sequelize } = require('./connection');
const { DataPlan } = require('../models');
const logger = require('../utils/logger');

/**
 * Self-healing table creation for production
 * This will create tables if they don't exist when the app starts
 */
async function createDataPlansTable() {
  try {
    logger.info('🔧 Checking data_plans table...');

    // Check if table exists
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'data_plans'
      );
    `);

    const tableExists = results[0].exists;

    if (!tableExists) {
      logger.info('📋 Creating data_plans table...');
      
      await sequelize.query(`
        CREATE TABLE data_plans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          network VARCHAR(20) NOT NULL CHECK (network IN ('MTN', 'AIRTEL', 'GLO', '9MOBILE')),
          "planType" VARCHAR(50) NOT NULL CHECK ("planType" IN ('SME', 'COOPERATE GIFTING', 'GIFTING')),
          "dataSize" VARCHAR(50) NOT NULL,
          validity VARCHAR(50) NOT NULL,
          "retailPrice" DECIMAL(10,2) NOT NULL,
          "sellingPrice" DECIMAL(10,2) NOT NULL,
          "isActive" BOOLEAN DEFAULT true,
          "apiPlanId" INTEGER,
          "networkCode" INTEGER NOT NULL,
          description TEXT,
          metadata JSONB,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes
      await sequelize.query(`
        CREATE INDEX idx_data_plans_network_active ON data_plans (network, "isActive");
      `);

      await sequelize.query(`
        CREATE INDEX idx_data_plans_api_plan_id ON data_plans ("apiPlanId");
      `);

      logger.info('✅ data_plans table created successfully');
    } else {
      logger.info('✅ data_plans table already exists');
    }

    return true;
  } catch (error) {
    logger.error('❌ Error creating data_plans table:', { error: error.message });
    throw error;
  }
}

/**
 * Seed initial data plans if table is empty
 */
async function seedInitialDataPlans() {
  try {
    const existingPlans = await DataPlan.count();
    
    if (existingPlans === 0) {
      logger.info('🌱 Seeding initial data plans...');
      
      const initialDataPlans = [
        // MTN Plans
        { network: 'MTN', planType: 'SME', dataSize: '500MB', validity: '30 days', retailPrice: 345.00, sellingPrice: 345.00, networkCode: 1, apiPlanId: 36 },
        { network: 'MTN', planType: 'SME', dataSize: '1GB', validity: '30 days', retailPrice: 490.00, sellingPrice: 490.00, networkCode: 1, apiPlanId: 37 },
        { network: 'MTN', planType: 'SME', dataSize: '2GB', validity: '30 days', retailPrice: 980.00, sellingPrice: 980.00, networkCode: 1, apiPlanId: 38 },
        { network: 'MTN', planType: 'SME', dataSize: '3GB', validity: '1 Month', retailPrice: 1470.00, sellingPrice: 1470.00, networkCode: 1, apiPlanId: 39 },
        { network: 'MTN', planType: 'SME', dataSize: '5GB', validity: '30 days', retailPrice: 2450.00, sellingPrice: 2450.00, networkCode: 1, apiPlanId: 40 },
        { network: 'MTN', planType: 'SME', dataSize: '10GB', validity: '30 days', retailPrice: 4900.00, sellingPrice: 4900.00, networkCode: 1, apiPlanId: 41 },
        { network: 'MTN', planType: 'COOPERATE GIFTING', dataSize: '500MB', validity: '30 days', retailPrice: 425.00, sellingPrice: 425.00, networkCode: 1, apiPlanId: 42 },
        { network: 'MTN', planType: 'COOPERATE GIFTING', dataSize: '1GB', validity: '30 days', retailPrice: 810.00, sellingPrice: 810.00, networkCode: 1, apiPlanId: 46 },
        { network: 'MTN', planType: 'COOPERATE GIFTING', dataSize: '2GB', validity: '30 days', retailPrice: 1620.00, sellingPrice: 1620.00, networkCode: 1, apiPlanId: 47 },
        { network: 'MTN', planType: 'COOPERATE GIFTING', dataSize: '5GB', validity: '30 days', retailPrice: 4050.00, sellingPrice: 4050.00, networkCode: 1, apiPlanId: 49 },
        { network: 'MTN', planType: 'COOPERATE GIFTING', dataSize: '10GB', validity: '30 days', retailPrice: 8100.00, sellingPrice: 8100.00, networkCode: 1, apiPlanId: 50 },

        // AIRTEL Plans
        { network: 'AIRTEL', planType: 'COOPERATE GIFTING', dataSize: '500MB', validity: '30 days', retailPrice: 485.00, sellingPrice: 485.00, networkCode: 2, apiPlanId: 51 },
        { network: 'AIRTEL', planType: 'COOPERATE GIFTING', dataSize: '1GB', validity: '7 days', retailPrice: 776.00, sellingPrice: 776.00, networkCode: 2, apiPlanId: 52 },
        { network: 'AIRTEL', planType: 'GIFTING', dataSize: '2GB', validity: '30 days', retailPrice: 1470.00, sellingPrice: 1470.00, networkCode: 2, apiPlanId: 53 },
        { network: 'AIRTEL', planType: 'COOPERATE GIFTING', dataSize: '4GB', validity: '30 days', retailPrice: 2425.00, sellingPrice: 2425.00, networkCode: 2, apiPlanId: 54 },
        { network: 'AIRTEL', planType: 'GIFTING', dataSize: '10GB', validity: '30 days', retailPrice: 3920.00, sellingPrice: 3920.00, networkCode: 2, apiPlanId: 55 },
        { network: 'AIRTEL', planType: 'COOPERATE GIFTING', dataSize: '300MB', validity: '30days', retailPrice: 291.00, sellingPrice: 291.00, networkCode: 2, apiPlanId: 66 },
        { network: 'AIRTEL', planType: 'COOPERATE GIFTING', dataSize: '100MB', validity: '30days', retailPrice: 140.00, sellingPrice: 140.00, networkCode: 2, apiPlanId: 67 },

        // GLO Plans
        { network: 'GLO', planType: 'GIFTING', dataSize: '1.5GB', validity: '30 days', retailPrice: 460.00, sellingPrice: 460.00, networkCode: 3, apiPlanId: 56 },
        { network: 'GLO', planType: 'GIFTING', dataSize: '2.9GB', validity: '30 days', retailPrice: 930.00, sellingPrice: 930.00, networkCode: 3, apiPlanId: 57 },
        { network: 'GLO', planType: 'GIFTING', dataSize: '4.1GB', validity: '30 days', retailPrice: 1260.00, sellingPrice: 1260.00, networkCode: 3, apiPlanId: 58 },
        { network: 'GLO', planType: 'GIFTING', dataSize: '5.8GB', validity: '30 days', retailPrice: 1840.00, sellingPrice: 1840.00, networkCode: 3, apiPlanId: 59 },
        { network: 'GLO', planType: 'GIFTING', dataSize: '10GB', validity: '30 days', retailPrice: 3010.00, sellingPrice: 3010.00, networkCode: 3, apiPlanId: 60 },

        // 9MOBILE Plans
        { network: '9MOBILE', planType: 'SME', dataSize: '1.1GB', validity: '30 days', retailPrice: 390.00, sellingPrice: 390.00, networkCode: 4, apiPlanId: 61 },
        { network: '9MOBILE', planType: 'SME', dataSize: '2GB', validity: '30 days', retailPrice: 750.00, sellingPrice: 750.00, networkCode: 4, apiPlanId: 62 }
      ];

      await DataPlan.bulkCreate(initialDataPlans, {
        ignoreDuplicates: true
      });

      logger.info(`✅ Seeded ${initialDataPlans.length} initial data plans`);
    } else {
      logger.info(`✅ Data plans already exist (${existingPlans} plans found)`);
    }

    return true;
  } catch (error) {
    logger.error('❌ Error seeding initial data plans:', { error: error.message });
    throw error;
  }
}

/**
 * Initialize data plans system
 */
async function initializeDataPlans() {
  try {
    logger.info('🚀 Initializing data plans system...');
    
    await createDataPlansTable();
    await seedInitialDataPlans();
    
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

    logger.info('🎉 Data plans system initialized successfully!');
    
  } catch (error) {
    logger.error('❌ Error initializing data plans system:', { error: error.message, stack: error.stack });
    throw error;
  }
}

module.exports = {
  createDataPlansTable,
  seedInitialDataPlans,
  initializeDataPlans
};

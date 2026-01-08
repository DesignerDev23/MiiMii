const { DataPlan } = require('../../models');

module.exports = {
  up: async (queryInterface, Sequelize) => {
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

    // Insert all data plans
    await DataPlan.bulkCreate(initialDataPlans, {
      ignoreDuplicates: true
    });

    console.log(`✅ Seeded ${initialDataPlans.length} data plans`);
  },

  down: async (queryInterface, Sequelize) => {
    await DataPlan.destroy({
      where: {},
      truncate: true
    });
  }
};

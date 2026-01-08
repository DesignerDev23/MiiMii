const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('data_plans', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      network: {
        type: DataTypes.ENUM('MTN', 'AIRTEL', 'GLO', '9MOBILE'),
        allowNull: false
      },
      planType: {
        type: DataTypes.ENUM('SME', 'COOPERATE GIFTING', 'GIFTING'),
        allowNull: false
      },
      dataSize: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      validity: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      retailPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      sellingPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      apiPlanId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      networkCode: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('data_plans', ['network', 'isActive']);
    await queryInterface.addIndex('data_plans', ['apiPlanId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('data_plans');
  }
};

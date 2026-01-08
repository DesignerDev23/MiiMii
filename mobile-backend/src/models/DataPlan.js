const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const DataPlan = sequelize.define('DataPlan', {
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
    type: DataTypes.STRING(50), // e.g., "500MB", "1GB", "2GB"
    allowNull: false
  },
  validity: {
    type: DataTypes.STRING(50), // e.g., "30 days", "7 days", "1 Month"
    allowNull: false
  },
  retailPrice: {
    type: DataTypes.DECIMAL(10, 2), // Original price from API
    allowNull: false
  },
  sellingPrice: {
    type: DataTypes.DECIMAL(10, 2), // Admin-set selling price
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  apiPlanId: {
    type: DataTypes.INTEGER, // ID from Bilal API
    allowNull: true
  },
  networkCode: {
    type: DataTypes.INTEGER, // Network code for API calls
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'data_plans',
  timestamps: true,
  indexes: [
    {
      fields: ['network', 'isActive']
    },
    {
      fields: ['apiPlanId']
    }
  ]
});

module.exports = DataPlan;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

// Simple key/value store with optional TTL using expiresAt
const KVStore = sequelize.define('KVStore', {
  key: {
    type: DataTypes.STRING(255),
    primaryKey: true,
    allowNull: false,
    unique: true
  },
  value: {
    // Store arbitrary JSON values
    type: DataTypes.JSONB,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  }
}, {
  tableName: 'kv_store',
  timestamps: true,
  indexes: [
    { fields: ['expires_at'] }
  ]
});

module.exports = KVStore;



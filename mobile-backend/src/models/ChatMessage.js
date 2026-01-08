const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/connection');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant', 'system'),
    allowNull: false,
    defaultValue: 'user'
  },
  channel: {
    type: DataTypes.ENUM('mobile', 'whatsapp'),
    allowNull: false,
    defaultValue: 'mobile'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['channel'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = ChatMessage;



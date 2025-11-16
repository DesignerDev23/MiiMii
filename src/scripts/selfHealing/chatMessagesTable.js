const { sequelize } = require('../../database/connection');
const logger = require('../../utils/logger');

async function tableExists(table) {
  const tables = await sequelize.getQueryInterface().showAllTables();
  return tables.includes(table) || tables.includes(table.toLowerCase());
}

async function ensureChatMessagesTable() {
  try {
    logger.info('🚀 Ensuring chat_messages table exists...');

    const exists = await tableExists('chat_messages');
    if (exists) {
      logger.info('✅ chat_messages table already exists');
      return;
    }

    logger.info('🛠️ Creating chat_messages table...');
    const qi = sequelize.getQueryInterface();
    await qi.createTable('chat_messages', {
      id: {
        type: sequelize.Sequelize.UUID,
        defaultValue: sequelize.Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role: {
        type: sequelize.Sequelize.ENUM('user', 'assistant', 'system'),
        allowNull: false,
        defaultValue: 'user'
      },
      channel: {
        type: sequelize.Sequelize.ENUM('mobile', 'whatsapp'),
        allowNull: false,
        defaultValue: 'mobile'
      },
      content: {
        type: sequelize.Sequelize.TEXT,
        allowNull: false
      },
      metadata: {
        type: sequelize.Sequelize.JSONB,
        allowNull: true
      },
      createdAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.fn('NOW')
      },
      updatedAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.fn('NOW')
      }
    });

    await qi.addIndex('chat_messages', ['userId']);
    await qi.addIndex('chat_messages', ['channel']);
    await qi.addIndex('chat_messages', ['createdAt']);

    logger.info('✅ chat_messages table created successfully');
  } catch (error) {
    logger.error('❌ Failed to ensure chat_messages table', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  ensureChatMessagesTable()
    .then(() => {
      logger.info('✅ Chat messages self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Chat messages self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureChatMessagesTable;



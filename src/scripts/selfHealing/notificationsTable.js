const { sequelize } = require('../../database/connection');
const logger = require('../../utils/logger');

async function tableExists(tableName) {
  const [results] = await sequelize.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = :tableName
  `, {
    replacements: { tableName },
    type: sequelize.QueryTypes.SELECT
  });
  return results && results.length > 0;
}

async function ensureNotificationsTable() {
  try {
    logger.info('🚀 Ensuring notifications table exists...');

    const exists = await tableExists('notifications');
    
    if (exists) {
      logger.info('✅ Notifications table already exists');
      return;
    }

    logger.info('🛠️ Creating notifications table...');
    const qi = sequelize.getQueryInterface();

    await qi.createTable('notifications', {
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
        }
      },
      type: {
        type: sequelize.Sequelize.ENUM(
          'transaction_credit',
          'transaction_debit',
          'transfer_incoming',
          'transfer_outgoing',
          'transfer_failed',
          'airtime_purchase',
          'data_purchase',
          'bill_payment',
          'wallet_funded',
          'account_verified',
          'pin_changed',
          'security_alert',
          'system_announcement',
          'promotion'
        ),
        allowNull: false
      },
      title: {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false
      },
      message: {
        type: sequelize.Sequelize.TEXT,
        allowNull: false
      },
      data: {
        type: sequelize.Sequelize.JSONB,
        allowNull: true
      },
      isRead: {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false
      },
      readAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      },
      priority: {
        type: sequelize.Sequelize.ENUM('low', 'normal', 'high', 'urgent'),
        defaultValue: 'normal'
      },
      actionUrl: {
        type: sequelize.Sequelize.STRING(500),
        allowNull: true
      },
      imageUrl: {
        type: sequelize.Sequelize.STRING(500),
        allowNull: true
      },
      expiresAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await qi.addIndex('notifications', ['userId', 'isRead'], { name: 'notifications_user_read_idx' });
    await qi.addIndex('notifications', ['userId', 'createdAt'], { name: 'notifications_user_created_idx' });
    await qi.addIndex('notifications', ['type'], { name: 'notifications_type_idx' });
    await qi.addIndex('notifications', ['priority'], { name: 'notifications_priority_idx' });
    await qi.addIndex('notifications', ['expiresAt'], { name: 'notifications_expires_idx' });

    logger.info('✅ Notifications table created successfully');
  } catch (error) {
    logger.error('❌ Failed to ensure notifications table', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  ensureNotificationsTable()
    .then(() => {
      logger.info('✅ Self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureNotificationsTable;


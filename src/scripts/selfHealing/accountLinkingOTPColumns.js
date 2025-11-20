const { sequelize } = require('../../database/connection');
const logger = require('../../utils/logger');

async function columnExists(table, column) {
  const [results] = await sequelize.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = :table
        AND column_name = :column
    `,
    {
      replacements: { table, column },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return results && results.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
  const exists = await columnExists(table, column);
  if (exists) {
    logger.info(`✅ Column ${table}.${column} already exists`);
    return;
  }

  logger.info(`🛠️ Adding column ${table}.${column}`);
  await sequelize.getQueryInterface().addColumn(table, column, definition);
  logger.info(`✅ Column ${table}.${column} added successfully`);
}

/**
 * Self-healing script to ensure account linking OTP columns exist in users table
 * These columns are needed for secure account linking via WhatsApp OTP
 */
async function ensureAccountLinkingOTPColumns() {
  try {
    logger.info('🚀 Ensuring account linking OTP columns exist...');

    await addColumnIfMissing('users', 'appLinkOTP', {
      type: sequelize.Sequelize.STRING,
      allowNull: true
    });

    await addColumnIfMissing('users', 'appLinkOTPExpiry', {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    });

    await addColumnIfMissing('users', 'appLinkOTPAttempts', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    logger.info('🎉 Account linking OTP columns check completed');
  } catch (error) {
    logger.error('❌ Failed to ensure account linking OTP columns', { error: error.message });
    // Don't throw - this is self-healing, should not break app startup
    return false;
  }
  return true;
}

if (require.main === module) {
  ensureAccountLinkingOTPColumns()
    .then(() => {
      logger.info('✅ Self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureAccountLinkingOTPColumns;


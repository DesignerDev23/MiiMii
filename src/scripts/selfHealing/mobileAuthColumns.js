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
  return !!results;
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

async function ensureMobileAuthColumns() {
  try {
    logger.info('🚀 Ensuring mobile auth columns exist...');

    await addColumnIfMissing('Users', 'appEmail', {
      type: sequelize.Sequelize.STRING,
      allowNull: true,
      unique: true
    });

    await addColumnIfMissing('Users', 'appEmailVerified', {
      type: sequelize.Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await addColumnIfMissing('Users', 'appPasswordHash', {
      type: sequelize.Sequelize.STRING,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appLoginAttempts', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await addColumnIfMissing('Users', 'appLockUntil', {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appLastLoginAt', {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appPasswordResetOTP', {
      type: sequelize.Sequelize.STRING,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appPasswordResetOTPExpiry', {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appPasswordResetOTPAttempts', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Keep old token columns for backward compatibility (can be removed later)
    await addColumnIfMissing('Users', 'appPasswordResetToken', {
      type: sequelize.Sequelize.STRING,
      allowNull: true
    });

    await addColumnIfMissing('Users', 'appPasswordResetExpiry', {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    });

    logger.info('🎉 Mobile auth columns check completed');
  } catch (error) {
    logger.error('❌ Failed to ensure mobile auth columns', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  ensureMobileAuthColumns()
    .then(() => {
      logger.info('✅ Self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureMobileAuthColumns;


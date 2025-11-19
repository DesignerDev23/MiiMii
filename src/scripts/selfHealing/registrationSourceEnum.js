const { sequelize } = require('../../database/connection');
const logger = require('../../utils/logger');

/**
 * Self-healing script to add missing enum values to registrationSource enum
 * PostgreSQL requires ALTER TYPE to add enum values
 */
async function ensureRegistrationSourceEnumValues() {
  try {
    logger.info('🚀 Ensuring registrationSource enum has all required values...');

    // First, find the enum type name (it might be enum_users_registrationSource or similar)
    const [enumType] = await sequelize.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_attribute a ON a.atttypid = t.oid
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'users'
        AND a.attname = 'registrationSource'
        AND t.typtype = 'e';
    `);

    if (!enumType || enumType.length === 0) {
      logger.warn('⚠️ Could not find registrationSource enum type - may need manual migration');
      return;
    }

    const enumTypeName = enumType[0].typname;
    logger.info('📋 Found enum type:', { enumTypeName });

    // Check if enum values exist
    const [enumValues] = await sequelize.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (
        SELECT oid 
        FROM pg_type 
        WHERE typname = :enumTypeName
      )
      ORDER BY enumsortorder;
    `, {
      replacements: { enumTypeName }
    });

    const existingValues = enumValues.map(row => row.enumlabel);
    logger.info('📋 Existing enum values:', { existingValues });

    const requiredValues = [
      'whatsapp', 'api', 'admin', 'app'
    ];

    const missingValues = requiredValues.filter(val => !existingValues.includes(val));

    if (missingValues.length === 0) {
      logger.info('✅ All required enum values already exist');
      return;
    }

    logger.info('🛠️ Adding missing enum values:', { missingValues });

    // Add missing enum values one by one
    for (const value of missingValues) {
      try {
        // PostgreSQL allows adding enum values with ALTER TYPE ... ADD VALUE
        // We use DO block to check if value exists first to avoid errors
        // Note: We escape the value to prevent SQL injection (though values are controlled)
        const escapedValue = value.replace(/'/g, "''");
        const escapedTypeName = enumTypeName.replace(/"/g, '""'); // Ensure type name is correctly quoted
        await sequelize.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_enum 
              WHERE enumlabel = '${escapedValue}' 
              AND enumtypid = (
                SELECT oid FROM pg_type WHERE typname = '${escapedTypeName}'
              )
            ) THEN
              ALTER TYPE "${escapedTypeName}" ADD VALUE '${escapedValue}';
            END IF;
          END $$;
        `);
        logger.info(`✅ Added enum value: ${value}`);
      } catch (error) {
        // If the value already exists (race condition), that's fine
        if (error.message.includes('already exists') || 
            error.message.includes('duplicate') ||
            error.message.includes('already present')) {
          logger.info(`ℹ️ Enum value ${value} already exists (skipped)`);
        } else {
          logger.error(`❌ Failed to add enum value ${value}:`, { error: error.message });
          // Don't throw - continue with other values
        }
      }
    }

    logger.info('🎉 RegistrationSource enum check completed');
  } catch (error) {
    logger.error('❌ Failed to ensure registrationSource enum values', { error: error.message });
    // Don't throw - this is self-healing, shouldn't break startup
    logger.warn('⚠️ Continuing without enum update - manual intervention may be required');
  }
}

if (require.main === module) {
  ensureRegistrationSourceEnumValues()
    .then(() => {
      logger.info('✅ Self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureRegistrationSourceEnumValues;


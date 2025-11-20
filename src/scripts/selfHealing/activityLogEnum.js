const { sequelize } = require('../../database/connection');
const logger = require('../../utils/logger');

async function ensureActivityLogEnumValues() {
  try {
    logger.info('🚀 Ensuring activityLog activityType enum has all required values...');

    // First, find the enum type name (it might be enum_activity_logs_activityType or similar)
    const [enumType] = await sequelize.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_attribute a ON a.atttypid = t.oid
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'activity_logs'
        AND a.attname = 'activityType'
        AND t.typtype = 'e';
    `);

    if (!enumType || enumType.length === 0) {
      logger.warn('⚠️ Could not find activityType enum type - may need manual migration');
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
    logger.info('📋 Existing enum values:', { existingValues, count: existingValues.length });

    const requiredValues = [
      'user_registration', 'user_login', 'user_logout', 'profile_update',
      'kyc_submission', 'kyc_verification', 'kyc_rejection',
      'pin_creation', 'pin_change', 'pin_reset', 'pin_failure',
      'wallet_funding', 'wallet_transfer', 'bank_transfer',
      'airtime_purchase', 'data_purchase', 'bill_payment',
      'transaction_created', 'transaction_completed', 'transaction_failed',
      'beneficiary_added', 'beneficiary_updated', 'beneficiary_deleted',
      'bank_account_added', 'bank_account_verified', 'bank_account_deleted',
      'security_alert', 'fraud_detection', 'compliance_check',
      'admin_action', 'system_maintenance', 'api_call',
      'whatsapp_message_sent', 'whatsapp_message_received',
      'webhook_received', 'webhook_processed',
      'ai_processing' // New value
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
        if (error.message.includes('already exists') || 
            error.message.includes('duplicate') ||
            error.message.includes('already present')) {
          logger.info(`ℹ️ Enum value ${value} already exists (skipped)`);
        } else {
          logger.error(`❌ Failed to add enum value ${value}:`, { error: error.message });
        }
      }
    }

    logger.info('🎉 ActivityLog activityType enum check completed');
  } catch (error) {
    logger.error('❌ Failed to ensure activityLog activityType enum values', { error: error.message });
    logger.warn('⚠️ Continuing without enum update - manual intervention may be required');
  }
}

if (require.main === module) {
  ensureActivityLogEnumValues()
    .then(() => {
      logger.info('✅ Self-healing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Self-healing failed', error);
      process.exit(1);
    });
}

module.exports = ensureActivityLogEnumValues;


const { sequelize } = require('./src/database/connection');
const logger = require('./src/utils/logger');

async function fixUserProfileColumns() {
  try {
    logger.info('🔧 Starting User Profile Columns Fix...');
    
    // Test database connection
    await sequelize.authenticate();
    logger.info('✅ Database connection established');
    
    // Get database dialect and version info
    const dialect = sequelize.getDialect();
    logger.info(`📊 Database: ${dialect} - ${sequelize.getDatabaseName()}`);
    
    // Check if running on production database
    const isProduction = process.env.NODE_ENV === 'production' || 
                        process.env.DB_HOST?.includes('ondigitalocean.com') ||
                        process.env.DB_CONNECTION_URL?.includes('ondigitalocean.com');
    
    if (isProduction) {
      logger.info('🏭 Production environment detected - using safe migration approach');
    }
    
    // Add fullName column with safe error handling
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE users ADD COLUMN "fullName" VARCHAR(255);
            RAISE NOTICE 'Column fullName added successfully';
          EXCEPTION
            WHEN duplicate_column THEN
              RAISE NOTICE 'Column fullName already exists, skipping';
            WHEN others THEN
              RAISE EXCEPTION 'Failed to add fullName column: %', SQLERRM;
          END;
        END $$;
      `);
      logger.info('✅ fullName column processed successfully');
    } catch (error) {
      logger.warn('⚠️ fullName column operation warning:', error.message);
    }
    
    // Add profilePicture column with safe error handling
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE users ADD COLUMN "profilePicture" VARCHAR(255);
            RAISE NOTICE 'Column profilePicture added successfully';
          EXCEPTION
            WHEN duplicate_column THEN
              RAISE NOTICE 'Column profilePicture already exists, skipping';
            WHEN others THEN
              RAISE EXCEPTION 'Failed to add profilePicture column: %', SQLERRM;
          END;
        END $$;
      `);
      logger.info('✅ profilePicture column processed successfully');
    } catch (error) {
      logger.warn('⚠️ profilePicture column operation warning:', error.message);
    }
    
    // Add lastWelcomedAt column with safe error handling
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE users ADD COLUMN "lastWelcomedAt" TIMESTAMP WITH TIME ZONE;
            RAISE NOTICE 'Column lastWelcomedAt added successfully';
          EXCEPTION
            WHEN duplicate_column THEN
              RAISE NOTICE 'Column lastWelcomedAt already exists, skipping';
            WHEN others THEN
              RAISE EXCEPTION 'Failed to add lastWelcomedAt column: %', SQLERRM;
          END;
        END $$;
      `);
      logger.info('✅ lastWelcomedAt column processed successfully');
    } catch (error) {
      logger.warn('⚠️ lastWelcomedAt column operation warning:', error.message);
    }
    
    // Add column comments for documentation
    try {
      await sequelize.query(`
        COMMENT ON COLUMN users."fullName" IS 'Full name from WhatsApp profile for personalized welcome messages';
      `);
      await sequelize.query(`
        COMMENT ON COLUMN users."profilePicture" IS 'WhatsApp profile picture URL';
      `);
      await sequelize.query(`
        COMMENT ON COLUMN users."lastWelcomedAt" IS 'Last time user received welcome message to avoid spam';
      `);
      logger.info('✅ Column comments added successfully');
    } catch (error) {
      logger.warn('⚠️ Column comments warning (non-critical):', error.message);
    }
    
    // Verify columns exist by querying table structure
    try {
      const [tableInfo] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('fullName', 'profilePicture', 'lastWelcomedAt')
        ORDER BY column_name;
      `);
      
      logger.info('📋 User profile columns status:');
      if (tableInfo.length > 0) {
        tableInfo.forEach(col => {
          logger.info(`  ✅ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
      } else {
        logger.warn('⚠️ No user profile columns found in verification query');
      }
    } catch (error) {
      logger.warn('⚠️ Column verification failed (non-critical):', error.message);
    }
    
    // Test the columns by trying to select them
    try {
      const [testResult] = await sequelize.query(`
        SELECT "fullName", "profilePicture", "lastWelcomedAt" 
        FROM users 
        LIMIT 1;
      `);
      logger.info('✅ Column access test passed - all profile columns are accessible');
    } catch (error) {
      logger.error('❌ Column access test failed:', error.message);
      throw new Error('User profile columns are not accessible after migration');
    }
    
    logger.info('🎉 User Profile Columns Fix completed successfully!');
    logger.info('📝 What was fixed:');
    logger.info('   - Added fullName column for WhatsApp profile names');
    logger.info('   - Added profilePicture column for profile images');
    logger.info('   - Added lastWelcomedAt column to prevent welcome spam');
    logger.info('   - All columns are now ready for personalized welcome messages');
    
    return {
      success: true,
      message: 'User profile columns added successfully',
      columns: ['fullName', 'profilePicture', 'lastWelcomedAt']
    };
    
  } catch (error) {
    logger.error('❌ User Profile Columns Fix failed:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Enhanced welcome message generation function
function generatePersonalizedWelcome(user) {
  const userName = user.fullName || user.firstName || 'there';
  const isReturningUser = user.onboardingStep === 'completed';
  
  if (isReturningUser) {
    const welcomeVariations = [
      `🌟 *Welcome back, ${userName}!* 🌟\n\nGreat to see you again! I'm Xara, your AI assistant.`,
      `🎉 *Hey ${userName}, you're back!* 🎉\n\nReady to continue your financial journey?`,
      `✨ *${userName}, welcome back!* ✨\n\nWhat can I help you with today?`
    ];
    return welcomeVariations[Math.floor(Math.random() * welcomeVariations.length)];
  } else {
    const onboardingVariations = [
      `👋 *Hey ${userName}!* 👋\n\nI'm Xara, your Personal Account Manager AI! Ready to get started?`,
      `🌟 *Hi there, ${userName}!* 🌟\n\nWelcome to MiiMii! Let's set up your account.`,
      `🚀 *Welcome ${userName}!* 🚀\n\nLet's complete your onboarding journey together!`
    ];
    return onboardingVariations[Math.floor(Math.random() * onboardingVariations.length)];
  }
}

// Run if this file is executed directly
if (require.main === module) {
  fixUserProfileColumns()
    .then(result => {
      logger.info('Migration completed:', result);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = { 
  fixUserProfileColumns,
  generatePersonalizedWelcome
};
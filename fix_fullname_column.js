const { sequelize } = require('./src/database/connection');
const logger = require('./src/utils/logger');

async function addMissingColumns() {
  try {
    logger.info('🔧 Starting production fix for missing User table columns...');
    
    // Test connection first
    await sequelize.authenticate();
    logger.info('✅ Database connection established successfully');
    logger.info(`📊 Database dialect: ${sequelize.getDialect()}`);
    
    const dialect = sequelize.getDialect();
    
    // First ensure the users table exists by syncing models
    logger.info('🔄 Ensuring database tables exist...');
    const User = require('./src/models/User');
    
    try {
      // Try to sync without altering first to see if table exists
      await User.sync({ force: false });
      logger.info('✅ User table exists or created successfully');
    } catch (syncError) {
      logger.warn('User table sync failed, will try with alter:', syncError.message);
      // If sync fails, try with alter
      await User.sync({ alter: true });
      logger.info('✅ User table synced with alter');
    }
    
    // Check if fullName and profilePicture columns exist (dialect-specific query)
    let fullNameExists = false;
    let profilePictureExists = false;
    
    if (dialect === 'postgres') {
      // PostgreSQL query
      const [fullNameResult] = await sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'fullName'
        AND table_schema = current_schema();
      `);
      fullNameExists = fullNameResult.length > 0;
      
      const [profilePictureResult] = await sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'profilePicture'
        AND table_schema = current_schema();
      `);
      profilePictureExists = profilePictureResult.length > 0;
    } else if (dialect === 'sqlite') {
      // SQLite query
      try {
        const [columns] = await sequelize.query(`PRAGMA table_info(users);`);
        fullNameExists = columns.some(col => col.name === 'fullName');
        profilePictureExists = columns.some(col => col.name === 'profilePicture');
        
        logger.info(`🔍 SQLite columns found: ${columns.map(c => c.name).join(', ')}`);
      } catch (error) {
        logger.warn('Could not get table info, assuming columns do not exist:', error.message);
        fullNameExists = false;
        profilePictureExists = false;
      }
    }
    
    // Add fullName column if it doesn't exist
    if (!fullNameExists) {
      logger.info('➕ Adding fullName column to users table...');
      
      try {
        if (dialect === 'postgres') {
          await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN "fullName" VARCHAR(255) NULL;
          `);
          
          await sequelize.query(`
            COMMENT ON COLUMN users."fullName" IS 'Full name from WhatsApp profile';
          `);
        } else if (dialect === 'sqlite') {
          await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN fullName TEXT;
          `);
        }
        
        logger.info('✅ fullName column added successfully');
      } catch (addError) {
        if (addError.message.includes('already exists') || addError.message.includes('duplicate column')) {
          logger.info('ℹ️ fullName column already exists (detected during add attempt)');
        } else {
          throw addError;
        }
      }
    } else {
      logger.info('ℹ️ fullName column already exists in users table');
    }
    
    // Add profilePicture column if it doesn't exist
    if (!profilePictureExists) {
      logger.info('➕ Adding profilePicture column to users table...');
      
      try {
        if (dialect === 'postgres') {
          await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN "profilePicture" VARCHAR(512) NULL;
          `);
          
          await sequelize.query(`
            COMMENT ON COLUMN users."profilePicture" IS 'WhatsApp profile picture URL';
          `);
        } else if (dialect === 'sqlite') {
          await sequelize.query(`
            ALTER TABLE users 
            ADD COLUMN profilePicture TEXT;
          `);
        }
        
        logger.info('✅ profilePicture column added successfully');
      } catch (addError) {
        if (addError.message.includes('already exists') || addError.message.includes('duplicate column')) {
          logger.info('ℹ️ profilePicture column already exists (detected during add attempt)');
        } else {
          throw addError;
        }
      }
    } else {
      logger.info('ℹ️ profilePicture column already exists in users table');
    }
    
    // Final sync to ensure everything is properly aligned
    logger.info('🔄 Final model sync to ensure schema alignment...');
    await User.sync({ alter: true });
    logger.info('✅ Final sync completed');
    
    // Verify all critical columns exist (dialect-specific)
    if (dialect === 'postgres') {
      const [columnCheck] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('fullName', 'profilePicture', 'lastWelcomedAt')
        AND table_schema = current_schema()
        ORDER BY column_name;
      `);
      
      logger.info('📋 Current column status:');
      columnCheck.forEach(col => {
        logger.info(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else if (dialect === 'sqlite') {
      try {
        const [columns] = await sequelize.query(`PRAGMA table_info(users);`);
        const targetColumns = columns.filter(col => 
          ['fullName', 'profilePicture', 'lastWelcomedAt'].includes(col.name)
        );
        
        logger.info('📋 Current column status:');
        targetColumns.forEach(col => {
          logger.info(`   ${col.name}: ${col.type} (nullable: ${col.notnull === 0})`);
        });
      } catch (error) {
        logger.warn('Could not check final column status:', error.message);
      }
    }
    
    // Test a simple User query to ensure everything works
    logger.info('🧪 Testing User model query...');
    
    try {
      const testUser = await User.findOne({
        limit: 1,
        attributes: ['id', 'whatsappNumber', 'fullName', 'profilePicture', 'lastWelcomedAt']
      });
      
      if (testUser) {
        logger.info('✅ User model query successful - columns accessible');
        logger.info(`   Test user ID: ${testUser.id}`);
      } else {
        logger.info('ℹ️ No users in database yet, but query structure is valid');
      }
    } catch (queryError) {
      logger.error('❌ User model query failed:', queryError.message);
      throw queryError;
    }
    
    logger.info('🎉 Column addition completed successfully!');
    
    return true;
  } catch (error) {
    logger.error('❌ Failed to add missing columns:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  addMissingColumns()
    .then(() => {
      logger.info('✅ Database fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Database fix failed:', error);
      process.exit(1);
    });
}

module.exports = { addMissingColumns };
const { User } = require('./src/models');
const { Op } = require('sequelize');
const logger = require('./src/utils/logger');

async function migratePhoneNumbers() {
  try {
    console.log('🔍 Checking for users with old phone number format...');
    
    // Find users with old phone number format (starting with 0)
    const oldFormatUsers = await User.findAll({
      where: {
        whatsappNumber: {
          [Op.like]: '0%'
        }
      },
      attributes: ['id', 'whatsappNumber']
    });
    
    console.log(`📊 Found ${oldFormatUsers.length} users with old phone format`);
    
    if (oldFormatUsers.length === 0) {
      console.log('✅ No migration needed - all users already have correct format');
      return;
    }
    
    console.log('📋 Users to migrate:');
    const updates = [];
    
    for (const user of oldFormatUsers) {
      const oldNumber = user.whatsappNumber;
      const newNumber = `+234${oldNumber.slice(1)}`;
      console.log(`  ${oldNumber} -> ${newNumber}`);
      
      updates.push({
        id: user.id,
        oldNumber,
        newNumber
      });
    }
    
    console.log('\n🚀 Starting migration...');
    
    // Update each user
    for (const update of updates) {
      try {
        await User.update(
          { whatsappNumber: update.newNumber },
          { where: { id: update.id } }
        );
        console.log(`✅ Updated user ${update.id}: ${update.oldNumber} -> ${update.newNumber}`);
      } catch (error) {
        console.error(`❌ Failed to update user ${update.id}:`, error.message);
      }
    }
    
    console.log('\n🎉 Migration completed!');
    
    // Verify the migration
    const remainingOldFormat = await User.count({
      where: {
        whatsappNumber: {
          [Op.like]: '0%'
        }
      }
    });
    
    console.log(`📊 Remaining users with old format: ${remainingOldFormat}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migratePhoneNumbers()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { migratePhoneNumbers };
// Load environment variables
require('dotenv').config();

const { User } = require('./src/models');
const logger = require('./src/utils/logger');

async function resetDatabaseLoginSession() {
  try {
    // User ID to reset (from your data)
    const userId = '6ea5e938-68d4-4ae5-92f5-1fe5a46fa15e';

    // Find the user
    const user = await User.findByPk(userId);
    
    if (!user) {
      console.log('❌ User not found with ID:', userId);
      return;
    }

    logger.info('Current conversation state:', {
      userId,
      currentState: user.conversationState
    });

    // Reset conversation state to remove any login_pin or login_flow context
    await user.update({
      conversationState: null
    });

    logger.info('Database update completed');

    // Verify the reset
    await user.reload();
    
    logger.info('Verification after reset:', {
      userId,
      conversationState: user.conversationState
    });

    if (!user.conversationState) {
      console.log('✅ Database login session successfully reset!');
      console.log('📱 Now send any message to trigger the WhatsApp Flow login.');
      console.log('🔐 You should receive the login flow with ID: 3207800556061779');
      console.log('👤 User ID:', userId);
      console.log('📞 Phone:', user.whatsappNumber);
    } else {
      console.log('❌ Failed to reset database session');
    }

  } catch (error) {
    logger.error('Error resetting database login session:', error);
    console.error('❌ Error:', error.message);
  } finally {
    // Close database connection
    const sequelize = User.sequelize;
    if (sequelize) {
      await sequelize.close();
      logger.info('Database connection closed');
    }
  }
}

// Run the reset
resetDatabaseLoginSession();

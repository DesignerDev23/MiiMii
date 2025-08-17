const redis = require('redis');
const logger = require('./src/utils/logger');

// Redis configuration
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const client = redis.createClient({
  url: redisUrl,
  socket: {
    rejectUnauthorized: false
  }
});

async function resetLoginSession() {
  try {
    await client.connect();
    logger.info('Connected to Redis');

    // User ID to reset (from your data)
    const userId = '6ea5e938-68d4-4ae5-92f5-1fe5a46fa15e';
    const sessionKey = `auth:${userId}`;

    // Check if session exists
    const existingSession = await client.get(sessionKey);
    logger.info('Current session status:', {
      userId,
      sessionKey,
      hasSession: !!existingSession,
      sessionData: existingSession
    });

    // Delete the session
    const deleted = await client.del(sessionKey);
    logger.info('Session deletion result:', {
      userId,
      sessionKey,
      deleted,
      success: deleted > 0
    });

    // Also clear any conversation state that might be waiting for login
    const conversationKey = `conversation:${userId}`;
    const conversationDeleted = await client.del(conversationKey);
    logger.info('Conversation state deletion result:', {
      userId,
      conversationKey,
      deleted: conversationDeleted,
      success: conversationDeleted > 0
    });

    // Verify session is gone
    const verifySession = await client.get(sessionKey);
    logger.info('Verification after deletion:', {
      userId,
      sessionKey,
      hasSession: !!verifySession,
      sessionData: verifySession
    });

    if (!verifySession) {
      console.log('✅ Login session successfully reset!');
      console.log('📱 Now send any message to trigger the WhatsApp Flow login.');
      console.log('🔐 You should receive the login flow with ID: 3207800556061779');
    } else {
      console.log('❌ Failed to reset session');
    }

  } catch (error) {
    logger.error('Error resetting login session:', error);
    console.error('❌ Error:', error.message);
  } finally {
    await client.quit();
    logger.info('Disconnected from Redis');
  }
}

// Run the reset
resetLoginSession();

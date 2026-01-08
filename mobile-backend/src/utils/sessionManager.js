const logger = require('./logger');
const redisClient = require('./redis');

/**
 * Session Manager for Redis - Ensures feature isolation
 * Each feature gets its own namespace to prevent interference
 */
class SessionManager {
  constructor() {
    this.featureNamespaces = {
      onboarding: 'onboarding',
      transfer: 'transfer',
      data_purchase: 'data_purchase',
      airtime: 'airtime',
      bills: 'bills',
      login: 'login',
      pin_management: 'pin_management',
      wallet: 'wallet',
      virtual_card: 'virtual_card'
    };
  }

  /**
   * Generate a feature-specific session key
   * @param {string} feature - The feature name
   * @param {string} identifier - The session identifier (userId, phoneNumber, etc.)
   * @param {string} subType - Optional subtype for more granular isolation
   * @returns {string} - The session key
   */
  generateSessionKey(feature, identifier, subType = null) {
    const namespace = this.featureNamespaces[feature] || 'default';
    const baseKey = `${namespace}:${identifier}`;
    return subType ? `${baseKey}:${subType}` : baseKey;
  }

  /**
   * Store session data with feature isolation
   * @param {string} feature - The feature name
   * @param {string} identifier - The session identifier
   * @param {Object} data - The session data
   * @param {number} ttl - Time to live in seconds (default 1800 = 30 minutes)
   * @param {string} subType - Optional subtype for more granular isolation
   * @returns {Promise<boolean>} - Success status
   */
  async setSession(feature, identifier, data, ttl = 1800, subType = null) {
    try {
      const sessionKey = this.generateSessionKey(feature, identifier, subType);
      const sessionData = {
        ...data,
        feature: feature,
        namespace: this.featureNamespaces[feature],
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      };
      
      const success = await redisClient.setSession(sessionKey, sessionData, ttl);
      
      if (success) {
        logger.info('Session stored with feature isolation', {
          feature,
          sessionKey,
          identifier,
          subType,
          ttl,
          dataKeys: Object.keys(data)
        });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to store session with feature isolation', {
        feature,
        identifier,
        subType,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Retrieve session data with feature isolation
   * @param {string} feature - The feature name
   * @param {string} identifier - The session identifier
   * @param {string} subType - Optional subtype for more granular isolation
   * @returns {Promise<Object|null>} - The session data or null
   */
  async getSession(feature, identifier, subType = null) {
    try {
      const sessionKey = this.generateSessionKey(feature, identifier, subType);
      const sessionData = await redisClient.getSession(sessionKey);
      
      if (sessionData) {
        // Verify the session belongs to the expected feature
        if (sessionData.feature !== feature) {
          logger.warn('Session feature mismatch detected', {
            expectedFeature: feature,
            actualFeature: sessionData.feature,
            sessionKey,
            identifier,
            subType
          });
          return null;
        }
        
        logger.info('Session retrieved with feature isolation', {
          feature,
          sessionKey,
          identifier,
          subType,
          dataKeys: Object.keys(sessionData)
        });
      }
      
      return sessionData;
    } catch (error) {
      logger.error('Failed to retrieve session with feature isolation', {
        feature,
        identifier,
        subType,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Delete session data with feature isolation
   * @param {string} feature - The feature name
   * @param {string} identifier - The session identifier
   * @param {string} subType - Optional subtype for more granular isolation
   * @returns {Promise<boolean>} - Success status
   */
  async deleteSession(feature, identifier, subType = null) {
    try {
      const sessionKey = this.generateSessionKey(feature, identifier, subType);
      const success = await redisClient.deleteSession(sessionKey);
      
      if (success) {
        logger.info('Session deleted with feature isolation', {
          feature,
          sessionKey,
          identifier,
          subType
        });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to delete session with feature isolation', {
        feature,
        identifier,
        subType,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up expired sessions for a specific feature
   * @param {string} feature - The feature name
   * @returns {Promise<number>} - Number of sessions cleaned up
   */
  async cleanupExpiredSessions(feature) {
    try {
      // This would require Redis SCAN operation for production use
      // For now, we rely on Redis TTL
      logger.info('Session cleanup requested', { feature });
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        feature,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get all active sessions for a feature (for debugging)
   * @param {string} feature - The feature name
   * @returns {Promise<Array>} - Array of session keys
   */
  async getActiveSessions(feature) {
    try {
      const namespace = this.featureNamespaces[feature] || 'default';
      // This would require Redis SCAN operation for production use
      logger.info('Active sessions requested', { feature, namespace });
      return [];
    } catch (error) {
      logger.error('Failed to get active sessions', {
        feature,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Validate session data structure
   * @param {Object} sessionData - The session data to validate
   * @param {string} expectedFeature - The expected feature name
   * @returns {boolean} - Validation result
   */
  validateSession(sessionData, expectedFeature) {
    if (!sessionData || typeof sessionData !== 'object') {
      return false;
    }

    if (sessionData.feature !== expectedFeature) {
      logger.warn('Session validation failed - feature mismatch', {
        expectedFeature,
        actualFeature: sessionData.feature
      });
      return false;
    }

    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      logger.warn('Session validation failed - expired', {
        expectedFeature,
        expiresAt: sessionData.expiresAt,
        now: Date.now()
      });
      return false;
    }

    return true;
  }
}

module.exports = new SessionManager();

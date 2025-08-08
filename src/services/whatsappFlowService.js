const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { axiosConfig } = require('../utils/httpsAgent');
const crypto = require('crypto');

/**
 * WhatsApp Flow Service
 * Handles Flow token verification and Flow-related functionality
 */
class WhatsAppFlowService {
  constructor() {
    this.secretKey = process.env.FLOW_SECRET_KEY || 'default-flow-secret-key';
  }

  /**
   * Verify a Flow token
   * @param {string} token - The flow token to verify
   * @returns {Object} - Verification result
   */
  verifyFlowToken(token) {
    try {
      if (!token) {
        return {
          valid: false,
          reason: 'No token provided'
        };
      }

      // For now, we'll implement a simple token verification
      // In production, you might want to use JWT or a more sophisticated approach
      
      // Check if token has the expected format
      if (typeof token !== 'string' || token.length < 10) {
        return {
          valid: false,
          reason: 'Invalid token format'
        };
      }

      // Extract user ID from token (assuming format: user_id.timestamp.signature)
      const parts = token.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          reason: 'Invalid token structure'
        };
      }

      const [userId, timestamp, signature] = parts;

      // Verify signature
      const expectedSignature = this.generateSignature(userId, timestamp);
      if (signature !== expectedSignature) {
        return {
          valid: false,
          reason: 'Invalid signature'
        };
      }

      // Check if token is expired (24 hours)
      const tokenTime = parseInt(timestamp);
      const currentTime = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (currentTime - tokenTime > maxAge) {
        return {
          valid: false,
          reason: 'Token expired'
        };
      }

      return {
        valid: true,
        userId: userId,
        timestamp: tokenTime
      };

    } catch (error) {
      logger.error('Flow token verification failed', { error: error.message });
      return {
        valid: false,
        reason: 'Verification error'
      };
    }
  }

  /**
   * Generate a Flow token for a user
   * @param {string} userId - The user ID
   * @returns {string} - The generated token
   */
  generateFlowToken(userId) {
    try {
      const timestamp = Date.now().toString();
      const signature = this.generateSignature(userId, timestamp);
      
      return `${userId}.${timestamp}.${signature}`;
    } catch (error) {
      logger.error('Flow token generation failed', { error: error.message });
      throw new Error('Failed to generate flow token');
    }
  }

  /**
   * Generate signature for token verification
   * @param {string} userId - The user ID
   * @param {string} timestamp - The timestamp
   * @returns {string} - The signature
   */
  generateSignature(userId, timestamp) {
    const data = `${userId}.${timestamp}`;
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters for shorter signature
  }

  /**
   * Validate Flow request data
   * @param {Object} data - The Flow request data
   * @returns {Object} - Validation result
   */
  validateFlowData(data) {
    try {
      if (!data || typeof data !== 'object') {
        return {
          valid: false,
          error: 'Invalid data format'
        };
      }

      // Add any specific validation rules here
      // For example, check required fields based on screen

      return {
        valid: true
      };

    } catch (error) {
      logger.error('Flow data validation failed', { error: error.message });
      return {
        valid: false,
        error: 'Validation error'
      };
    }
  }

  /**
   * Process Flow screen data
   * @param {string} screen - The screen identifier
   * @param {Object} data - The screen data
   * @returns {Object} - Processing result
   */
  processScreenData(screen, data) {
    try {
      logger.info('Processing Flow screen data', { screen, dataKeys: Object.keys(data || {}) });

      // Add screen-specific processing logic here
      // This can be extended based on your Flow requirements

      return {
        success: true,
        screen: screen,
        data: data
      };

    } catch (error) {
      logger.error('Flow screen processing failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new WhatsAppFlowService(); 
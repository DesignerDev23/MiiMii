const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { axiosConfig } = require('../utils/httpsAgent');
const crypto = require('crypto');
const userService = require('./user');
const whatsappService = require('./whatsapp');

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

      // Check if token is a string
      if (typeof token !== 'string') {
        return {
          valid: false,
          reason: 'Token must be a string'
        };
      }

      // Support our own signed token format: userId.timestamp.signature
      if (token.includes('.')) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const [userId, timestamp, signature] = parts;
          const expectedSignature = this.generateSignature(userId, timestamp);
          if (signature === expectedSignature) {
            return {
              valid: true,
              token,
              source: 'miimii_signed_token',
              userId,
              issuedAt: Number(timestamp)
            };
          }
        }
      }

      // Handle special cases for WhatsApp Flow tokens
      if (token === 'unused' || token === 'placeholder' || token.length < 3) {
        logger.info('WhatsApp Flow placeholder token detected', {
          token: token,
          tokenLength: token.length
        });
        
        return {
          valid: true,
          token: token,
          source: 'whatsapp_flow_placeholder'
        };
      }

      // Handle real WhatsApp Flow tokens (format: flows-builder-xxxxxxxx)
      if (token.startsWith('flows-builder-')) {
        logger.info('Real WhatsApp Flow token detected', {
          token: token,
          tokenLength: token.length,
          flowId: token.replace('flows-builder-', '')
        });
        
        return {
          valid: true,
          token: token,
          source: 'whatsapp_flow_real',
          flowId: token.replace('flows-builder-', '')
        };
      }

      // For other token formats, accept as valid but without user mapping
      logger.info('WhatsApp Flow token accepted', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, Math.min(10, token.length)) + (token.length > 10 ? '...' : '')
      });

      return {
        valid: true,
        token: token,
        source: 'whatsapp_flow'
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

  /**
   * Handle login flow processing
   * @param {Object} flowData - The flow data containing PIN
   * @param {string} phoneNumber - The user's phone number
   * @returns {Object} - Processing result
   */
  async handleLoginFlow(flowData, phoneNumber) {
    try {
      logger.info('Processing login flow', {
        phoneNumber,
        hasPin: !!flowData.pin,
        dataKeys: Object.keys(flowData || {})
      });

      if (!flowData.pin || !/^\d{4}$/.test(flowData.pin)) {
        await whatsappService.sendTextMessage(phoneNumber, 'Please enter exactly 4 digits for your PIN.');
        return { success: false, error: 'Invalid PIN format', requiresRetry: true };
      }

      const user = await userService.getUserByWhatsappNumber(phoneNumber);
      if (!user) {
        await whatsappService.sendTextMessage(phoneNumber, 'User not found. Please complete onboarding first.');
        return { success: false, error: 'User not found', requiresOnboarding: true };
      }

      try {
        const isValid = await userService.validateUserPin(user.id, flowData.pin);
        
        if (isValid) {
          await whatsappService.sendTextMessage(
            phoneNumber,
            `✅ Login Successful!\n\nWelcome back, ${user.firstName || 'there'}!`
          );

          return { success: true, userId: user.id, message: 'Login successful' };
        }
      } catch (pinError) {
        await whatsappService.sendTextMessage(phoneNumber, pinError.message || 'Invalid PIN. Please try again.');
        return { success: false, error: pinError.message, requiresRetry: true };
      }

    } catch (error) {
      logger.error('Login flow processing failed', { phoneNumber, error: error.message });
      return { success: false, error: 'Login failed. Please try again.', requiresRetry: true };
    }
  }

  async handleOnboardingFlow(flowData, phoneNumber) {
    try {
      logger.info('Processing onboarding flow', { phoneNumber, dataKeys: Object.keys(flowData || {}) });
      const onboardingService = require('./onboarding');
      const result = await onboardingService.processOnboardingFlowData(flowData, phoneNumber);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Onboarding flow processing failed', { phoneNumber, error: error.message });
      return { success: false, error: 'Onboarding failed. Please try again.', requiresRetry: true };
    }
  }

  async processFlowData(flowData, phoneNumber) {
    try {
      logger.info('Processing flow data', { phoneNumber, dataKeys: Object.keys(flowData || {}), hasPin: !!flowData.pin });

      if (flowData.pin && Object.keys(flowData).length === 1) {
        return await this.handleLoginFlow(flowData, phoneNumber);
      } else {
        return await this.handleOnboardingFlow(flowData, phoneNumber);
      }

    } catch (error) {
      logger.error('Flow data processing failed', { phoneNumber, error: error.message });
      return { success: false, error: 'Flow processing failed. Please try again.', requiresRetry: true };
    }
  }

  async sendFlowMessage(phoneNumber, flowData) {
    try {
      const whatsappConfig = config.getWhatsappConfig();
      
      const messageData = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'flow',
          flow: {
            flow_token: flowData.flowToken,
            flow_id: flowData.flowId,
            flow_cta: flowData.flowCta,
            flow_action_payload: flowData.flowActionPayload || {}
          }
        }
      };

      if (flowData.header) {
        messageData.interactive.header = flowData.header;
      }
      if (flowData.body) {
        messageData.interactive.body = { text: flowData.body };
      }
      if (flowData.footer) {
        messageData.interactive.footer = { text: flowData.footer };
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`,
        messageData,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${whatsappConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Flow message sent successfully', {
        phoneNumber,
        messageId: response.data.messages?.[0]?.id
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to send Flow message', { phoneNumber, error: error.message, response: error.response?.data });
      throw error;
    }
  }
}

module.exports = new WhatsAppFlowService(); 
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

      // Support our own signed token format: userId.timestamp.default.signature
      if (token.includes('.')) {
        const parts = token.split('.');
        if (parts.length === 4) {
          const [userId, timestamp, defaultPart, signature] = parts;
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
        } else if (parts.length === 3) {
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
   * @param {string} flowType - The type of flow (optional)
   * @returns {string} - The generated token
   */
  generateFlowToken(userId, flowType = 'default') {
    try {
      const timestamp = Date.now().toString();
      const signature = this.generateSignature(userId, timestamp, flowType);
      
      return `${userId}.${timestamp}.${flowType}.${signature}`;
    } catch (error) {
      logger.error('Flow token generation failed', { error: error.message });
      throw new Error('Failed to generate flow token');
    }
  }

  /**
   * Generate signature for token verification
   * @param {string} userId - The user ID
   * @param {string} timestamp - The timestamp
   * @param {string} flowType - The type of flow (optional)
   * @returns {string} - The signature
   */
  generateSignature(userId, timestamp, flowType = 'default') {
    const data = `${userId}.${timestamp}.${flowType}`;
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

      // Check PIN status first - if disabled, skip PIN validation entirely
      const pinStatus = await userService.getPinStatus(user.id);
      
      if (pinStatus.pinEnabled) {
        // PIN is enabled - validate user PIN
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
      } else {
        // PIN is disabled - allow login without PIN validation
        logger.info('PIN validation skipped - PIN is disabled for login flow', { userId: user.id });
        await whatsappService.sendTextMessage(
          phoneNumber,
          `✅ Login Successful!\n\nWelcome back, ${user.firstName || 'there'}! (PIN disabled)`
        );

        return { success: true, userId: user.id, message: 'Login successful' };
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

      // If PIN was set as part of completion, create wallet VA if missing
      if (result?.success && result?.userId) {
        try {
          const walletService = require('./wallet');
          const whatsappService = require('./whatsapp');
          
          const wallet = await walletService.getUserWallet(result.userId);
          if (!wallet.virtualAccountNumber) {
            logger.info('Creating virtual account for new user', { userId: result.userId });
            
            try {
              await walletService.createVirtualAccountForWallet(result.userId);
              logger.info('Virtual account created successfully during onboarding', { userId: result.userId });
            } catch (vaError) {
              // Handle BellBank API errors specifically
              if (vaError.name === 'BellBankAPIError' || vaError.isRetryable) {
                logger.warn('BellBank API temporarily unavailable during onboarding', { 
                  userId: result.userId, 
                  error: vaError.message 
                });
                
                // Send user a message about the temporary issue
                try {
                  const user = await require('../models').User.findByPk(result.userId);
                  if (user) {
                    const fallbackMessage = `🎉 Welcome to MiiMii! Your account has been created successfully.\n\n` +
                      `⚠️ We're experiencing temporary issues with our banking partner. Your virtual account will be created automatically once the service is restored.\n\n` +
                      `You can still use all other features of MiiMii. We'll notify you once your virtual account is ready.\n\n` +
                      `Thank you for your patience! 🙏`;
                    
                    await whatsappService.sendTextMessage(user.whatsappNumber, fallbackMessage);
                    
                    logger.info('Sent fallback message for BellBank API issue', { userId: result.userId });
                  }
                } catch (messageError) {
                  logger.error('Failed to send fallback message for BellBank API issue', { 
                    userId: result.userId, 
                    error: messageError.message 
                  });
                }
              } else {
                // For non-retryable errors, log but don't block onboarding
                logger.warn('Non-retryable virtual account creation error during onboarding', { 
                  userId: result.userId, 
                  error: vaError.message,
                  errorType: vaError.name || 'Unknown'
                });
              }
            }
          } else {
            logger.info('Virtual account already exists for user', { userId: result.userId });
          }
        } catch (vaErr) {
          logger.warn('Optional virtual account creation post-onboarding failed', { 
            error: vaErr.message,
            userId: result.userId 
          });
        }
      }

      return { success: true, ...result };
    } catch (error) {
      logger.error('Onboarding flow processing failed', { phoneNumber, error: error.message });
      return { success: false, error: 'Onboarding failed. Please try again.', requiresRetry: true };
    }
  }

  /**
   * Get data plan price from plan ID with admin-set pricing
   * @param {string} planId - The data plan ID
   * @param {string} network - The network name
   * @returns {Promise<number>} - The price in Naira
   */
  async getDataPlanPrice(planId, network = null) {
    try {
      // If we have a network, use the data service to get admin-set prices
      if (network) {
        const dataService = require('./data');
        const plans = await dataService.getDataPlans(network);
        
        // If planId is numeric, find the plan
        if (/^\d+$/.test(planId)) {
          const numericId = parseInt(planId);
          const plan = plans.find(p => p.id === numericId);
          if (plan) {
            return plan.price; // This will be the admin-set selling price
          }
        } else {
          // If planId is a title, find it
          const plan = plans.find(p => p.title === planId);
          if (plan) {
            return plan.price; // This will be the admin-set selling price
          }
        }
      }
      
      // Fallback to raw DATA_PLANS if network not provided or plan not found
      const { DATA_PLANS } = require('../routes/flowEndpoint');
      
      if (/^\d+$/.test(planId)) {
        const numericId = parseInt(planId);
        for (const networkPlans of Object.values(DATA_PLANS)) {
          const plan = networkPlans.find(p => p.id === numericId);
          if (plan) {
            return plan.price;
          }
        }
      } else {
        // If planId is a title, find it in DATA_PLANS
        for (const networkPlans of Object.values(DATA_PLANS)) {
          const plan = networkPlans.find(p => p.title === planId);
          if (plan) {
            return plan.price;
          }
        }
      }
      
      logger.warn('Plan not found, using default price', { planId, network });
      return 1000; // Default fallback
    } catch (error) {
      logger.error('Failed to get data plan price', { error: error.message, planId, network });
      return 1000; // Default fallback
    }
  }

  /**
   * Handle data purchase flow completion
   * @param {Object} flowData - The flow data containing network, phoneNumber, dataPlan, and PIN
   * @param {string} phoneNumber - The user's phone number
   * @returns {Object} - Processing result
   */
  async handleDataPurchaseFlow(flowData, phoneNumber) {
    try {
      logger.info('Processing data purchase flow', { 
        phoneNumber, 
        network: flowData.network,
        phoneNumber: flowData.phoneNumber,
        dataPlan: flowData.dataPlan,
        hasPin: !!flowData.pin
      });

      const user = await userService.getUserByWhatsappNumber(phoneNumber);
      if (!user) {
        logger.error('User not found for data purchase flow', { phoneNumber });
        return { success: false, error: 'User not found. Please complete onboarding first.' };
      }

      // Validate PIN format
      const pin = flowData.pin;
      if (!pin || !/^\d{4}$/.test(pin)) {
        logger.error('Invalid PIN format in data purchase flow', { phoneNumber, pinLength: pin?.length });
        return { success: false, error: 'Invalid PIN format. Please enter exactly 4 digits.' };
      }

      // Check PIN status first - if disabled, skip PIN validation entirely
      const pinStatus = await userService.getPinStatus(user.id);
      
      if (pinStatus.pinEnabled) {
        // PIN is enabled - validate user PIN
        try {
          await userService.validateUserPin(user.id, pin);
        } catch (error) {
          logger.error('PIN validation failed in data purchase flow', { userId: user.id, phoneNumber, error: error.message });
          return { success: false, error: 'Invalid PIN. Please try again.' };
        }
      } else {
        // PIN is disabled - skip PIN validation
        logger.info('PIN validation skipped - PIN is disabled for data purchase flow', { userId: user.id });
      }

      // Process the data purchase
      const bilalService = require('./bilal');
      
      // Get the correct Bilal plan ID according to official documentation
      const { getBilalOfficialPlanId } = require('../routes/flowEndpoint');
      const bilalPlanId = await getBilalOfficialPlanId(flowData.dataPlan, flowData.network);
      
      const dataPurchaseData = {
        phoneNumber: flowData.phoneNumber,
        network: flowData.network,
        dataPlan: { id: bilalPlanId, price: await this.getDataPlanPrice(flowData.dataPlan, flowData.network) },
        pin: pin
      };

      logger.info('Processing data purchase via flow', {
        userId: user.id,
        dataPurchaseData,
        originalPlanId: flowData.dataPlan,
        bilalPlanId: bilalPlanId,
        planPrice: await this.getDataPlanPrice(flowData.dataPlan, flowData.network)
      });

      logger.info('About to call bilalService.purchaseData with:', {
        hasUser: !!user,
        hasDataPurchaseData: !!dataPurchaseData,
        dataPurchaseDataType: typeof dataPurchaseData,
        dataPurchaseDataKeys: Object.keys(dataPurchaseData),
        phoneNumber
      });

      const result = await bilalService.purchaseData(user, dataPurchaseData, phoneNumber);
      
      if (result.success) {
        logger.info('Data purchase successful via flow', {
          userId: user.id,
          network: flowData.network,
          phoneNumber: flowData.phoneNumber,
          dataPlan: flowData.dataPlan,
          reference: result.data?.['request-id']
        });
        
        // Send success message
        const successMessage = `✅ *Data Purchase Successful!*\n\n` +
                              `📱 Network: ${flowData.network}\n` +
                              `📞 Phone: ${flowData.phoneNumber}\n` +
                              `📦 Plan: ${flowData.dataPlan}\n` +
                              `💰 Amount: ₦${(await this.getDataPlanPrice(flowData.dataPlan, flowData.network)).toLocaleString()}\n` +
                              `📋 Reference: ${result.data?.['request-id']}\n` +
                              `📅 Date: ${new Date().toLocaleString('en-GB')}\n\n` +
                              `Your data has been purchased successfully! 🎉`;
        
        await whatsappService.sendTextMessage(phoneNumber, successMessage);
        
        return { success: true, userId: user.id };
      } else {
        logger.error('Data purchase failed via flow', {
          userId: user.id,
          error: result.message,
          dataPurchaseData
        });
        
        // Send error message
        const errorMessage = `❌ Data purchase failed: ${result.message || 'Unknown error'}\n\nPlease try again or contact support.`;
        await whatsappService.sendTextMessage(phoneNumber, errorMessage);
        
        return { success: false, error: result.message || 'Data purchase failed' };
      }

    } catch (error) {
      logger.error('Data purchase flow processing failed', { phoneNumber, error: error.message });
      
      // Send error message
      const errorMessage = `❌ Data purchase processing failed. Please try again or contact support.`;
      await whatsappService.sendTextMessage(phoneNumber, errorMessage);
      
      return { success: false, error: 'Data purchase failed. Please try again.' };
    }
  }

  async processFlowData(flowData, phoneNumber) {
    try {
      logger.info('Processing flow data', { phoneNumber, dataKeys: Object.keys(flowData || {}), hasPin: !!flowData.pin });

      // Check if this is a transfer PIN flow completion (has pin and flow_token)
      if (flowData.pin && flowData.flow_token) {
        logger.info('Detected flow completion with PIN - checking session data', { 
          phoneNumber, 
          hasPin: !!flowData.pin,
          hasFlowToken: !!flowData.flow_token
        });
        
        // Retrieve session data to determine the flow type
        const redisClient = require('../utils/redis');
        const sessionKey = flowData.flow_token; // Use the same format as storage
        const sessionData = await redisClient.getSession(sessionKey);
        
        // Also try to extract flow type from the token itself
        let flowTypeFromToken = null;
        try {
          const tokenParts = flowData.flow_token.split('.');
          if (tokenParts.length >= 3) {
            flowTypeFromToken = tokenParts[2]; // Third part should be the flow type
          }
        } catch (error) {
          logger.warn('Failed to extract flow type from token', { error: error.message, token: flowData.flow_token });
        }
        
        if (sessionData) {
          logger.info('Retrieved session data', {
            phoneNumber,
            sessionDataKeys: Object.keys(sessionData),
            context: sessionData.context
          });
          
          // Check if this is a transfer PIN flow
          if (sessionData.context === 'transfer_pin_verification' || sessionData.transferData) {
            logger.info('Detected transfer PIN flow completion', {
              phoneNumber,
              context: sessionData.context,
              hasTransferData: !!sessionData.transferData
            });
            
            // Transfer PIN flows are handled in messageProcessor.js
            return { success: true, flowType: 'transfer_pin' };
          }
          
          // Check if this is a data purchase flow
          if (sessionData.network && sessionData.phoneNumber && sessionData.dataPlan) {
            logger.info('Retrieved data purchase session data', {
              phoneNumber,
              network: sessionData.network,
              phoneNumber: sessionData.phoneNumber,
              dataPlan: sessionData.dataPlan
            });
            
            // Combine session data with PIN from flow response
            const completeFlowData = {
              ...sessionData,
              pin: flowData.pin
            };
            
            const result = await this.handleDataPurchaseFlow(completeFlowData, phoneNumber);
            return { ...result, flowType: 'data_purchase' };
          }
          
          // Check if this is a PIN disable/enable flow
          if (sessionData.context === 'disable_pin_verification') {
            logger.info('Detected PIN disable flow completion', {
              phoneNumber,
              context: sessionData.context
            });
            
            return { success: true, flowType: 'disable_pin_verification' };
          }
          
          if (sessionData.context === 'enable_pin_verification') {
            logger.info('Detected PIN enable flow completion', {
              phoneNumber,
              context: sessionData.context
            });
            
            return { success: true, flowType: 'enable_pin_verification' };
          }
          
          // Check if this is an airtime, bills, or data PIN flow
          if (sessionData.service && (sessionData.service === 'airtime' || sessionData.service === 'bills' || sessionData.service === 'data')) {
            logger.info('Retrieved airtime/bills/data session data', {
              phoneNumber,
              service: sessionData.service,
              sessionDataKeys: Object.keys(sessionData)
            });
            
            // Airtime, bills, and data flows are handled in the flow endpoint
            // We just need to return success here as the actual processing happens in flowEndpoint.js
            return { success: true, flowType: `${sessionData.service}_pin` };
          }
        }
        
        // If no session data found, try to determine flow type from token
        if (flowTypeFromToken) {
          logger.info('Using flow type from token as fallback', {
            phoneNumber,
            flowTypeFromToken,
            sessionKey,
            hasSessionData: !!sessionData
          });
          
          // Handle PIN disable/enable flows based on token
          if (flowTypeFromToken === 'disable_pin_verification') {
            return { success: true, flowType: 'disable_pin_verification' };
          }
          
          if (flowTypeFromToken === 'enable_pin_verification') {
            return { success: true, flowType: 'enable_pin_verification' };
          }
          
          // For other flow types, return the type from token
          return { success: true, flowType: flowTypeFromToken };
        }
        
        // If no session data found, check if this might be a data purchase flow that was processed in the background
        // Data purchase flows are processed during the flow itself and don't need session data retrieval
        logger.info('No session data found - checking if this is a data purchase flow processed in background', {
          phoneNumber,
          sessionKey,
          hasSessionData: !!sessionData,
          sessionDataKeys: sessionData ? Object.keys(sessionData) : []
        });
        
        // For data purchase flows, the processing happens during the flow, so we just return success
        // The actual purchase processing is handled in the flow endpoint
        return { success: true, flowType: 'data_purchase' };
      }

      // Check if this is a data purchase flow (has network, phoneNumber, dataPlan, and pin)
      if (flowData.network && flowData.phoneNumber && flowData.dataPlan && flowData.pin) {
        logger.info('Detected data purchase flow', { 
          phoneNumber, 
          network: flowData.network,
          phoneNumber: flowData.phoneNumber,
          dataPlan: flowData.dataPlan
        });
        const result = await this.handleDataPurchaseFlow(flowData, phoneNumber);
        return { ...result, flowType: 'data_purchase' };
      }
      
      // Check if this is a login flow (has PIN and possibly other fields)
      if (flowData.pin) {
        logger.info('Detected login flow', { 
          phoneNumber, 
          hasPin: !!flowData.pin,
          dataKeys: Object.keys(flowData)
        });
        const result = await this.handleLoginFlow(flowData, phoneNumber);
        return { ...result, flowType: 'login' };
      }
      
      // Check if this is an onboarding flow (has user registration data)
      if (flowData.firstName || flowData.lastName || flowData.email || flowData.dateOfBirth || flowData.gender) {
        logger.info('Detected onboarding flow', { 
          phoneNumber, 
          dataKeys: Object.keys(flowData)
        });
        const result = await this.handleOnboardingFlow(flowData, phoneNumber);
        return { ...result, flowType: 'onboarding' };
      }
      
      // Check if this is a transfer PIN flow (has PIN and transfer context)
      if (flowData.pin && (flowData.transfer || flowData.accountNumber || flowData.amount)) {
        logger.info('Detected transfer PIN flow', { 
          phoneNumber, 
          hasPin: !!flowData.pin,
          dataKeys: Object.keys(flowData)
        });
        // Transfer PIN flows are handled in messageProcessor.js, so we return success
        return { success: true, flowType: 'transfer_pin' };
      }
      
      // If we can't determine the flow type, log it and default to onboarding
      logger.warn('Unable to determine flow type, defaulting to onboarding', { 
        phoneNumber, 
        dataKeys: Object.keys(flowData || {}),
        flowData
      });
      
      const result = await this.handleOnboardingFlow(flowData, phoneNumber);
      return { ...result, flowType: 'onboarding' };

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
            ...(flowData.flowJson ? { flow_json: flowData.flowJson } : { flow_id: flowData.flowId }),
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
        `https://graph.facebook.com/v23.0/${whatsappConfig.phoneNumberId}/messages`,
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
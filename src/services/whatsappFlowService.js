const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { axiosConfig } = require('../utils/httpsAgent');
const crypto = require('crypto');

class WhatsAppFlowService {
  constructor() {
    const whatsappConfig = config.getWhatsappConfig();
    this.accessToken = whatsappConfig.accessToken;
    this.phoneNumberId = whatsappConfig.phoneNumberId;
    this.baseURL = `https://graph.facebook.com/v18.0/${this.phoneNumberId}`;
    this.wabaId = process.env.BOT_BUSINESS_ACCOUNT_ID;
  }

  /**
   * Create a WhatsApp Flow template for onboarding
   */
  async createOnboardingFlowTemplate() {
    try {
      const flowTemplate = {
        name: "miimii_onboarding_flow",
        language: "en_US",
        category: "MARKETING",
        components: [
          {
            type: "body",
            text: "Welcome to MiiMii! Let's complete your account setup securely."
          },
          {
            type: "BUTTONS",
            buttons: [
              {
                type: "FLOW",
                text: "Complete Onboarding",
                flow_action: "navigate",
                navigate_screen: "WELCOME_SCREEN",
                flow_json: JSON.stringify(this.getOnboardingFlowJson())
              }
            ]
          }
        ]
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${this.wabaId}/message_templates`,
        flowTemplate,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Onboarding Flow template created successfully', {
        templateId: response.data.id,
        templateName: flowTemplate.name
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create onboarding Flow template', {
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Create a WhatsApp Flow template for login with PIN
   */
  async createLoginFlowTemplate() {
    try {
      const flowTemplate = {
        name: "miimii_login_flow",
        language: "en_US",
        category: "MARKETING",
        components: [
          {
            type: "body",
            text: "Welcome back! Please enter your 4-digit PIN to access your account."
          },
          {
            type: "BUTTONS",
            buttons: [
              {
                type: "FLOW",
                text: "Login with PIN",
                flow_action: "navigate",
                navigate_screen: "PIN_INPUT_SCREEN",
                flow_json: JSON.stringify(this.getLoginFlowJson())
              }
            ]
          }
        ]
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${this.wabaId}/message_templates`,
        flowTemplate,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Login Flow template created successfully', {
        templateId: response.data.id,
        templateName: flowTemplate.name
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create login Flow template', {
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Get the onboarding flow JSON structure
   */
  getOnboardingFlowJson() {
    return {
      version: "3.1",
      screens: [
        {
          id: "WELCOME_SCREEN",
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Welcome to MiiMii! 👋"
              },
              {
                type: "TextBody",
                text: "I'm excited to help you manage your finances through WhatsApp! Let's set up your account securely."
              },
              {
                type: "Footer",
                label: "Start Setup",
                "on-click-action": {
                  name: "navigate",
                  payload: {
                    screen: "PERSONAL_DETAILS_SCREEN"
                  }
                }
              }
            ]
          },
          title: "Welcome",
          terminal: false
        },
        {
          id: "PERSONAL_DETAILS_SCREEN",
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Personal Information"
              },
              {
                type: "TextBody",
                text: "Let's start with your basic information."
              },
              {
                type: "FormInput",
                name: "first_name",
                label: "First Name",
                required: true,
                placeholder: "Enter your first name"
              },
              {
                type: "FormInput",
                name: "last_name",
                label: "Last Name",
                required: true,
                placeholder: "Enter your last name"
              },
              {
                type: "FormInput",
                name: "middle_name",
                label: "Middle Name (Optional)",
                required: false,
                placeholder: "Enter your middle name"
              },
              {
                type: "DatePicker",
                name: "date_of_birth",
                label: "Date of Birth",
                required: true
              },
              {
                type: "Dropdown",
                name: "gender",
                label: "Gender",
                required: true,
                options: [
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" }
                ]
              },
              {
                type: "Footer",
                label: "Next",
                "on-click-action": {
                  name: "navigate",
                  payload: {
                    screen: "BVN_SCREEN"
                  }
                }
              }
            ]
          },
          title: "Personal Details",
          terminal: false
        },
        {
          id: "BVN_SCREEN",
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "BVN Verification"
              },
              {
                type: "TextBody",
                text: "Please provide your Bank Verification Number (BVN) for security verification."
              },
              {
                type: "FormInput",
                name: "bvn",
                label: "BVN",
                required: true,
                placeholder: "Enter your 11-digit BVN",
                input_type: "number",
                max_length: 11
              },
              {
                type: "Footer",
                label: "Verify BVN",
                "on-click-action": {
                  name: "navigate",
                  payload: {
                    screen: "PIN_SETUP_SCREEN"
                  }
                }
              }
            ]
          },
          title: "BVN Verification",
          terminal: false
        },
        {
          id: "PIN_SETUP_SCREEN",
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Secure PIN Setup"
              },
              {
                type: "TextBody",
                text: "Create a 4-digit PIN to secure your account. This will be required for all transactions."
              },
              {
                type: "FormInput",
                name: "pin",
                label: "Create PIN",
                required: true,
                input_type: "password",
                max_length: 4,
                placeholder: "••••"
              },
              {
                type: "FormInput",
                name: "confirm_pin",
                label: "Confirm PIN",
                required: true,
                input_type: "password",
                max_length: 4,
                placeholder: "••••"
              },
              {
                type: "Footer",
                label: "Complete Setup",
                "on-click-action": {
                  name: "complete",
                  payload: {}
                }
              }
            ]
          },
          title: "PIN Setup",
          terminal: true,
          success: true
        }
      ]
    };
  }

  /**
   * Get the login flow JSON structure
   */
  getLoginFlowJson() {
    return {
      version: "3.1",
      screens: [
        {
          id: "PIN_INPUT_SCREEN",
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Account Login"
              },
              {
                type: "TextBody",
                text: "Please enter your 4-digit PIN to access your account."
              },
              {
                type: "FormInput",
                name: "pin",
                label: "PIN",
                required: true,
                input_type: "password",
                max_length: 4,
                placeholder: "••••"
              },
              {
                type: "Footer",
                label: "Login",
                "on-click-action": {
                  name: "complete",
                  payload: {}
                }
              }
            ]
          },
          title: "Login",
          terminal: true,
          success: true
        }
      ]
    };
  }

  /**
   * Send a Flow message to a user
   */
  async sendFlowMessage(to, flowData) {
    try {
      const interactive = {
        type: 'flow',
        header: flowData.header,
        body: { text: flowData.body },
        footer: flowData.footer ? { text: flowData.footer } : undefined,
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowData.flowToken,
            flow_id: flowData.flowId,
            flow_cta: flowData.flowCta || 'Start',
            flow_action: 'navigate',
            flow_action_payload: flowData.flowActionPayload || {}
          }
        }
      };

      const payload = {
        messaging_product: 'whatsapp',
        to: this.formatToE164(to),
        type: 'interactive',
        interactive
      };

      const response = await axios.post(
        `${this.baseURL}/messages`,
        payload,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Flow message sent successfully', {
        to,
        flowId: flowData.flowId,
        messageId: response.data.messages[0].id
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send Flow message', {
        error: error.response?.data || error.message,
        to,
        flowData
      });
      throw error;
    }
  }

  /**
   * Generate a secure flow token for a user
   */
  generateFlowToken(userId, step = 'personal_details') {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(16).toString('hex');
    const payload = {
      userId: userId,
      step: step,
      timestamp: timestamp
    };
    
    // Encode payload in the token
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto.createHash('sha256')
      .update(`${encodedPayload}_${randomString}_${process.env.APP_SECRET}`)
      .digest('hex');
    
    return `${encodedPayload}_${randomString}_${signature}`;
  }

  /**
   * Verify a flow token
   */
  verifyFlowToken(token) {
    try {
      const parts = token.split('_');
      if (parts.length !== 3) { // Changed from 4 to 3
        return { valid: false, reason: 'Invalid token format' };
      }

      const [encodedPayload, randomString, signature] = parts;
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString());

      const expectedSignature = crypto.createHash('sha256')
        .update(`${encodedPayload}_${randomString}_${process.env.APP_SECRET}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false, reason: 'Invalid signature' };
      }

      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - payload.timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return { valid: false, reason: 'Token expired' };
      }

      return { 
        valid: true, 
        userId: payload.userId,
        step: payload.step,
        timestamp: payload.timestamp
      };
    } catch (error) {
      logger.error('Flow token verification failed', { error: error.message });
      return { valid: false, reason: 'Verification error' };
    }
  }

  /**
   * Format phone number to E.164 format
   */
  formatToE164(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    let cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      return `+234${cleaned.slice(1)}`;
    } else if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
      return `+234${cleaned}`;
    } else if (phoneNumber.startsWith('+234') && cleaned.length === 13) {
      return phoneNumber;
    } else if (phoneNumber.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 15) {
      return phoneNumber;
    }
    
    if (cleaned.length === 10) {
      return `+234${cleaned}`;
    }
    
    throw new Error(`Invalid phone number format: ${phoneNumber}`);
  }

  /**
   * Handle Flow webhook data
   */
  async handleFlowWebhook(flowData) {
    try {
      const { flow_token, screen, data } = flowData;
      
      // Verify the flow token
      const tokenData = this.verifyFlowToken(flow_token);
      if (!tokenData.valid) {
        logger.warn('Invalid flow token received', { 
          reason: tokenData.reason,
          flow_token: flow_token.substring(0, 20) + '...'
        });
        return { success: false, error: 'Invalid flow token' };
      }

      // Process the flow data based on screen
      const result = await this.processFlowScreen(screen, data, tokenData.userId);
      
      return {
        success: true,
        result,
        userId: tokenData.userId
      };
    } catch (error) {
      logger.error('Flow webhook processing failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Process flow screen data
   */
  async processFlowScreen(screen, data, userId) {
    const userService = require('./user');
    const kycService = require('./kyc');
    const onboardingService = require('./onboarding');

    try {
      switch (screen) {
        case 'PERSONAL_DETAILS_SCREEN':
          // Save personal details
          const user = await userService.getUserById(userId);
          if (user) {
            await user.update({
              firstName: data.first_name,
              lastName: data.last_name,
              middleName: data.middle_name,
              dateOfBirth: data.date_of_birth,
              gender: data.gender
            });
          }
          
          return {
            nextScreen: 'BVN_SCREEN',
            data: { success: true, message: 'Personal details saved successfully' }
          };

        case 'BVN_SCREEN':
          // Process BVN verification
          const bvnResult = await kycService.verifyBVN(data.bvn, userId);
          
          if (bvnResult.success) {
            return {
              nextScreen: 'PIN_SETUP_SCREEN',
              data: { success: true, message: 'BVN verified successfully' }
            };
          } else {
            return {
              nextScreen: 'BVN_SCREEN',
              data: { 
                success: false, 
                error: 'BVN verification failed. Please check and try again.' 
              }
            };
          }

        case 'PIN_SETUP_SCREEN':
          // Validate and save PIN
          if (data.pin !== data.confirm_pin) {
            return {
              nextScreen: 'PIN_SETUP_SCREEN',
              data: { 
                success: false, 
                error: 'PINs do not match. Please try again.' 
              }
            };
          }

          // Save PIN and complete onboarding
          await onboardingService.completePinSetup(userId, data.pin);
          
          return {
            nextScreen: 'COMPLETION_SCREEN',
            data: { 
              success: true, 
              message: 'Account setup completed! Welcome to MiiMii!' 
            }
          };

        case 'PIN_INPUT_SCREEN':
          // Verify PIN for login
          const loginUser = await userService.getUserById(userId);
          if (loginUser && await loginUser.validatePin(data.pin)) {
            return {
              success: true,
              message: 'Login successful! Welcome back to MiiMii!'
            };
          } else {
            return {
              success: false,
              error: 'Invalid PIN. Please try again.'
            };
          }

        default:
          return {
            data: { error: 'Unknown screen' }
          };
      }
    } catch (error) {
      logger.error('Flow screen processing error', { error: error.message, screen, userId });
      return {
        data: { 
          success: false, 
          error: 'Processing failed. Please try again.' 
        }
      };
    }
  }
}

module.exports = new WhatsAppFlowService(); 
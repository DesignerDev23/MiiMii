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
   * This matches the actual Flow structure from Facebook WhatsApp Manager
   */
  getOnboardingFlowJson() {
    return {
      "screens": [
        {
          "data": {},
          "id": "QUESTION_ONE",
          "layout": {
            "children": [
              {
                "children": [
                  {
                    "text": "Welcome to MiiMii",
                    "type": "TextHeading"
                  },
                  {
                    "type": "TextBody",
                    "text": "Let's get you set up with your account. This will only take a few minutes"
                  },
                  {
                    "label": "Start Onboarding",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_poawge",
                        "type": "screen"
                      },
                      "payload": {}
                    },
                    "type": "Footer"
                  }
                ],
                "name": "flow_path",
                "type": "Form"
              }
            ],
            "type": "SingleColumnLayout"
          },
          "title": "WELCOME_SCREEN"
        },
        {
          "data": {},
          "id": "screen_poawge",
          "layout": {
            "children": [
              {
                "children": [
                  {
                    "text": "Personal Details",
                    "type": "TextHeading"
                  },
                  {
                    "text": "Please provide your personal information:",
                    "type": "TextBody"
                  },
                  {
                    "input-type": "text",
                    "label": "First Name",
                    "name": "First_Name_abf873",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Last Name",
                    "name": "Last_Name_5487df",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Middle Name",
                    "name": "Middle_Name_8abed2",
                    "required": false,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Address",
                    "name": "Address_979e9b",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "data-source": [
                      {
                        "id": "0_Male",
                        "title": "Male"
                      },
                      {
                        "id": "1_Female",
                        "title": "Female"
                      }
                    ],
                    "label": "Gender",
                    "name": "Gender_a12260",
                    "required": true,
                    "type": "RadioButtonsGroup"
                  },
                  {
                    "input-type": "text",
                    "label": "Date of Birth ",
                    "name": "Date_of_Birth__291d3f",
                    "required": true,
                    "type": "TextInput",
                    "helper-text": "DD/MM/YYYY"
                  },
                  {
                    "label": "Next",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_kswuhq",
                        "type": "screen"
                      },
                      "payload": {
                        "screen_1_First_Name_0": "${form.First_Name_abf873}",
                        "screen_1_Last_Name_1": "${form.Last_Name_5487df}",
                        "screen_1_Middle_Name_2": "${form.Middle_Name_8abed2}",
                        "screen_1_Address_3": "${form.Address_979e9b}",
                        "screen_1_Gender_4": "${form.Gender_a12260}",
                        "screen_1_Date_of_Birth__5": "${form.Date_of_Birth__291d3f}"
                      }
                    },
                    "type": "Footer"
                  }
                ],
                "name": "flow_path",
                "type": "Form"
              }
            ],
            "type": "SingleColumnLayout"
          },
          "title": "PERSONAL_DETAILS_SCREEN"
        },
        {
          "data": {
            "screen_1_First_Name_0": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Last_Name_1": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Middle_Name_2": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Address_3": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Gender_4": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Date_of_Birth__5": {
              "__example__": "Example",
              "type": "string"
            }
          },
          "id": "screen_kswuhq",
          "layout": {
            "children": [
              {
                "children": [
                  {
                    "text": "BVN Verification",
                    "type": "TextHeading"
                  },
                  {
                    "text": "For security purposes, we need to verify your BVN:",
                    "type": "TextBody"
                  },
                  {
                    "input-type": "number",
                    "label": "BVN",
                    "name": "BVN_217ee8",
                    "required": true,
                    "type": "TextInput",
                    "helper-text": "Must be exactly 11 digits"
                  },
                  {
                    "label": "Verify BVN",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_wkunnj",
                        "type": "screen"
                      },
                      "payload": {
                        "screen_2_BVN_0": "${form.BVN_217ee8}",
                        "screen_1_First_Name_0": "${data.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${data.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${data.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${data.screen_1_Address_3}",
                        "screen_1_Gender_4": "${data.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${data.screen_1_Date_of_Birth__5}"
                      }
                    },
                    "type": "Footer"
                  }
                ],
                "name": "flow_path",
                "type": "Form"
              }
            ],
            "type": "SingleColumnLayout"
          },
          "title": "BVN_SCREEN"
        },
        {
          "data": {
            "screen_2_BVN_0": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_First_Name_0": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Last_Name_1": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Middle_Name_2": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Address_3": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Gender_4": {
              "__example__": "Example",
              "type": "string"
            },
            "screen_1_Date_of_Birth__5": {
              "__example__": "Example",
              "type": "string"
            }
          },
          "id": "screen_wkunnj",
          "layout": {
            "children": [
              {
                "children": [
                  {
                    "text": "Set Your PIN",
                    "type": "TextHeading"
                  },
                  {
                    "text": "Create a 4-digit PIN for your account security:",
                    "type": "TextBody"
                  },
                  {
                    "input-type": "text",
                    "label": "4-Digit PIN",
                    "name": "4Digit_PIN_49b72a",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Confirm PIN",
                    "name": "Confirm_PIN_a9ed34",
                    "required": true,
                    "type": "TextInput",
                    "helper-text": "Must be exactly 4 digits"
                  },
                  {
                    "label": "Complete Setup",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "screen_3_4Digit_PIN_0": "${form.4Digit_PIN_49b72a}",
                        "screen_3_Confirm_PIN_1": "${form.Confirm_PIN_a9ed34}",
                        "screen_2_BVN_0": "${data.screen_2_BVN_0}",
                        "screen_1_First_Name_0": "${data.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${data.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${data.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${data.screen_1_Address_3}",
                        "screen_1_Gender_4": "${data.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${data.screen_1_Date_of_Birth__5}"
                      }
                    },
                    "type": "Footer"
                  }
                ],
                "name": "flow_path",
                "type": "Form"
              }
            ],
            "type": "SingleColumnLayout"
          },
          "terminal": true,
          "title": "PIN_SETUP_SCREEN"
        }
      ],
      "version": "7.2"
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
      // Build the parameters object according to WhatsApp Flow API documentation
      const parameters = {
        flow_message_version: '3',
        flow_cta: flowData.flowCta || 'Start'
      };

      // Add flow_id (preferred) or flow_name
      if (flowData.flowId) {
        parameters.flow_id = flowData.flowId;
      } else if (flowData.flowName) {
        parameters.flow_name = flowData.flowName;
      } else {
        throw new Error('Either flowId or flowName must be provided');
      }

      // Add optional parameters
      if (flowData.flowToken && flowData.flowToken !== 'unused') {
        parameters.flow_token = flowData.flowToken;
      }

      if (flowData.flowAction) {
        parameters.flow_action = flowData.flowAction;
      }

      // Handle flow_action_payload correctly according to documentation
      if (flowData.flowActionPayload) {
        parameters.flow_action_payload = flowData.flowActionPayload;
      }

      const interactive = {
        type: 'flow',
        header: flowData.header,
        body: { text: flowData.body },
        footer: flowData.footer ? { text: flowData.footer } : undefined,
        action: {
          name: 'flow',
          parameters
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
   * Updated to handle the actual field names from Facebook WhatsApp Manager Flow
   */
  async processFlowScreen(screen, data, userId) {
    const userService = require('./user');
    const kycService = require('./kyc');
    const onboardingService = require('./onboarding');

    try {
      switch (screen) {
        case 'screen_poawge': // Personal Details Screen
          // Extract personal details from the Facebook Flow data structure
          const firstName = data.screen_1_First_Name_0;
          const lastName = data.screen_1_Last_Name_1;
          const middleName = data.screen_1_Middle_Name_2;
          const address = data.screen_1_Address_3;
          const gender = data.screen_1_Gender_4;
          const dateOfBirth = data.screen_1_Date_of_Birth__5;

          // Save personal details
          const user = await userService.getUserById(userId);
          if (user) {
            // Parse gender from radio button format (e.g., "0_Male" -> "male")
            let parsedGender = 'other';
            if (gender) {
              if (gender.toLowerCase().includes('male')) {
                parsedGender = gender.toLowerCase().includes('female') ? 'female' : 'male';
              }
            }

            // Parse date from DD/MM/YYYY format to proper date
            let parsedDate = null;
            if (dateOfBirth) {
              const parts = dateOfBirth.split('/');
              if (parts.length === 3) {
                // Convert DD/MM/YYYY to YYYY-MM-DD
                parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            }

            await user.update({
              firstName: firstName,
              lastName: lastName,
              middleName: middleName || null,
              address: address,
              dateOfBirth: parsedDate,
              gender: parsedGender
            });

            logger.info('Personal details saved from Flow', {
              userId: user.id,
              firstName,
              lastName,
              gender: parsedGender
            });
          }
          
          return {
            nextScreen: 'screen_kswuhq',
            data: { success: true, message: 'Personal details saved successfully' }
          };

        case 'screen_kswuhq': // BVN Screen
          // Extract BVN from the Facebook Flow data structure
          const bvn = data.screen_2_BVN_0;
          
          if (!bvn || bvn.length !== 11) {
            return {
              nextScreen: 'screen_kswuhq',
              data: { 
                success: false, 
                error: 'BVN must be exactly 11 digits. Please check and try again.' 
              }
            };
          }

          // Process BVN verification
          const bvnResult = await kycService.verifyBVN(bvn, userId);
          
          if (bvnResult.success) {
            return {
              nextScreen: 'screen_wkunnj',
              data: { success: true, message: 'BVN verified successfully' }
            };
          } else {
            return {
              nextScreen: 'screen_kswuhq',
              data: { 
                success: false, 
                error: 'BVN verification failed. Please check and try again.' 
              }
            };
          }

        case 'screen_wkunnj': // PIN Setup Screen (Final)
          // Extract PIN data from the Facebook Flow data structure
          const pin = data.screen_3_4Digit_PIN_0;
          const confirmPin = data.screen_3_Confirm_PIN_1;

          // Validate PIN
          if (!pin || !confirmPin) {
            return {
              nextScreen: 'screen_wkunnj',
              data: { 
                success: false, 
                error: 'Both PIN fields are required.' 
              }
            };
          }

          if (pin !== confirmPin) {
            return {
              nextScreen: 'screen_wkunnj',
              data: { 
                success: false, 
                error: 'PINs do not match. Please try again.' 
              }
            };
          }

          if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            return {
              nextScreen: 'screen_wkunnj',
              data: { 
                success: false, 
                error: 'PIN must be exactly 4 digits.' 
              }
            };
          }

          // Save PIN and complete onboarding
          await onboardingService.completePinSetup(userId, pin);
          
          // Extract all the data collected throughout the flow for final processing
          const finalData = {
            firstName: data.screen_1_First_Name_0,
            lastName: data.screen_1_Last_Name_1,
            middleName: data.screen_1_Middle_Name_2,
            address: data.screen_1_Address_3,
            gender: data.screen_1_Gender_4,
            dateOfBirth: data.screen_1_Date_of_Birth__5,
            bvn: data.screen_2_BVN_0,
            pin: pin
          };

          logger.info('Flow onboarding completed', {
            userId,
            finalData: {
              ...finalData,
              pin: '****', // Don't log the actual PIN
              bvn: bvn.substring(0, 3) + '********' // Don't log the full BVN
            }
          });
          
          return {
            nextScreen: 'COMPLETION_SCREEN',
            data: { 
              success: true, 
              message: 'Account setup completed! Welcome to MiiMii!',
              finalData
            }
          };

        case 'PIN_INPUT_SCREEN':
          // Verify PIN for login (this is for the login flow, not onboarding)
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
          logger.warn('Unknown flow screen received', { screen, userId, data });
          return {
            data: { error: `Unknown screen: ${screen}` }
          };
      }
    } catch (error) {
      logger.error('Flow screen processing error', { error: error.message, screen, userId, data });
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
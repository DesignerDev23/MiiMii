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
                navigate_screen: "WELCOME_SCREENS",
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
          "title": "WELCOME_SCREENS"
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
                    "name": "screen_1_First_Name_0",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Last Name",
                    "name": "screen_1_Last_Name_1",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Middle Name",
                    "name": "screen_1_Middle_Name_2",
                    "required": false,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Address",
                    "name": "screen_1_Address_3",
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
                    "name": "screen_1_Gender_4",
                    "required": true,
                    "type": "RadioButtonsGroup"
                  },
                  {
                    "input-type": "date",
                    "label": "Date of Birth",
                    "name": "screen_1_Date_of_Birth__5",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "label": "Continue",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_kswuhq",
                        "type": "screen"
                      },
                      "payload": {
                        "screen_1_First_Name_0": "${form.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${form.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${form.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${form.screen_1_Address_3}",
                        "screen_1_Gender_4": "${form.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${form.screen_1_Date_of_Birth__5}"
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
          "title": "PERSONAL_DETAILS"
        },
        {
          "data": {},
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
                    "text": "Please provide your Bank Verification Number (BVN) for verification:",
                    "type": "TextBody"
                  },
                  {
                    "input-type": "text",
                    "label": "BVN",
                    "name": "screen_2_BVN_0",
                    "required": true,
                    "type": "TextInput",
                    "helper-text": "Enter your 11-digit BVN"
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
                        "screen_2_BVN_0": "${form.screen_2_BVN_0}",
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
          "title": "BVN_VERIFICATION"
        },
        {
          "data": {},
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
                    "name": "screen_3_4Digit_PIN_0",
                    "required": true,
                    "type": "TextInput"
                  },
                  {
                    "input-type": "text",
                    "label": "Confirm PIN",
                    "name": "screen_3_Confirm_PIN_1",
                    "required": true,
                    "type": "TextInput",
                    "helper-text": "Must be exactly 4 digits"
                  },
                  {
                    "label": "Complete Setup",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "screen_3_4Digit_PIN_0": "${form.screen_3_4Digit_PIN_0}",
                        "screen_3_Confirm_PIN_1": "${form.screen_3_Confirm_PIN_1}",
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
          "title": "PIN_SETUP"
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
      // Generate Flow JSON dynamically based on the flowData
      const flowJson = this.generateDynamicFlowJson(flowData);
      
      logger.info('Sending Flow Message', {
        to,
        flowJsonLength: flowJson.length,
        hasHeader: !!flowData.header,
        hasBody: !!flowData.body,
        hasFooter: !!flowData.footer,
        hasActionPayload: !!flowData.flowActionPayload,
        environment: process.env.NODE_ENV,
        phoneNumberId: this.phoneNumberId
      });

      // Create the interactive message payload using flow_json approach
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatToE164(to),
        type: 'interactive',
        interactive: {
        type: 'flow',
          header: flowData.header || {
            type: 'text',
            text: 'Welcome to MiiMii!'
          },
          body: {
            text: flowData.body || 'Let\'s get you set up with your account.'
          },
          footer: flowData.footer ? {
            text: flowData.footer
          } : undefined,
        action: {
          name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowData.flowToken || 'unused',
              flow_json: flowJson, // Use flow_json instead of flow_id
              flow_cta: flowData.flowCta || 'Complete Onboarding',
              flow_action: flowData.flowAction || 'navigate',
              flow_action_payload: flowData.flowActionPayload || {
                screen: 'QUESTION_ONE',
                data: flowData.flowActionPayload?.data || {}
              }
            }
          }
        }
      };

      // Remove undefined properties to avoid API errors
      if (!payload.interactive.footer) {
        delete payload.interactive.footer;
      }

      logger.info('🚀 FLOW ID DEBUG: WhatsApp API request payload', {
        flowJsonLength: flowJson.length,
        flowJsonType: typeof flowJson,
        flowTokenLength: flowData.flowToken ? flowData.flowToken.length : 0,
        interactiveType: 'flow',
        actionName: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowData.flowToken || 'unused',
          flow_json: flowJson.substring(0, 100) + '...', // Log first 100 chars
          flow_cta: flowData.flowCta || 'Complete Onboarding',
          flow_action: flowData.flowAction || 'navigate',
          flow_action_payload: flowData.flowActionPayload || {
            screen: 'QUESTION_ONE',
            data: flowData.flowActionPayload?.data || {}
          }
        },
        phoneNumberId: this.phoneNumberId,
        environment: process.env.NODE_ENV
      });

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

      if (response.data && response.data.messages && response.data.messages[0]) {
      logger.info('Flow message sent successfully', {
        to,
          messageId: response.data.messages[0].id,
          flowJsonLength: flowJson.length
      });
        return response.data.messages[0].id;
      } else {
        throw new Error('Invalid response format from WhatsApp API');
      }

    } catch (error) {
      logger.error('Failed to send Flow message', {
        error: error.response?.data || error.message,
        to,
        flowData: {
          hasHeader: !!flowData.header,
          hasBody: !!flowData.body,
          hasFooter: !!flowData.footer,
          flowCta: flowData.flowCta,
          flowAction: flowData.flowAction
        }
      });
      throw error;
    }
  }

  /**
   * Generate dynamic Flow JSON based on the provided flowData
   */
  generateDynamicFlowJson(flowData) {
    const userData = flowData.flowActionPayload?.data || {};
    
    return JSON.stringify({
      "version": "5.0",
      "screens": [
        {
          "id": "QUESTION_ONE",
          "layout": {
            "type": "SingleColumnLayout",
            "children": [
              {
                "type": "Form",
                "name": "flow_path",
                "children": [
                  {
                    "type": "TextHeading",
                    "text": "Personal Details"
                  },
                  {
                    "type": "TextBody",
                    "text": "Please provide your personal information:"
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_1_First_Name_0",
                    "label": "First Name",
                    "input-type": "text",
                    "required": true
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_1_Last_Name_1",
                    "label": "Last Name",
                    "input-type": "text",
                    "required": true
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_1_Middle_Name_2",
                    "label": "Middle Name",
                    "input-type": "text",
                    "required": false
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_1_Address_3",
                    "label": "Address",
                    "input-type": "text",
                    "required": true
                  },
                  {
                    "type": "RadioButtonsGroup",
                    "name": "screen_1_Gender_4",
                    "label": "Gender",
                    "required": true,
                    "data-source": [
                      {
                        "id": "0_Male",
                        "title": "Male"
                      },
                      {
                        "id": "1_Female",
                        "title": "Female"
                      }
                    ]
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_1_Date_of_Birth__5",
                    "label": "Date of Birth",
                    "input-type": "date",
                    "required": true
                  },
                  {
                    "type": "Footer",
                    "label": "Continue",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_kswuhq",
                        "type": "screen"
                      },
                      "payload": {
                        "screen_1_First_Name_0": "${form.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${form.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${form.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${form.screen_1_Address_3}",
                        "screen_1_Gender_4": "${form.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${form.screen_1_Date_of_Birth__5}"
                      }
                    }
                  }
                ]
              }
            ]
          },
          "title": "PERSONAL_DETAILS"
        },
        {
          "id": "screen_kswuhq",
          "layout": {
            "type": "SingleColumnLayout",
            "children": [
              {
                "type": "Form",
                "name": "flow_path",
                "children": [
                  {
                    "type": "TextHeading",
                    "text": "BVN Verification"
                  },
                  {
                    "type": "TextBody",
                    "text": "Please provide your Bank Verification Number (BVN) for verification:"
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_2_BVN_0",
                    "label": "BVN",
                    "input-type": "text",
                    "required": true,
                    "helper-text": "Enter your 11-digit BVN"
                  },
                  {
                    "type": "Footer",
                    "label": "Verify BVN",
                    "on-click-action": {
                      "name": "navigate",
                      "next": {
                        "name": "screen_wkunnj",
                        "type": "screen"
                      },
                      "payload": {
                        "screen_2_BVN_0": "${form.screen_2_BVN_0}",
                        "screen_1_First_Name_0": "${data.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${data.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${data.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${data.screen_1_Address_3}",
                        "screen_1_Gender_4": "${data.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${data.screen_1_Date_of_Birth__5}"
                      }
                    }
                  }
                ]
              }
            ]
          },
          "title": "BVN_VERIFICATION"
        },
        {
          "id": "screen_wkunnj",
          "layout": {
            "type": "SingleColumnLayout",
            "children": [
              {
                "type": "Form",
                "name": "flow_path",
                "children": [
                  {
                    "type": "TextHeading",
                    "text": "Set Your PIN"
                  },
                  {
                    "type": "TextBody",
                    "text": "Create a 4-digit PIN for your account security:"
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_3_4Digit_PIN_0",
                    "label": "4-Digit PIN",
                    "input-type": "text",
                    "required": true
                  },
                  {
                    "type": "TextInput",
                    "name": "screen_3_Confirm_PIN_1",
                    "label": "Confirm PIN",
                    "input-type": "text",
                    "required": true,
                    "helper-text": "Must be exactly 4 digits"
                  },
                  {
                    "type": "Footer",
                    "label": "Complete Setup",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {
                        "screen_3_4Digit_PIN_0": "${form.screen_3_4Digit_PIN_0}",
                        "screen_3_Confirm_PIN_1": "${form.screen_3_Confirm_PIN_1}",
                        "screen_2_BVN_0": "${data.screen_2_BVN_0}",
                        "screen_1_First_Name_0": "${data.screen_1_First_Name_0}",
                        "screen_1_Last_Name_1": "${data.screen_1_Last_Name_1}",
                        "screen_1_Middle_Name_2": "${data.screen_1_Middle_Name_2}",
                        "screen_1_Address_3": "${data.screen_1_Address_3}",
                        "screen_1_Gender_4": "${data.screen_1_Gender_4}",
                        "screen_1_Date_of_Birth__5": "${data.screen_1_Date_of_Birth__5}"
                      }
                    }
                  }
                ]
              }
            ]
          },
          "title": "PIN_SETUP"
        }
      ],
      "title": "MiiMii Onboarding",
      "terminal": true,
      "success": true,
      "data": userData
    });
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
   * Handle Flow completion response
   */
  async handleFlowCompletion(flowResponse) {
    try {
      const { flowToken, responseJson } = flowResponse;
      
      // Verify the flow token
      const tokenData = this.verifyFlowToken(flowToken);
      if (!tokenData.valid) {
        logger.warn('Invalid flow token in completion response', { 
          reason: tokenData.reason,
          flowToken: flowToken.substring(0, 20) + '...'
        });
        return { success: false, error: 'Invalid flow token' };
      }

      logger.info('Processing Flow completion', {
        userId: tokenData.userId,
        responseJson: responseJson
      });

      // Extract final data from the response
      const finalData = {
        firstName: responseJson.firstName || responseJson.first_name,
        lastName: responseJson.lastName || responseJson.last_name,
        middleName: responseJson.middleName || responseJson.middle_name,
        address: responseJson.address,
        gender: responseJson.gender,
        dateOfBirth: responseJson.dateOfBirth || responseJson.date_of_birth,
        bvn: responseJson.bvn,
        pin: responseJson.pin
      };

      // Complete the onboarding process
      const onboardingService = require('./onboarding');
      const userService = require('./user');
      
      const user = await userService.getUserById(tokenData.userId);
      if (!user) {
        logger.error('User not found for Flow completion', { userId: tokenData.userId });
        return { success: false, error: 'User not found' };
      }

      // Update user with final data
      if (finalData.firstName || finalData.lastName) {
        await user.update({
          firstName: finalData.firstName,
          lastName: finalData.lastName,
          middleName: finalData.middleName,
          address: finalData.address,
          gender: finalData.gender,
          dateOfBirth: finalData.dateOfBirth,
          bvn: finalData.bvn,
          onboardingStep: 'completed'
        });
      }

      // Complete PIN setup and create virtual account
      let accountDetails = null;
      if (finalData.pin) {
        try {
          const pinResult = await onboardingService.completePinSetup(tokenData.userId, finalData.pin);
          if (pinResult.success && pinResult.accountDetails) {
            accountDetails = pinResult.accountDetails;
          }
        } catch (pinError) {
          logger.error('Failed to complete PIN setup during Flow completion', {
            error: pinError.message,
            userId: tokenData.userId
          });
        }
      }

      logger.info('Flow completion processed successfully', {
        userId: tokenData.userId,
        finalData: {
          ...finalData,
          pin: finalData.pin ? '****' : 'not_provided',
          bvn: finalData.bvn ? finalData.bvn.substring(0, 3) + '********' : 'not_provided'
        },
        hasAccountDetails: !!accountDetails
      });

      return {
        success: true,
        userId: tokenData.userId,
        accountDetails: accountDetails
      };

    } catch (error) {
      logger.error('Flow completion processing failed', { 
        error: error.message,
        flowResponse: flowResponse
      });
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
      logger.info('Processing Flow screen', {
        screen,
        userId,
        dataKeys: Object.keys(data || {}),
        hasData: !!data
      });

      switch (screen) {
        case 'QUESTION_ONE':
        case 'screen_poawge': // Personal Details Screen
          // Extract personal details from the Facebook Flow data structure
          const firstName = data.screen_1_First_Name_0 || data.First_Name_abf873;
          const lastName = data.screen_1_Last_Name_1 || data.Last_Name_5487df;
          const middleName = data.screen_1_Middle_Name_2 || data.Middle_Name_8abed2;
          const address = data.screen_1_Address_3 || data.Address_979e9b;
          const gender = data.screen_1_Gender_4 || data.Gender_a12260;
          const dateOfBirth = data.screen_1_Date_of_Birth__5 || data.Date_of_Birth__291d3f;

          // Save personal details immediately
          const user = await userService.getUserById(userId);
          if (user && (firstName || lastName)) {
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

            // Create full name from first and last name
            const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

            await user.update({
              firstName: firstName,
              lastName: lastName,
              middleName: middleName || null,
              fullName: fullName, // Save to fullName column as requested
              address: address,
              dateOfBirth: parsedDate,
              gender: parsedGender,
              onboardingStep: 'bvn_verification'
            });

            logger.info('Personal details saved from Flow', {
              userId: user.id,
              firstName,
              lastName,
              fullName,
              gender: parsedGender,
              onboardingStep: 'bvn_verification'
            });
          }
          
          return {
            nextScreen: 'screen_kswuhq',
            data: { success: true, message: 'Personal details saved successfully' }
          };

        case 'screen_kswuhq': // BVN Verification Screen
          // Extract BVN data from the Facebook Flow data structure
          const bvn = data.screen_2_BVN_0 || data.BVN_217ee8;

          // Validate BVN format
          if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
            return {
              nextScreen: 'screen_kswuhq',
              data: { 
                success: false, 
                error: 'BVN must be exactly 11 digits. Please check and try again.' 
              }
            };
          }

          // Verify BVN with Fincra before proceeding
          try {
            logger.info('Verifying BVN with Fincra', {
              userId,
              bvn: bvn.substring(0, 3) + '********'
            });

            const bvnResult = await kycService.verifyBVNWithFincra(bvn, userId);
          
          if (bvnResult.success) {
              // Update user with BVN and verification status
              const user = await userService.getUserById(userId);
              if (user) {
                await user.update({
                  bvn: bvn,
                  kycStatus: 'verified',
                  kycData: {
                    bvnVerified: true,
                    bvnVerifiedAt: new Date().toISOString(),
                    bvnData: bvnResult.data
                  },
                  onboardingStep: 'pin_setup'
                });

                logger.info('BVN verified successfully with Fincra', {
                  userId,
                  bvn: bvn.substring(0, 3) + '********',
                  verificationData: bvnResult.data,
                  onboardingStep: 'pin_setup'
                });
              }
              
            return {
              nextScreen: 'screen_wkunnj',
                data: { 
                  success: true, 
                  message: 'BVN verified successfully! Please proceed to set up your PIN.' 
                }
            };
          } else {
              logger.warn('BVN verification failed with Fincra', {
                userId,
                bvn: bvn.substring(0, 3) + '********',
                error: bvnResult.error
              });
              
            return {
              nextScreen: 'screen_kswuhq',
              data: { 
                success: false, 
                  error: bvnResult.error || 'BVN verification failed. Please check and try again.' 
                }
              };
            }
          } catch (bvnError) {
            logger.error('BVN verification error with Fincra', {
              error: bvnError.message,
              userId,
              bvn: bvn.substring(0, 3) + '********'
            });
            
            return {
              nextScreen: 'screen_kswuhq',
              data: { 
                success: false, 
                error: 'BVN verification service is temporarily unavailable. Please try again later.' 
              }
            };
          }

        case 'screen_wkunnj': // PIN Setup Screen (Final)
          // Extract PIN data from the Facebook Flow data structure
          const pin = data.screen_3_4Digit_PIN_0 || data['4Digit_PIN_49b72a'];
          const confirmPin = data.screen_3_Confirm_PIN_1 || data.Confirm_PIN_a9ed34;

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

          // Complete PIN setup and create virtual account
          try {
            const pinResult = await onboardingService.completePinSetup(userId, pin);
            
            if (pinResult.success) {
              logger.info('PIN setup completed and virtual account created', {
            userId,
                hasAccountDetails: !!pinResult.accountDetails
          });
          
          return {
            nextScreen: 'COMPLETION_SCREEN',
            data: { 
              success: true, 
                  message: '🎉 Account setup completed! Welcome to MiiMii! Your account is now ready to use.',
                  accountDetails: pinResult.accountDetails
            }
          };
            } else {
              logger.error('Failed to complete PIN setup', {
                userId,
                error: pinResult.error
              });

            return {
                nextScreen: 'screen_wkunnj',
                data: { 
                  success: false, 
                  error: 'Failed to complete account setup. Please try again.' 
                }
              };
            }
          } catch (pinError) {
            logger.error('PIN setup error', {
              error: pinError.message,
              userId
            });
            
            return {
              nextScreen: 'screen_wkunnj',
              data: { 
              success: false,
                error: 'Failed to complete account setup. Please try again.' 
              }
            };
          }

        default:
          logger.warn('Unknown Flow screen', { screen, userId });
          return {
            nextScreen: 'QUESTION_ONE',
            data: { success: false, error: 'Unknown screen encountered' }
          };
      }
    } catch (error) {
      logger.error('Error processing Flow screen', {
        error: error.message,
        screen,
        userId
      });
      
      return {
        nextScreen: 'QUESTION_ONE',
        data: { success: false, error: 'Processing error occurred' }
      };
    }
  }
}

module.exports = new WhatsAppFlowService(); 
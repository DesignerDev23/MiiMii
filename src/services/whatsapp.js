const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const { axiosConfig } = require('../utils/httpsAgent');

class WhatsAppService {
  constructor() {
    const whatsappConfig = config.getWhatsappConfig();
    this.accessToken = whatsappConfig.accessToken;
    this.phoneNumberId = whatsappConfig.phoneNumberId;
    this.baseURL = `https://graph.facebook.com/v18.0/${this.phoneNumberId}`;
    this.verifyToken = whatsappConfig.webhookVerifyToken;
  }

  /**
   * Format phone number to E.164 format required by WhatsApp Business API
   * @param {string} phoneNumber - Input phone number in various formats
   * @returns {string} - Phone number in E.164 format (+234xxxxxxxxxx)
   */
  formatToE164(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different input formats
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      // Already in +234 format without the +
      return `+${cleaned}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      // Nigerian local format (e.g., 08012345678)
      return `+234${cleaned.slice(1)}`;
    } else if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
      // 10-digit Nigerian number without leading 0 (e.g., 8012345678)
      return `+234${cleaned}`;
    } else if (phoneNumber.startsWith('+234') && cleaned.length === 13) {
      // Already properly formatted
      return phoneNumber;
    } else if (phoneNumber.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 15) {
      // Other international numbers already in E.164 format
      return phoneNumber;
    }
    
    // If none of the above patterns match, assume it's a Nigerian number without country code
    if (cleaned.length === 10) {
      return `+234${cleaned}`;
    }
    
    throw new Error(`Invalid phone number format: ${phoneNumber}. Expected Nigerian format (08012345678) or international E.164 format (+234...)`);
  }

  /**
   * Validate if phone number is in proper E.164 format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} - True if valid E.164 format
   */
  validateE164(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }
    
    // E.164 format: + followed by 4-14 digits (max 15 total, but our regex ensures max 15)
    // Must start with +, then 1-9 (no leading zero), then 3-13 more digits
    const e164Regex = /^\+[1-9]\d{3,13}$/;
    
    return e164Regex.test(phoneNumber);
  }

  validateConfiguration() {
    // Use exact environment variable names from Digital Ocean configuration
    const requiredEnvVars = [
      'BOT_ACCESS_TOKEN',
      'BOT_PHONE_NUMBER_ID',
      'BOT_WEBHOOK_VERIFY_TOKEN'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
      logger.error('Missing required WhatsApp configuration', { 
        missing,
        service: 'whatsapp-service'
      });
    }

    if (!this.accessToken) {
      logger.error('WhatsApp access token is not configured', {
        service: 'whatsapp-service'
      });
    }
  }

  isConfigured() {
    return !!(this.accessToken && this.phoneNumberId && this.verifyToken);
  }

  async sendMessage(to, message, type = 'text') {
    try {
      // Format phone number to E.164 before sending
      const formattedNumber = this.formatToE164(to);
      
      // Validate the formatted number
      if (!this.validateE164(formattedNumber)) {
        throw new Error(`Invalid E.164 phone number format: ${formattedNumber}`);
      }

      // Log the access token being used (first 20 chars for debugging)
      logger.info('WhatsApp sendMessage called', {
        originalNumber: to,
        formattedNumber,
        messageType: type,
        accessTokenPrefix: this.accessToken ? this.accessToken.substring(0, 20) + '...' : 'none',
        accessTokenLength: this.accessToken ? this.accessToken.length : 0,
        phoneNumberId: this.phoneNumberId,
        service: 'whatsapp-service'
      });

      // Check if service is properly configured
      if (!this.isConfigured()) {
        logger.error('WhatsApp service not properly configured', {
          hasToken: !!this.accessToken,
          hasPhoneId: !!this.phoneNumberId,
          hasVerifyToken: !!this.verifyToken
        });
        throw new Error('WhatsApp service not properly configured');
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: formattedNumber, // Use E.164 formatted number
        type: type
      };

      if (type === 'text') {
        payload.text = { body: message };
      } else if (type === 'template') {
        payload.template = message;
      } else if (type === 'interactive') {
        payload.interactive = message;
      }

      // Log the request details
      logger.info('WhatsApp API request details', {
        url: `${this.baseURL}/messages`,
        payload,
        authorizationHeader: `Bearer ${this.accessToken.substring(0, 20)}...`,
        service: 'whatsapp-service'
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

      logger.info('WhatsApp message sent successfully', {
        to: formattedNumber,
        messageId: response.data.messages[0].id,
        service: 'miimii-api'
      });

      return response.data;
    } catch (error) {
      // Enhanced error handling for OAuth issues
      const isAuthError = error.response?.status === 401 || 
                         error.response?.data?.error?.code === 190;
      
      if (isAuthError) {
        logger.error('WhatsApp OAuth authentication failed', {
          error: error.response?.data || error.message,
          errorCode: error.response?.data?.error?.code,
          errorType: error.response?.data?.error?.type,
          to,
          service: 'miimii-api'
        });
        
        // Don't retry auth errors immediately
        throw new Error('Authentication failed - invalid or expired access token');
      }

      logger.error('Failed to send WhatsApp message', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        to,
        message,
        service: 'miimii-api'
      });
      
      throw error;
    }
  }

  async sendTextMessage(to, text) {
    return this.sendMessage(to, text, 'text');
  }

  async sendTemplateMessage(to, templateName, components = []) {
    const template = {
      name: templateName,
      language: { code: 'en' },
      components: components
    };
    return this.sendMessage(to, template, 'template');
  }

  async sendInteractiveMessage(to, interactive) {
    return this.sendMessage(to, interactive, 'interactive');
  }

  async sendButtonMessage(to, text, buttons) {
    const interactive = {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map((button, index) => ({
          type: 'reply',
          reply: {
            id: button.id || `btn_${index}`,
            title: button.title
          }
        }))
      }
    };
    return this.sendInteractiveMessage(to, interactive);
  }

  async sendListMessage(to, text, buttonText, sections) {
    const interactive = {
      type: 'list',
      header: { type: 'text', text: 'MiiMii Services' },
      body: { text },
      action: {
        button: buttonText,
        sections: sections
      }
    };
    return this.sendInteractiveMessage(to, interactive);
  }

  // New Advanced Interactive Message Methods
  async sendFlowMessage(to, flowData) {
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
    return this.sendInteractiveMessage(to, interactive);
  }

  async sendTypingIndicator(to, duration = 3000) {
    try {
      // Check if service is properly configured
      if (!this.isConfigured()) {
        logger.warn('WhatsApp service not configured, skipping typing indicator', { to });
        return;
      }

      const formattedNumber = this.formatToE164(to);
      
      // Use the correct WhatsApp Business API endpoint for typing
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: '' // Empty body for typing indicator simulation
        }
      };

      // Instead of using typing endpoint which may not be available,
      // we'll simulate typing with a very short delay and no actual message
      logger.debug('Simulating typing indicator', { to: formattedNumber, duration });
      
      // Just add a delay to simulate typing without making API call
      // This prevents the 400 status code error
      await new Promise(resolve => setTimeout(resolve, Math.min(duration, 2000)));

      logger.debug('Typing indicator simulation complete', { to: formattedNumber, duration });
    } catch (error) {
      logger.warn('Failed to send typing indicator', { error: error.message, to });
    }
  }

  async stopTypingIndicator(to) {
    // Since we're not using the actual typing API, we don't need to stop it
    logger.debug('Typing indicator stopped (simulated)', { to });
  }

  async sendLocationRequestMessage(to, text) {
    const interactive = {
      type: 'location_request_message',
      body: { text }
    };
    return this.sendInteractiveMessage(to, interactive);
  }

  async sendMediaMessage(to, mediaType, mediaUrl, caption = '') {
    const payload = {
      messaging_product: 'whatsapp',
      to: this.formatToE164(to),
      type: mediaType
    };

    payload[mediaType] = {
      link: mediaUrl,
      caption: caption
    };

    return this.sendMessage(to, payload, mediaType);
  }

  async getContactProfile(phoneNumber) {
    try {
      const formattedNumber = this.formatToE164(phoneNumber);
      
      // Use WhatsApp Business API to get contact info
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${formattedNumber}?fields=profile`,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return {
        name: response.data.profile?.name || null,
        waId: response.data.wa_id,
        profilePicture: response.data.profile?.profile_pic_url || null
      };
    } catch (error) {
      logger.warn('Failed to get contact profile', { error: error.message, phoneNumber });
      return { name: null, waId: phoneNumber, profilePicture: null };
    }
  }

  async markMessageAsRead(messageId) {
    try {
      // Log the access token being used for markMessageAsRead
      logger.info('WhatsApp markMessageAsRead called', {
        messageId,
        accessTokenPrefix: this.accessToken ? this.accessToken.substring(0, 20) + '...' : 'none',
        accessTokenLength: this.accessToken ? this.accessToken.length : 0,
        phoneNumberId: this.phoneNumberId,
        service: 'whatsapp-service'
      });

      if (!this.isConfigured()) {
        logger.warn('Cannot mark message as read - WhatsApp service not configured', {
          messageId,
          service: 'miimii-api'
        });
        return;
      }

      // Log the request details
      logger.info('WhatsApp markMessageAsRead request details', {
        url: `${this.baseURL}/messages`,
        payload: {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        authorizationHeader: `Bearer ${this.accessToken.substring(0, 20)}...`,
        service: 'whatsapp-service'
      });

      await axios.post(
        `${this.baseURL}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      logger.debug('Message marked as read successfully', {
        messageId,
        service: 'miimii-api'
      });
    } catch (error) {
      const isAuthError = error.response?.status === 401 || 
                         error.response?.data?.error?.code === 190;
      
      if (isAuthError) {
        logger.error('Failed to mark message as read - authentication error', {
          error: error.response?.data?.error?.message || error.message,
          errorCode: error.response?.data?.error?.code,
          messageId,
          service: 'miimii-api'
        });
      } else {
        logger.error('Failed to mark message as read', {
          error: error.response?.data || error.message,
          messageId,
          service: 'miimii-api'
        });
      }
    }
  }

  async downloadMedia(mediaId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('WhatsApp service not properly configured');
      }

      // First get media URL
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const mediaUrl = mediaResponse.data.url;

      // Download the actual media
      const downloadResponse = await axios.get(mediaUrl, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Bearer ${this.accessToken}`
        },
        responseType: 'stream'
      });

      return {
        stream: downloadResponse.data,
        mimeType: mediaResponse.data.mime_type,
        fileSize: mediaResponse.data.file_size
      };
    } catch (error) {
      const isAuthError = error.response?.status === 401 || 
                         error.response?.data?.error?.code === 190;
      
      if (isAuthError) {
        logger.error('Media download failed - authentication error', {
          error: error.response?.data?.error?.message || error.message,
          mediaId,
          service: 'miimii-api'
        });
        throw new Error('Authentication failed - invalid or expired access token');
      }

      logger.error('Failed to download media', { 
        error: error.message, 
        mediaId,
        service: 'miimii-api'
      });
      throw error;
    }
  }

  // Token validation method
  async validateToken() {
    try {
      // Log the access token being used for validation
      logger.info('WhatsApp validateToken called', {
        hasAccessToken: !!this.accessToken,
        accessTokenPrefix: this.accessToken ? this.accessToken.substring(0, 20) + '...' : 'none',
        accessTokenLength: this.accessToken ? this.accessToken.length : 0,
        phoneNumberId: this.phoneNumberId,
        service: 'whatsapp-service'
      });

      if (!this.accessToken) {
        return { valid: false, error: 'No access token configured' };
      }

      // Log the validation request details
      logger.info('WhatsApp token validation request details', {
        url: `https://graph.facebook.com/v18.0/${this.phoneNumberId}`,
        authorizationHeader: `Bearer ${this.accessToken.substring(0, 20)}...`,
        service: 'whatsapp-service'
      });

      // Test the token by making a simple API call
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}`,
        {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      logger.info('WhatsApp token validation successful', {
        phoneNumberId: this.phoneNumberId,
        service: 'miimii-api'
      });

      return { valid: true, data: response.data };
    } catch (error) {
      const isAuthError = error.response?.status === 401 || 
                         error.response?.data?.error?.code === 190;

      if (isAuthError) {
        logger.error('WhatsApp token validation failed', {
          error: error.response?.data?.error || error.message,
          service: 'miimii-api'
        });
        return { 
          valid: false, 
          error: 'Invalid or expired access token',
          authError: true
        };
      }

      logger.error('Token validation request failed', {
        error: error.message,
        service: 'miimii-api'
      });
      return { 
        valid: false, 
        error: 'Token validation request failed',
        authError: false
      };
    }
  }

  // Health check method for the service
  async healthCheck() {
    const config = this.isConfigured();
    const tokenValidation = config ? await this.validateToken() : { valid: false, error: 'Service not configured' };

    return {
      configured: config,
      tokenValid: tokenValidation.valid,
      error: tokenValidation.error,
      timestamp: new Date().toISOString(),
      service: 'whatsapp'
    };
  }

  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      logger.info('WhatsApp webhook verified successfully');
      return challenge;
    }
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    return null;
  }

  parseWebhookMessage(body) {
    try {
      // Handle webhook verification requests
      if (body['hub.mode'] && body['hub.challenge']) {
        logger.info('Received webhook verification request');
        return {
          type: 'verification',
          mode: body['hub.mode'],
          challenge: body['hub.challenge'],
          token: body['hub.verify_token']
        };
      }

      const entry = body.entry?.[0];
      if (!entry) {
        logger.warn('No entry found in webhook body', { bodyKeys: Object.keys(body) });
        return null;
      }

      const changes = entry.changes?.[0];
      if (!changes) {
        logger.warn('No changes found in webhook entry', { entry });
        return null;
      }

      // Check if this is a WhatsApp Business Account webhook
      if (changes.value?.object !== 'whatsapp_business_account') {
        logger.warn('Invalid webhook structure or not a WhatsApp Business Account', {
          object: changes.value?.object,
          changes: changes
        });
        return null;
      }

      const value = changes.value;
      const messages = value.messages?.[0];
      const statuses = value.statuses?.[0];

      if (messages) {
        const messageData = this.extractMessageContent(messages);
        
        // Check if this is a Flow message
        if (messages.interactive?.type === 'flow') {
          const flowData = messages.interactive.flow;
          logger.info('Processing Flow webhook', {
            flowToken: flowData.flow_token,
            screen: flowData.screen,
            hasData: !!flowData.data
          });
          
          return {
            type: 'message',
            messageId: messages.id,
            from: messages.from,
            timestamp: messages.timestamp,
            flowData: {
              flow_token: flowData.flow_token,
              screen: flowData.screen,
              data: flowData.data,
              encrypted_flow_data: flowData.encrypted_flow_data,
              encrypted_aes_key: flowData.encrypted_aes_key,
              encrypted_iv: flowData.encrypted_iv
            },
            messageType: 'flow',
            contact: value.contacts?.[0]
          };
        }

        logger.info('Processing regular message webhook', {
          messageId: messages.id,
          from: messages.from,
          messageType: messageData.type
        });

        return {
          type: 'message',
          messageId: messages.id,
          from: messages.from,
          timestamp: messages.timestamp,
          message: messageData,
          messageType: messageData.type,
          contact: value.contacts?.[0]
        };
      }

      if (statuses) {
        logger.info('Processing status webhook', {
          status: statuses.status,
          messageId: statuses.id
        });
        
        return {
          type: 'status',
          statuses: statuses
        };
      }

      // Handle other webhook types (like Flow completion)
      if (value.flow_completion) {
        logger.info('Processing Flow completion webhook', {
          flowToken: value.flow_completion.flow_token,
          screen: value.flow_completion.screen
        });
        
        return {
          type: 'flow_completion',
          flowData: value.flow_completion,
          contact: value.contacts?.[0]
        };
      }

      logger.warn('No messages, statuses, or flow completion found in webhook', {
        valueKeys: Object.keys(value),
        hasMessages: !!value.messages,
        hasStatuses: !!value.statuses,
        hasFlowCompletion: !!value.flow_completion
      });
      return null;
    } catch (error) {
      logger.error('Failed to parse webhook message', { 
        error: error.message,
        bodyKeys: Object.keys(body || {}),
        stack: error.stack
      });
      return null;
    }
  }

  extractMessageContent(message) {
    switch (message.type) {
      case 'text':
        return {
          text: message.text.body
        };
      case 'image':
        return {
          mediaId: message.image.id,
          caption: message.image.caption,
          mimeType: message.image.mime_type
        };
      case 'audio':
        return {
          mediaId: message.audio.id,
          mimeType: message.audio.mime_type
        };
      case 'video':
        return {
          mediaId: message.video.id,
          caption: message.video.caption,
          mimeType: message.video.mime_type
        };
      case 'document':
        return {
          mediaId: message.document.id,
          filename: message.document.filename,
          mimeType: message.document.mime_type
        };
      case 'interactive':
        if (message.interactive.type === 'button_reply') {
          return {
            buttonReply: {
              id: message.interactive.button_reply.id,
              title: message.interactive.button_reply.title
            },
            text: message.interactive.button_reply.title
          };
        } else if (message.interactive.type === 'list_reply') {
          return {
            listReply: {
              id: message.interactive.list_reply.id,
              title: message.interactive.list_reply.title,
              description: message.interactive.list_reply.description
            },
            text: message.interactive.list_reply.title
          };
        } else if (message.interactive.type === 'flow_reply') {
          return {
            flowReply: {
              id: message.interactive.flow_reply.id,
              title: message.interactive.flow_reply.title,
              response: message.interactive.flow_reply.response
            },
            text: `Flow response: ${message.interactive.flow_reply.title}`
          };
        }
        break;
      default:
        return { unsupported: true, type: message.type };
    }
  }

  // Predefined message templates
  getWelcomeMessage() {
    return `🎉 Welcome to MiiMii! 

I'm your financial assistant. Here's what I can help you with:

💰 *Transfer Money* - "Send 5000 to John 08012345678"
📱 *Buy Airtime* - "Buy 1000 airtime for 08012345678" 
📶 *Buy Data* - "Buy 2GB data for 08012345678"
⚡ *Pay Bills* - "Pay PHCN bill for meter 12345"
💳 *Check Balance* - "What's my balance?"
📊 *Transaction History* - "Show my transactions"

Just chat naturally and I'll understand! 

To get started, please complete your KYC by saying "Start KYC" or send your ID document.`;
  }

  getMenuMessage() {
    return {
      text: "What would you like to do today?",
      buttons: [
        { id: "balance", title: "💰 Check Balance" },
        { id: "transfer", title: "💸 Transfer Money" },
        { id: "services", title: "📱 Buy Services" }
      ]
    };
  }

  getServicesMenu() {
    return {
      text: "Choose a service:",
      buttonText: "Select Service",
      sections: [
        {
          title: "Mobile Services",
          rows: [
            { id: "airtime", title: "Buy Airtime", description: "Purchase airtime for any network" },
            { id: "data", title: "Buy Data", description: "Purchase data bundles" }
          ]
        },
        {
          title: "Bill Payments",
          rows: [
            { id: "electricity", title: "Electricity", description: "Pay PHCN/EKEDC bills" },
            { id: "cable", title: "Cable TV", description: "Pay DStv/GOtv/Startimes" },
            { id: "internet", title: "Internet", description: "Pay internet bills" }
          ]
        }
      ]
    };
  }

  // Enhanced Dynamic Welcome Message
  async getDynamicWelcomeMessage(userName = null, isReturningUser = false) {
    const currentHour = new Date().getHours();
    let greeting = '';

    if (currentHour < 12) {
      greeting = '🌅 Good morning';
    } else if (currentHour < 17) {
      greeting = '☀️ Good afternoon';
    } else {
      greeting = '🌙 Good evening';
    }

    const personalGreeting = userName ? `${greeting}, ${userName}!` : `${greeting}!`;
    
    if (isReturningUser) {
      return {
        text: `${personalGreeting}\n\n🎉 Welcome back to *MiiMii*!\n\nI'm ready to help you with your financial needs. What would you like to do today?`,
        buttons: [
          { id: 'check_balance', title: '💰 Check Balance' },
          { id: 'send_money', title: '💸 Send Money' },
          { id: 'services_menu', title: '📱 View Services' }
        ]
      };
    }

    // Dynamic tips based on time of day
    let timeTip = '';
    if (currentHour < 10) {
      timeTip = '☕ Start your day with smart financial management!';
    } else if (currentHour >= 17) {
      timeTip = '🌆 Evening transactions are processed instantly!';
    }

    return {
      text: `${personalGreeting}\n\n🎉 Welcome to *MiiMii* - Your Smart Financial Assistant!\n\n` +
            `I can help you with:\n` +
                          `💰 Send money to anyone instantly\n` +
              `📱 Buy airtime & data bundles\n` +
              `⚡ Pay utility bills seamlessly\n` +
              `💳 Manage your digital wallet\n` +
              `🏦 Check account balance & history\n\n` +
              `${timeTip ? timeTip + '\n\n' : ''}` +
              `Let's get you set up quickly! 🚀`,
       buttons: [
         { id: 'start_onboarding', title: '🚀 Get Started' },
         { id: 'learn_more', title: '📖 Learn More' },
         { id: 'help_support', title: '🆘 Need Help?' }
       ]
     };
   }

   // Interactive Onboarding Flow Templates
   getOnboardingFlowTemplates() {
     return {
       nameCollection: {
         type: 'flow',
         header: { type: 'text', text: '👤 Personal Information' },
         body: 'Let\'s start by collecting your basic information for account setup.',
         footer: 'Your data is secure and encrypted',
         flowId: 'name_collection_flow',
         flowCta: 'Enter Details',
         flowActionPayload: {
           screen: 'name_input',
           version: '1.0'
         }
       },
       
       kycDataCollection: {
         type: 'list',
         header: { type: 'text', text: '🆔 Identity Verification' },
         body: 'Choose how you\'d like to provide your verification documents:',
         action: {
           button: 'Select Option',
           sections: [
             {
               title: 'Document Upload',
               rows: [
                 { 
                   id: 'upload_id_card', 
                   title: '📄 Upload ID Card', 
                   description: 'Take a photo of your National ID, Driver\'s License, or International Passport' 
                 },
                 { 
                   id: 'upload_bvn_slip', 
                   title: '🏦 Upload BVN Slip', 
                   description: 'Take a photo of your Bank Verification Number slip' 
                 }
               ]
             },
             {
               title: 'Manual Entry',
               rows: [
                 { 
                   id: 'manual_kyc_entry', 
                   title: '⌨️ Type Information', 
                   description: 'Enter your details manually (Date of birth, BVN, Address)' 
                 },
                 { 
                   id: 'guided_kyc_flow', 
                   title: '🧭 Guided Setup', 
                   description: 'Step-by-step guided information collection' 
                 }
               ]
             }
           ]
         }
       },

       pinSetup: {
         type: 'button',
         body: '🔐 *Secure Your Account*\n\nYour account is almost ready! Create a 4-digit PIN to secure your transactions.\n\n✅ Your PIN will be encrypted\n✅ Used for transaction authorization\n✅ Can be changed anytime',
         action: {
           buttons: [
             { type: 'reply', reply: { id: 'create_pin_flow', title: '🔢 Create PIN' } },
             { type: 'reply', reply: { id: 'pin_requirements', title: 'ℹ️ PIN Requirements' } },
             { type: 'reply', reply: { id: 'security_info', title: '🛡️ Security Info' } }
           ]
         }
       }
     };
   }

   // Service Selection Menus
   getServiceMenus() {
     return {
       mainServices: {
         text: "What service would you like to use today?",
         buttonText: "Choose Service",
         sections: [
           {
             title: "💰 Money Services",
             rows: [
               { id: "send_money", title: "💸 Send Money", description: "Transfer to bank accounts or phone numbers" },
               { id: "request_money", title: "💵 Request Money", description: "Request payment from contacts" },
               { id: "check_balance", title: "📊 Check Balance", description: "View your wallet balance and limits" }
             ]
           },
           {
             title: "📱 Mobile Services",
             rows: [
               { id: "buy_airtime", title: "📞 Buy Airtime", description: "Purchase airtime for any network" },
               { id: "buy_data", title: "📶 Buy Data", description: "Purchase data bundles" },
               { id: "data_gifting", title: "🎁 Gift Data", description: "Send data to friends and family" }
             ]
           },
           {
             title: "⚡ Bill Payments",
             rows: [
               { id: "electricity_bills", title: "💡 Electricity", description: "Pay PHCN/EKEDC/Other electricity bills" },
               { id: "cable_tv_bills", title: "📺 Cable TV", description: "Pay DStv, GOtv, Startimes" },
               { id: "internet_bills", title: "🌐 Internet", description: "Pay internet and wifi bills" }
             ]
           }
         ]
       },

       quickActions: {
         text: "Quick actions for frequent tasks:",
         buttons: [
           { id: "repeat_last_transaction", title: "🔄 Repeat Last" },
           { id: "favourite_contacts", title: "⭐ Favourites" },
           { id: "transaction_history", title: "📋 History" }
         ]
       }
     };
   }
}

// Export an instance of the service instead of the class
module.exports = new WhatsAppService();
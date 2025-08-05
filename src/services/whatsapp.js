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
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) return null;

      // Handle status updates
      if (value.statuses) {
        return {
          type: 'status',
          statuses: value.statuses
        };
      }

      // Handle incoming messages
      if (value.messages) {
        const message = value.messages[0];
        const contact = value.contacts?.[0];

        return {
          type: 'message',
          messageId: message.id,
          from: message.from,
          timestamp: message.timestamp,
          messageType: message.type,
          contact: {
            name: contact?.profile?.name,
            waId: contact?.wa_id
          },
          message: this.extractMessageContent(message)
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to parse webhook message', { error: error.message, body });
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
            }
          };
        } else if (message.interactive.type === 'list_reply') {
          return {
            listReply: {
              id: message.interactive.list_reply.id,
              title: message.interactive.list_reply.title,
              description: message.interactive.list_reply.description
            }
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
}

module.exports = new WhatsAppService();
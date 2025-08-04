const axios = require('axios');
const logger = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.baseURL = `https://graph.facebook.com/v18.0/${this.phoneNumberId}`;
    this.verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'Verify_MiiMii';
  }

  async sendMessage(to, message, type = 'text') {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: type
      };

      if (type === 'text') {
        payload.text = { body: message };
      } else if (type === 'template') {
        payload.template = message;
      } else if (type === 'interactive') {
        payload.interactive = message;
      }

      const response = await axios.post(
        `${this.baseURL}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('WhatsApp message sent successfully', {
        to,
        messageId: response.data.messages[0].id
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        error: error.response?.data || error.message,
        to,
        message
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
      await axios.post(
        `${this.baseURL}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      logger.error('Failed to mark message as read', { error: error.message, messageId });
    }
  }

  async downloadMedia(mediaId) {
    try {
      // First get media URL
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const mediaUrl = mediaResponse.data.url;

      // Download the actual media
      const downloadResponse = await axios.get(mediaUrl, {
        headers: {
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
      logger.error('Failed to download media', { error: error.message, mediaId });
      throw error;
    }
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
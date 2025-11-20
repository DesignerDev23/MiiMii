const messageProcessor = require('./messageProcessor');
const { ChatMessage } = require('../models');
const logger = require('../utils/logger');

// Store captured messages per user session
const capturedMessages = new Map();

class MobileMessageProcessor {
  async sendMessage(user, messageText) {
    try {
      const text = (messageText || '').toString().trim();
      if (!text) {
        throw new Error('Message text is required');
      }

      // Require a phoneNumber/whatsappNumber so we can route through WhatsApp processor
      const phone = user.whatsappNumber;
      if (!phone) {
        throw new Error('User must have a phone number to use chat');
      }

      // Persist user message
      const userMessage = await ChatMessage.create({
        userId: user.id,
        role: 'user',
        channel: 'mobile',
        content: text,
        metadata: {
          source: 'mobile',
          direction: 'inbound'
        }
      });

      // Clear any previous captured messages for this user
      capturedMessages.set(user.id, []);

      // Create a message interceptor to capture WhatsApp service calls
      const whatsappService = require('./whatsapp');
      const originalSendText = whatsappService.sendTextMessage.bind(whatsappService);
      const originalSendButton = whatsappService.sendButtonMessage?.bind(whatsappService);
      const originalSendList = whatsappService.sendListMessage?.bind(whatsappService);

      // Intercept WhatsApp service calls to capture responses
      whatsappService.sendTextMessage = async (phoneNumber, message) => {
        if (phoneNumber === phone) {
          const messages = capturedMessages.get(user.id) || [];
          messages.push({ type: 'text', content: message });
          capturedMessages.set(user.id, messages);
        }
        // Don't actually send WhatsApp message for mobile requests
        return { success: true };
      };

      if (whatsappService.sendButtonMessage) {
        whatsappService.sendButtonMessage = async (phoneNumber, message, buttons) => {
          if (phoneNumber === phone) {
            const messages = capturedMessages.get(user.id) || [];
            messages.push({ type: 'buttons', content: message, buttons });
            capturedMessages.set(user.id, messages);
          }
          return { success: true };
        };
      }

      if (whatsappService.sendListMessage) {
        whatsappService.sendListMessage = async (phoneNumber, message, title, sections) => {
          if (phoneNumber === phone) {
            const messages = capturedMessages.get(user.id) || [];
            messages.push({ type: 'list', content: message, title, sections });
            capturedMessages.set(user.id, messages);
          }
          return { success: true };
        };
      }

      try {
        // Route through WhatsApp message processor (same flow, captures responses)
        // Create a parsed message structure that WhatsApp processor expects
        const parsedMessage = {
          from: phone,
          message: {
            text: text
          },
          messageType: 'text',
          contact: {
            profile: {
              name: user.firstName || user.whatsappNumber
            }
          },
          messageId: `mobile_${Date.now()}_${user.id}`
        };

        // Process through WhatsApp message processor (this will execute all actions)
        await messageProcessor.processIncomingMessage(parsedMessage);
      } finally {
        // Restore original WhatsApp service methods
        whatsappService.sendTextMessage = originalSendText;
        if (originalSendButton) whatsappService.sendButtonMessage = originalSendButton;
        if (originalSendList) whatsappService.sendListMessage = originalSendList;
      }

      // Get captured messages
      const messages = capturedMessages.get(user.id) || [];
      capturedMessages.delete(user.id);

      // Extract reply text and metadata from captured messages
      let replyText = "I'm having trouble understanding that right now. Please try again.";
      let intent = null;
      let requiresAction = null;
      let actionData = null;

      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        replyText = lastMessage.content || replyText;
        
        // If we have buttons, indicate action is required
        if (lastMessage.type === 'buttons' && lastMessage.buttons) {
          requiresAction = 'BUTTON_SELECTION';
          actionData = { buttons: lastMessage.buttons };
        }

        // If we have list, indicate action is required
        if (lastMessage.type === 'list' && lastMessage.sections) {
          requiresAction = 'LIST_SELECTION';
          actionData = { title: lastMessage.title, sections: lastMessage.sections };
        }
      }

      // Persist assistant reply
      const botMessage = await ChatMessage.create({
        userId: user.id,
        role: 'assistant',
        channel: 'mobile',
        content: replyText,
        metadata: {
          source: 'mobile',
          direction: 'outbound',
          intent,
          requiresAction,
          actionData,
          capturedMessages: messages
        }
      });

      return {
        success: true,
        reply: replyText,
        intent,
        requiresAction,
        actionData,
        userMessage,
        botMessage
      };
    } catch (error) {
      logger.error('Mobile chat processing failed', {
        error: error.message,
        userId: user.id,
        stack: error.stack
      });
      
      // Return error response instead of throwing
      return {
        success: false,
        reply: "I encountered an error processing your request. Please try again.",
        error: error.message
      };
    }
  }

  async getHistory(userId, options = {}) {
    const { limit = 50, before } = options;

    const where = {
      userId,
      channel: 'mobile'
    };

    if (before) {
      where.createdAt = { [require('sequelize').Op.lt]: new Date(before) };
    }

    const messages = await ChatMessage.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10)
    });

    // return in chronological order for UI
    return messages.reverse();
  }
}

module.exports = new MobileMessageProcessor();



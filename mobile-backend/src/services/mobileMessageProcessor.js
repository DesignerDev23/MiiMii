const messageProcessor = require('./messageProcessor');
const aiAssistantService = require('./aiAssistant');
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

      // Initialize response variables
      let replyText = "I'm having trouble understanding that right now. Please try again.";
      let intent = null;
      let requiresAction = null;
      let actionData = null;

      // Create a message interceptor to capture WhatsApp service calls
      const whatsappService = require('./whatsapp');
      const originalSendText = whatsappService.sendTextMessage?.bind(whatsappService);
      const originalSendButton = whatsappService.sendButtonMessage?.bind(whatsappService);
      const originalSendList = whatsappService.sendListMessage?.bind(whatsappService);
      const originalMarkRead = whatsappService.markMessageAsRead?.bind(whatsappService);
      const originalTyping = whatsappService.sendTypingIndicator?.bind(whatsappService);

      // Normalize phone numbers for comparison (handle both +234 and 234 formats)
      const normalizePhone = (phoneNum) => {
        if (!phoneNum) return null;
        const cleaned = String(phoneNum).replace(/\D/g, '');
        if (cleaned.startsWith('234') && cleaned.length === 13) {
          return `+${cleaned}`;
        }
        return phoneNum.startsWith('+') ? phoneNum : `+${cleaned}`;
      };
      
      const normalizedPhone = normalizePhone(phone);
      
      // Intercept WhatsApp service calls to capture responses ONLY for mobile requests
      // For WhatsApp messages (different phone numbers), call original methods
      if (whatsappService.sendTextMessage) {
        whatsappService.sendTextMessage = async (phoneNumber, message) => {
          // Normalize and compare phone numbers
          const normalizedTarget = normalizePhone(phoneNumber);
          // Only intercept if this is the mobile user's phone number
          if (normalizedTarget === normalizedPhone) {
            const messages = capturedMessages.get(user.id) || [];
            messages.push({ type: 'text', content: message });
            capturedMessages.set(user.id, messages);
            // Don't actually send WhatsApp message for mobile requests
            return { success: true };
          }
          // For WhatsApp messages, use original method
          return await originalSendText(phoneNumber, message);
        };
      }

      if (whatsappService.sendButtonMessage) {
        whatsappService.sendButtonMessage = async (phoneNumber, message, buttons) => {
          // Normalize and compare phone numbers
          const normalizedTarget = normalizePhone(phoneNumber);
          // Only intercept if this is the mobile user's phone number
          if (normalizedTarget === normalizedPhone) {
            const messages = capturedMessages.get(user.id) || [];
            messages.push({ type: 'buttons', content: message, buttons });
            capturedMessages.set(user.id, messages);
            return { success: true };
          }
          // For WhatsApp messages, use original method
          return await originalSendButton(phoneNumber, message, buttons);
        };
      }

      if (whatsappService.sendListMessage) {
        whatsappService.sendListMessage = async (phoneNumber, message, title, sections) => {
          // Normalize and compare phone numbers
          const normalizedTarget = normalizePhone(phoneNumber);
          // Only intercept if this is the mobile user's phone number
          if (normalizedTarget === normalizedPhone) {
            const messages = capturedMessages.get(user.id) || [];
            messages.push({ type: 'list', content: message, title, sections });
            capturedMessages.set(user.id, messages);
            return { success: true };
          }
          // For WhatsApp messages, use original method
          return await originalSendList(phoneNumber, message, title, sections);
        };
      }

      // Intercept mark as read and typing indicator - be more careful here
      if (whatsappService.markMessageAsRead) {
        whatsappService.markMessageAsRead = async (messageId) => {
          // For mobile requests, we don't need to mark as read
          // But we can't determine if it's mobile or WhatsApp from messageId alone
          // So we'll just skip it - WhatsApp messages will work because original is restored
          return { success: true };
        };
      }

      if (whatsappService.sendTypingIndicator) {
        whatsappService.sendTypingIndicator = async (phoneNumber, messageId, duration) => {
          // Normalize and compare phone numbers
          const normalizedTarget = normalizePhone(phoneNumber);
          // Only skip for mobile requests
          if (normalizedTarget === normalizedPhone) {
            return { success: true };
          }
          // For WhatsApp messages, use original method
          return await originalTyping(phoneNumber, messageId, duration);
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
        // Wrap in try-catch to handle any errors gracefully
        try {
          await messageProcessor.processIncomingMessage(parsedMessage);
        } catch (processorError) {
          logger.error('WhatsApp message processor error (mobile)', {
            error: processorError?.message || 'Unknown error',
            stack: processorError?.stack,
            userId: user.id,
            message: text,
            parsedMessage: JSON.stringify(parsedMessage),
            errorType: typeof processorError,
            errorKeys: processorError ? Object.keys(processorError) : []
          });
          // If processing fails, we'll use fallback below
          throw processorError;
        }
      } catch (processorError) {
        logger.error('Failed to process message through WhatsApp processor', {
          error: processorError?.message || 'Unknown error',
          stack: processorError?.stack,
          userId: user.id,
          message: text,
          errorType: typeof processorError
        });
        // Fallback: use AI analysis directly if WhatsApp processor fails
        try {
          const aiAnalysis = await aiAssistantService.analyzeUserIntent(text, user, null);
          if (aiAnalysis && aiAnalysis.intent && aiAnalysis.confidence > 0.7) {
            replyText = aiAnalysis.response || aiAnalysis.suggestedAction || replyText;
            intent = aiAnalysis.intent;
          }
        } catch (aiError) {
          logger.error('AI fallback also failed', { error: aiError?.message });
        }
      } finally {
        // CRITICAL: Always restore original WhatsApp service methods immediately
        // This ensures WhatsApp messages work even if mobile processing is ongoing
        try {
          if (originalSendText) whatsappService.sendTextMessage = originalSendText;
          if (originalSendButton) whatsappService.sendButtonMessage = originalSendButton;
          if (originalSendList) whatsappService.sendListMessage = originalSendList;
          if (originalMarkRead) whatsappService.markMessageAsRead = originalMarkRead;
          if (originalTyping) whatsappService.sendTypingIndicator = originalTyping;
        } catch (restoreError) {
          logger.error('Failed to restore WhatsApp service methods', {
            error: restoreError?.message || 'Unknown error',
            userId: user.id
          });
          // Force restore even if there's an error
          try {
            whatsappService.sendTextMessage = originalSendText;
            whatsappService.sendButtonMessage = originalSendButton;
            whatsappService.sendListMessage = originalSendList;
            whatsappService.markMessageAsRead = originalMarkRead;
            whatsappService.sendTypingIndicator = originalTyping;
          } catch (forceRestoreError) {
            logger.error('Force restore also failed', { error: forceRestoreError?.message });
          }
        }
      }

      // Get captured messages
      const messages = capturedMessages.get(user.id) || [];
      capturedMessages.delete(user.id);

      // Extract reply text and metadata from captured messages
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



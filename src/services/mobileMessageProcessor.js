const aiAssistantService = require('./aiAssistant');
const { ChatMessage } = require('../models');
const logger = require('../utils/logger');

class MobileMessageProcessor {
  async sendMessage(user, messageText) {
    try {
      const text = (messageText || '').toString().trim();
      if (!text) {
        throw new Error('Message text is required');
      }

      // Require a phoneNumber/whatsappNumber so AI assistant can reuse existing flow logic
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

      // Route through AI assistant (same engine as WhatsApp)
      const aiResult = await aiAssistantService.processUserMessage(phone, text, 'text');

      let replyText = "I'm having trouble understanding that right now. Please try again.";
      let intent = null;
      let rawResult = null;

      if (aiResult && aiResult.success && aiResult.result) {
        rawResult = aiResult.result;
        replyText = aiResult.result.message || aiResult.result.result?.message || replyText;
        intent = aiResult.result.intent || aiResult.result.result?.intent || null;
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
          aiResult: rawResult
        }
      });

      return {
        userMessage,
        botMessage,
        intent,
        rawResult
      };
    } catch (error) {
      logger.error('Mobile chat processing failed', {
        error: error.message,
        userId: user.id
      });
      throw error;
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



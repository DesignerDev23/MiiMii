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

      // Handle different response structures
      if (aiResult) {
        logger.info('AI result received', { 
          userId: user.id,
          hasSuccess: !!aiResult.success,
          hasResult: !!aiResult.result,
          hasMessage: !!aiResult.message,
          hasUserFriendlyResponse: !!aiResult.userFriendlyResponse,
          hasError: !!aiResult.error,
          resultType: aiResult.result ? typeof aiResult.result : 'null',
          resultKeys: aiResult.result && typeof aiResult.result === 'object' ? Object.keys(aiResult.result) : null,
          fullResult: JSON.stringify(aiResult).substring(0, 500) // First 500 chars for debugging
        });

        // Case 1: Success response with result object (normal flow)
        if (aiResult.success === true && aiResult.result) {
          rawResult = aiResult.result;
          // Handle nested message structures
          replyText = aiResult.result.message || 
                     (aiResult.result.result && aiResult.result.result.message) ||
                     replyText;
          intent = aiResult.result.intent || 
                  (aiResult.result.result && aiResult.result.result.intent) ||
                  null;
          logger.info('Using success result', { replyText: replyText.substring(0, 100), intent });
        }
        // Case 2: Direct result (from handleConversationFlow - returns intentResult directly)
        else if (aiResult.message) {
          rawResult = aiResult;
          replyText = aiResult.message;
          intent = aiResult.intent || null;
          logger.info('Using direct message result', { replyText: replyText.substring(0, 100), intent });
        }
        // Case 3: Error response with user-friendly message (AI processing failed)
        else if (aiResult.userFriendlyResponse) {
          replyText = aiResult.userFriendlyResponse;
          logger.warn('AI processing failed - using user-friendly error response', { 
            error: aiResult.error,
            success: aiResult.success,
            replyText: replyText.substring(0, 100)
          });
        }
        // Case 4: Error response
        else if (aiResult.error) {
          replyText = aiResult.error;
          logger.warn('Using error response', { replyText: replyText.substring(0, 100) });
        } 
        // Case 5: Success but no result (shouldn't happen, but handle gracefully)
        else if (aiResult.success === true) {
          logger.warn('Success but no result object', { 
            keys: Object.keys(aiResult),
            result: JSON.stringify(aiResult).substring(0, 200)
          });
          replyText = "I received your message but couldn't process it. Please try again.";
        } else {
          logger.warn('AI result structure not recognized', { 
            keys: Object.keys(aiResult),
            success: aiResult.success,
            result: JSON.stringify(aiResult).substring(0, 200)
          });
        }
      } else {
        logger.warn('AI result is null or undefined', { userId: user.id, message: text });
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



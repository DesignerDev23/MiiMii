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

      // Check if user is in a conversation flow (same as WhatsApp)
      if (user.conversationState && user.conversationState.awaitingInput) {
        try {
          const result = await aiAssistantService.handleConversationFlow(user, text, user.conversationState);
          if (result && result.message) {
            const botMessage = await ChatMessage.create({
              userId: user.id,
              role: 'assistant',
              channel: 'mobile',
              content: result.message,
              metadata: {
                source: 'mobile',
                direction: 'outbound',
                intent: result.intent,
                requiresAction: result.requiresAction,
                actionData: result.actionData
              }
            });

            return {
              success: true,
              reply: result.message,
              intent: result.intent,
              requiresAction: result.requiresAction,
              actionData: result.actionData,
              userMessage,
              botMessage
            };
          }
        } catch (flowErr) {
          logger.error('Conversation flow handling failed (mobile)', { 
            error: flowErr.message, 
            userId: user.id, 
            awaitingInput: user.conversationState?.awaitingInput 
          });
        }
      }

      // Use the same AI analysis as WhatsApp (analyzeUserIntent)
      const aiAnalysis = await aiAssistantService.analyzeUserIntent(text, user, null);
      
      logger.info('AI intent analysis result (mobile)', {
        userId: user.id,
        originalMessage: text,
        detectedIntent: aiAnalysis.intent,
        confidence: aiAnalysis.confidence,
        suggestedAction: aiAnalysis.suggestedAction
      });

      let replyText = "I'm having trouble understanding that right now. Please try again.";
      let intent = null;
      let requiresAction = null;
      let actionData = null;

      // Handle the AI analysis result (same logic as WhatsApp)
      if (aiAnalysis.intent && aiAnalysis.confidence > 0.7) {
        intent = aiAnalysis.intent;

        // Handle different intents (same as WhatsApp but return JSON instead of sending messages)
        switch (aiAnalysis.intent) {
          case 'transaction_history':
            const historyResult = await aiAssistantService.handleTransactionHistory(user, aiAnalysis.extractedData);
            replyText = historyResult.message || 'Here is your transaction history.';
            break;
            
          case 'balance':
          case 'balance_inquiry':
            const balanceResult = await aiAssistantService.handleBalanceInquiry(user);
            replyText = balanceResult.message || 'Here is your balance.';
            break;
            
          case 'wallet_details':
          case 'account_info':
          case 'account_details':
            const walletResult = await aiAssistantService.handleWalletDetails(user);
            replyText = walletResult.message || 'Here are your account details.';
            break;
            
          case 'transfer_limits':
            const limitsResult = await aiAssistantService.handleTransferLimits(user);
            replyText = limitsResult.message || 'Here are your transfer limits.';
            break;
            
          case 'bank_transfer':
          case 'transfer':
            // Process intent and return JSON response for mobile
            const transferResult = await aiAssistantService.processIntent(aiAnalysis, user, text);
            replyText = transferResult.message || 'I can help you transfer money.';
            requiresAction = transferResult.requiresAction;
            actionData = transferResult.actionData;
            break;
            
          case 'airtime':
            const airtimeResult = await aiAssistantService.processIntent(aiAnalysis, user, text);
            replyText = airtimeResult.message || 'I can help you buy airtime.';
            requiresAction = airtimeResult.requiresAction;
            actionData = airtimeResult.actionData;
            break;
            
          case 'data':
            const dataResult = await aiAssistantService.processIntent(aiAnalysis, user, text);
            replyText = dataResult.message || 'I can help you buy data.';
            requiresAction = dataResult.requiresAction;
            actionData = dataResult.actionData;
            break;
            
          case 'bills':
            const billsResult = await aiAssistantService.processIntent(aiAnalysis, user, text);
            replyText = billsResult.message || 'I can help you pay bills.';
            requiresAction = billsResult.requiresAction;
            actionData = billsResult.actionData;
            break;
            
          case 'help':
            replyText = `❓ *Help & Support*\n\nI'm here to help! Here's what I can do:\n\n💰 *Account Management*\n• Check balance\n• View transactions\n• Account details\n\n💸 *Money Services*\n• Send money\n• Buy airtime\n• Buy data\n• Pay bills\n\n📞 *Support*\n• Contact support\n• Report issues\n\nJust tell me what you need!`;
            break;
            
          case 'menu':
            replyText = `📋 *MiiMii Services Menu*\n\n💰 *Money*\n• Check balance\n• Send money\n• Transaction history\n\n📱 *Airtime & Data*\n• Buy airtime\n• Buy data bundles\n• Data subscriptions\n\n💳 *Bills & Utilities*\n• Pay electricity\n• Pay water\n• Pay other bills\n\n📊 *Account*\n• Account details\n• Virtual account info\n\n❓ *Support*\n• Get help\n• Contact support\n\nJust say what you need!`;
            break;
            
          case 'greeting':
            replyText = `Hello ${user.firstName || 'there'}! 👋\n\nI'm MiiMii, your financial assistant. I can help you with:\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do today?`;
            break;
            
          case 'beneficiaries':
            const beneficiariesResult = await aiAssistantService.handleBeneficiariesList(user);
            replyText = beneficiariesResult.message || 'Here are your beneficiaries.';
            break;
            
          default:
            // If AI couldn't determine intent, use the AI's response
            replyText = aiAnalysis.response || aiAnalysis.suggestedAction || replyText;
        }
      } else {
        // If AI couldn't determine intent, use the AI's response
        replyText = aiAnalysis.response || aiAnalysis.suggestedAction || replyText;
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
          aiAnalysis
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



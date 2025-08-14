const userService = require('./user');
const onboardingService = require('./onboarding');
const whatsappService = require('./whatsapp');
const aiAssistantService = require('./aiAssistant');
const whatsappFlowService = require('./whatsappFlowService');
const bellbankService = require('./bellbank');
const { ActivityLog } = require('../models');
const logger = require('../utils/logger');
const activityLogger = require('./activityLogger');

class MessageProcessor {
  async processIncomingMessage(parsedMessage) {
    try {
      const { from, message, messageType, contact, messageId } = parsedMessage;
      
      // Get user's WhatsApp profile name
      const userName = contact?.profile?.name || 'there';
      
      // Get or create user with proper parameters
      const user = await userService.getOrCreateUser(from, userName);
      // Mark as read + typing indicator to improve UX while processing
      try {
        const whatsappService = require('./whatsapp');
        await whatsappService.markMessageAsRead(messageId);
        await whatsappService.sendTypingIndicator(from, messageId, 3000);
      } catch (e) {
        // Non-fatal
      }

      // Daily login: if user onboarded, require PIN once every 24h
      try {
        const redisClient = require('../utils/redis');
        if (user.onboardingStep === 'completed') {
          const sessionKey = `auth:${user.id}`;
          const hasSession = await redisClient.get(sessionKey);
          if (!hasSession && user.conversationState?.awaitingInput !== 'login_pin') {
            await user.updateConversationState({ awaitingInput: 'login_pin', context: 'daily_login' });
            const whatsappService = require('./whatsapp');
            await whatsappService.sendTextMessage(user.whatsappNumber, '🔐 Please enter your 4-digit PIN to unlock your session.');
            return;
          }
          if (user.conversationState?.awaitingInput === 'login_pin') {
            const pin = (message?.text || '').replace(/\D/g, '');
            if (!/^\d{4}$/.test(pin)) {
              const whatsappService = require('./whatsapp');
              await whatsappService.sendTextMessage(user.whatsappNumber, '❌ Invalid PIN. Please enter exactly 4 digits.');
              return;
            }
            try {
              const userService = require('./user');
              await userService.validateUserPin(user.id, pin);
              await redisClient.set(`auth:${user.id}`, { ok: true }, 86400);
              await user.clearConversationState();
              const whatsappService = require('./whatsapp');
              await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Login successful. How can I help you today?');
            } catch (e) {
              const whatsappService = require('./whatsapp');
              await whatsappService.sendTextMessage(user.whatsappNumber, e.message || '❌ Incorrect PIN. Try again.');
            }
            return;
          }
        }
      } catch (_) {}

      // If this is a Flow completion (nfm_reply), process immediately (bypass AI)
      if (messageType === 'interactive' && message?.flowResponse?.responseJson) {
        const flowData = { ...message.flowResponse.responseJson };
        // Enrich with phone number for downstream services
        flowData.phoneNumber = user.whatsappNumber;

        const whatsappFlowService = require('./whatsappFlowService');
        const result = await whatsappFlowService.processFlowData(flowData, user.whatsappNumber);

        if (result.success) {
          // If onboarding just completed, send bank details to user
          const refreshedUser = await userService.getUserById(user.id);
          const walletService = require('./wallet');
          const wallet = await walletService.getUserWallet(user.id);
          if (refreshedUser.onboardingStep === 'completed' && wallet?.virtualAccountNumber) {
            const accountMessage = `📋 *Your Bank Details*\n\n` +
                                   `💳 Account Number: ${wallet.virtualAccountNumber}\n` +
                                   `🏦 Bank: ${wallet.virtualAccountBank}\n` +
                                   `👤 Account Name: ${wallet.virtualAccountName}`;
            const whatsappService = require('./whatsapp');
            await whatsappService.sendTextMessage(user.whatsappNumber, accountMessage);
          }
        } else if (result.error) {
          const whatsappService = require('./whatsapp');
          await whatsappService.sendTextMessage(user.whatsappNumber, result.error);
        }
        return;
      }

      // Extract the actual message content for AI routing
      const messageContent = message?.text || message?.buttonReply?.title || '';

      // Handle ongoing bank transfer conversation (confirmation and PIN)
      if (user.conversationState?.intent === 'bank_transfer') {
        const state = user.conversationState;
        const whatsappService = require('./whatsapp');
        const bankTransferService = require('./bankTransfer');

        // Confirmation step
        if (state.awaitingInput === 'confirm_transfer') {
          const lower = (messageContent || '').toLowerCase();
          if (/(^|\b)(yes|y|confirm|ok|sure)(\b|$)/.test(lower)) {
            await user.updateConversationState({ awaitingInput: 'pin_for_transfer', step: 2 });
            await whatsappService.sendTextMessage(user.whatsappNumber, '🔐 Please enter your 4-digit transaction PIN to confirm.');
            return;
          }
          if (/(^|\b)(no|n|cancel|stop)(\b|$)/.test(lower)) {
            await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Transfer cancelled. To try again, send: "Send 5000 to 00308267834627 bellbank"');
            await user.clearConversationState();
            return;
          }
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please reply YES to confirm or NO to cancel.');
          return;
        }

        // PIN entry step
        if (state.awaitingInput === 'pin_for_transfer') {
          const pin = (messageContent || '').replace(/\D/g, '');
          if (!/^\d{4}$/.test(pin)) {
            await whatsappService.sendTextMessage(user.whatsappNumber, '❌ Invalid PIN format. Please enter exactly 4 digits.');
            return;
          }
          try {
            const transferData = {
              accountNumber: state.data.accountNumber,
              bankCode: state.data.bankCode,
              amount: state.data.amount,
              narration: state.data.narration || 'Wallet transfer',
              reference: state.data.reference
            };
            const result = await bankTransferService.processBankTransfer(user.id, transferData, pin);
            if (result.success) {
              // Don't send message here - let the bellbank service handle completion messages
              // This prevents duplicate messages when transfer completes via webhook
              logger.info('Transfer initiated successfully, waiting for completion notification', {
                userId: user.id,
                reference: result.transaction.reference
              });
            } else {
              await whatsappService.sendTextMessage(user.whatsappNumber, `❌ Transfer failed: ${result.message || 'Unknown error'}`);
            }
          } catch (err) {
            // Provide user-friendly error messages
            let errorMessage = "❌ Transfer failed. Please try again or contact support if the issue persists.";
            
            if (err.message.includes('Insufficient')) {
              errorMessage = err.message; // Use the detailed balance error message
            } else if (err.message.includes('Failed To Fecth Account Info')) {
              errorMessage = "❌ The account number could not be found. Please check the account number and bank name, then try again.";
            } else if (err.message.includes('could not be found in')) {
              errorMessage = err.message; // Use the user-friendly message from bankTransfer service
            } else if (err.message.includes('Invalid bank account')) {
              errorMessage = "❌ Invalid account details. Please check the account number and bank name.";
            } else if (err.message.includes('Transfer limit')) {
              errorMessage = "❌ Transfer limit exceeded. Please try a smaller amount or contact support.";
            } else if (err.message.includes('PIN')) {
              errorMessage = "❌ Invalid PIN. Please check your PIN and try again.";
            }
            
            await whatsappService.sendTextMessage(user.whatsappNumber, errorMessage);
          } finally {
            await user.clearConversationState();
          }
          return;
        }
      }
      
      // Log the incoming message
      logger.info('Processing incoming message', {
        userId: user.id,
        phoneNumber: from,
        messageType,
        messageId,
        userName,
        messageContent: messageContent || 'No text content',
        conversationState: user.conversationState
      });

      // Analyze user message with AI to determine intent
      const aiAssistant = require('./aiAssistant');
      const intentAnalysis = await aiAssistant.analyzeUserIntent(messageContent, user);

      // If user is already onboarded, never route to onboarding
      if (user.onboardingStep === 'completed' && intentAnalysis.intent === 'onboarding') {
        intentAnalysis.intent = 'menu';
        intentAnalysis.suggestedAction = 'Show available services';
      }
      
      logger.info('AI intent analysis result', {
            userId: user.id,
        originalMessage: messageContent,
        detectedIntent: intentAnalysis.intent,
        confidence: intentAnalysis.confidence,
        suggestedAction: intentAnalysis.suggestedAction
      });

      // Route based on AI analysis
      switch (intentAnalysis.intent) {
        case 'onboarding':
        case 'start_onboarding':
        case 'setup_account':
          return await this.handleOnboardingIntent(user, userName, message, messageType, messageId);
          
        case 'balance':
        case 'check_balance':
        case 'account_balance':
        case 'balance_inquiry':
          return await this.handleBalanceIntent(user, message, messageType, messageId);
          
        case 'transfer':
        case 'send_money':
        case 'bank_transfer':
          return await this.handleTransferIntent(user, message, messageType, messageId);
          
        case 'airtime':
        case 'buy_airtime':
        case 'recharge':
          return await this.handleAirtimeIntent(user, message, messageType, messageId);
          
        case 'data':
        case 'buy_data':
        case 'internet':
          return await this.handleDataIntent(user, message, messageType, messageId);
          
        case 'bills':
        case 'pay_bills':
        case 'utility':
          return await this.handleBillsIntent(user, message, messageType, messageId);
          
        case 'help':
        case 'support':
        case 'customer_service':
          return await this.handleHelpIntent(user, message, messageType, messageId);
          
        case 'menu':
        case 'services':
        case 'options':
          return await this.handleMenuIntent(user, message, messageType, messageId);
          
        case 'account_details':
        case 'virtual_account':
        case 'account_info':
          return await this.handleAccountDetailsIntent(user, message, messageType, messageId);
          
        case 'transaction_history':
        case 'transactions':
        case 'history':
          return await this.handleTransactionHistoryIntent(user, message, messageType, messageId);
          
        default:
          // Check if user is awaiting PIN verification
          if (user.conversationState?.awaitingInput === 'pin_verification' || user.conversationState?.awaitingInput === 'pin_for_transfer') {
            logger.info('PIN verification detected in main switch', {
              userId: user.id,
              conversationState: user.conversationState,
              awaitingInput: user.conversationState?.awaitingInput,
              hasData: !!user.conversationState?.data,
              hasAmount: !!user.conversationState?.data?.amount,
              hasAccountNumber: !!user.conversationState?.data?.accountNumber,
              hasPhoneNumber: !!user.conversationState?.data?.phoneNumber
            });
            
            // Check if we have valid transfer data (either accountNumber for bank transfers or phoneNumber for P2P transfers)
            const hasValidTransferData = user.conversationState?.data?.amount && 
              (user.conversationState?.data?.accountNumber || user.conversationState?.data?.phoneNumber);
            
            if (hasValidTransferData) {
              return await this.handlePinVerification(user, message, messageType);
            } else {
              // Clear invalid conversation state and ask user to start over
              await user.updateConversationState(null);
              const whatsappService = require('./whatsapp');
              await whatsappService.sendTextMessage(user.whatsappNumber, 
                "I couldn't find your transfer details. Please try your transfer request again.");
              return;
            }
          }
          
          // If AI couldn't determine intent, try traditional processing
          return await this.processMessageByType(user, userName, message, messageType, messageId);
      }

    } catch (error) {
      logger.error('Failed to process incoming message', {
        error: error.message, 
        parsedMessage
      });
      
      // Send error message to user
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(parsedMessage.from, 
        "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.");
    }
  }

  // Restore personalized welcome method - we want AI-generated personalized messages
  async sendPersonalizedWelcome(user, message, messageType, messageId = null) {
    try {
      const userName = user.firstName || user.lastName || 'there';
      
      // Start typing indicator if messageId is provided
      if (messageId) {
        await whatsappService.sendTypingIndicator(user.whatsappNumber, messageId, 2000);
      }
      
      // Send welcome flow message with the verified Flow ID
      await whatsappService.sendWelcomeFlowMessage(user.whatsappNumber, userName, messageId);
      
      // Update user onboarding step
      await user.update({ onboardingStep: 'greeting' });
      
      logger.info('Sent welcome flow message', {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        userName: userName,
        messageId: messageId,
        flowId: '1223628202852216'
      });
      
    } catch (error) {
      logger.error('Failed to send welcome flow message', {
        error: error.message,
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        messageId: messageId
      });
      
      // Fallback to button message if flow fails
      try {
        const aiAssistant = require('./aiAssistant');
        const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
        
        const buttons = [
          { id: 'start_onboarding', title: '🚀 Start Setup' },
          { id: 'learn_more', title: '📚 Learn More' },
          { id: 'get_help', title: '❓ Get Help' }
        ];
        
        await whatsappService.sendButtonMessage(user.whatsappNumber, personalizedMessage, buttons);
        
        logger.info('Sent fallback welcome message', {
          userId: user.id,
          phoneNumber: user.whatsappNumber,
          userName: userName
        });
      } catch (fallbackError) {
        logger.error('Failed to send fallback welcome message', {
          error: fallbackError.message,
          userId: user.id,
          phoneNumber: user.whatsappNumber
        });
      }
    }
  }

  async sendLoginFlow(user, userName) {
    try {
      const whatsappFlowService = require('./whatsappFlowService');
      
      // Generate a secure flow token
      const flowToken = whatsappFlowService.generateFlowToken(user.id, 'pin_verification');
      
      // Get AI-generated personalized welcome message
      const aiAssistant = require('./aiAssistant');
      const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
      
      // Create the login flow data with AI-generated personalized message
      const flowData = {
        flowId: process.env.WHATSAPP_LOGIN_FLOW_ID || 'miimii_login_flow',
        flowToken: flowToken,
        flowCta: 'Login with PIN',
        header: {
          type: 'text',
          text: 'Welcome Back!'
        },
        body: personalizedMessage, // Use AI-generated personalized message
        footer: 'Secure Login',
        flowActionPayload: {}  // Empty payload to avoid WhatsApp API errors
      };

      // Send the Flow message
      await whatsappService.sendTypingIndicator(user.whatsappNumber, 1500);
      await whatsappFlowService.sendFlowMessage(user.whatsappNumber, flowData);
      
      logger.info('Sent login flow to returning user', {
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
      
    } catch (error) {
      logger.error('Failed to send login flow', {
        error: error.message,
        userId: user.id
      });
      
      // Fallback to AI-generated button message if flow fails
      const aiAssistant = require('./aiAssistant');
      const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
      
      const buttons = [
        { id: 'view_balance', title: '💰 Check Balance' },
        { id: 'send_money', title: '💸 Send Money' },
        { id: 'pay_bills', title: '📱 Pay Bills' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, personalizedMessage, buttons);
    }
  }

  async sendOnboardingFlow(user, userName, messageId = null) {
    try {
      // Send welcome flow message with the verified Flow ID
      await whatsappService.sendWelcomeFlowMessage(user.whatsappNumber, userName, messageId);
      
      // Update user onboarding step
      await user.update({ onboardingStep: 'flow_onboarding' });
      
      logger.info('Sent welcome flow to new user', {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        userName: userName,
        messageId: messageId,
        flowId: '1223628202852216'
      });
      
    } catch (error) {
      logger.error('Failed to send welcome flow', {
        error: error.message,
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        messageId: messageId
      });
      
      // Fallback to interactive buttons if flow fails
      const fallbackText = `Hey ${userName}! 👋 I'm MiiMii, your financial assistant. Let's get you set up with your account. This will only take a few minutes.`;
        
      const buttons = [
        { id: 'start_onboarding', title: '🚀 Start Setup' },
        { id: 'learn_more', title: '📚 Learn More' },
        { id: 'get_help', title: '❓ Get Help' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, fallbackText, buttons);
      
      // Update user onboarding step
      await user.update({ onboardingStep: 'greeting' });
    }
  }

  async handleProcessingError(phoneNumber, error) {
    try {
      // Only send error message if WhatsApp service is configured
      if (!whatsappService.isConfigured()) {
        logger.error('Cannot send error message - WhatsApp service not configured', {
          phoneNumber,
          service: 'miimii-api'
        });
        return;
      }

      const isAuthError = error.message?.includes('Authentication failed') ||
                         error.message?.includes('invalid or expired access token') ||
                         error.message?.includes('Invalid OAuth access token');
      
      if (isAuthError) {
        logger.error('Cannot send error message due to authentication issues', {
          phoneNumber,
          service: 'miimii-api'
        });
        return;
      }

      await whatsappService.sendTextMessage(
        phoneNumber,
        "I'm experiencing technical difficulties. Please try again in a moment or contact support if the issue persists."
      );
    } catch (sendError) {
      logger.error('Failed to send error message', { 
        error: sendError.message, 
        phoneNumber,
        service: 'miimii-api'
      });
    }
  }

  async handleOnboardingFlow(user, message, messageType, contactName = null, messageId = null) {
    try {
      // Check if this is a button response for onboarding
      const buttonId = message?.buttonReply?.id || message?.listReply?.id;
      
      if (buttonId === 'complete_onboarding') {
        // Get user name for flow
        let userName = 'there';
        if (user.fullName) {
          userName = user.fullName;
        } else if (user.firstName) {
          userName = user.firstName;
        }
        return await this.sendOnboardingFlow(user, userName);
      }
      
      if (buttonId === 'learn_more') {
        return await this.sendLearnMoreMessage(user);
      }
      
      if (buttonId === 'get_help') {
        return await this.sendHelpMessage(user);
      }

      // For new users, send the welcome message with Flow onboarding option
      if (user.onboardingStep === 'initial' || user.onboardingStep === 'greeting') {
        return await this.sendPersonalizedWelcome(user, message, messageType, messageId);
      }

      // For users in traditional onboarding, continue with existing flow
      return await onboardingService.handleOnboarding(user.whatsappNumber, message, messageType, contactName);
    } catch (error) {
      logger.error('Onboarding flow error', { error: error.message, userId: user.id });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I'm experiencing technical difficulties. Please try again in a moment."
      );
    }
  }

  async startFlowBasedOnboarding(user) {
    try {
      const whatsappFlowService = require('./whatsappFlowService');
      
      // Check if we have a valid flow ID configured
      const config = require('../config');
      const flowId = config.getWhatsappConfig().onboardingFlowId;
      if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow' || flowId === 'DISABLED_FOR_LOCAL_DEV') {
        logger.warn('WhatsApp Flow ID not configured or disabled for flow-based onboarding, skipping', {
          userId: user.id,
          configuredFlowId: flowId
        });
        return { success: false, error: 'Flow ID not configured or disabled for local development' };
      }
      
      // Generate a secure flow token
      const flowToken = whatsappFlowService.generateFlowToken(user.id);
      
      // Get AI-generated personalized welcome message
      const aiAssistant = require('./aiAssistant');
      const userName = user.fullName || user.firstName || 'there';
      const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
      
      // Create the flow data with AI-generated personalized message
      const flowData = {
        flowId: flowId,
        flowToken: flowToken,
        flowCta: 'Complete Onboarding',
        flowAction: 'navigate',
        header: {
          type: 'text',
          text: 'MiiMii Account Setup'
        },
        body: personalizedMessage, // Use AI-generated personalized message
        footer: 'Secure • Fast • Easy',
        flowActionPayload: {
          screen: 'QUESTION_ONE',
          data: {
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            step: 'personal_details'
          }
        }
      };

      // Send the Flow message using the configured Flow ID
      await whatsappService.sendTypingIndicator(user.whatsappNumber, 2000);
      await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);
      
      // Update user onboarding step
      await user.update({ onboardingStep: 'flow_onboarding' });
      
      logger.info('Started Flow-based onboarding', {
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
      
    } catch (error) {
      logger.error('Failed to start Flow-based onboarding', {
        error: error.message,
        userId: user.id
      });
      
      // Fallback to traditional onboarding
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I'll help you set up your account step by step. Let's start with your name."
      );
    }
  }

  async sendLearnMoreMessage(user) {
    try {
      const learnMoreText = `📖 *About MiiMii* 📖\n\n` +
                           `🏦 *Digital Banking Made Simple*\n` +
                           `• Send and receive money instantly\n` +
                           `• Pay bills and buy airtime\n` +
                           `• Save money with our savings plans\n` +
                           `• Get virtual cards for online shopping\n\n` +
                           `🔐 *Secure & Licensed*\n` +
                           `• Bank-level security\n` +
                           `• Licensed by regulatory authorities\n` +
                           `• Your money is safe with us\n\n` +
                           `Ready to get started?`;
      
      const learnButtons = [
        { id: 'complete_onboarding', title: '✅ Complete Setup' },
        { id: 'contact_support', title: '📞 Contact Support' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, learnMoreText, learnButtons);
      
    } catch (error) {
      logger.error('Failed to send learn more message', {
        error: error.message,
        userId: user.id
      });
    }
  }

  async sendHelpMessage(user) {
    try {
      const helpText = `❓ *Need Help?* ❓\n\n` +
                      `I'm here to help you with:\n\n` +
                      `📞 *Contact Support*\n` +
                      `• WhatsApp: +234 XXX XXX XXXX\n` +
                      `• Email: support@miimii.com\n` +
                      `• Hours: 8AM - 8PM (WAT)\n\n` +
                      `📚 *Quick Start Guide*\n` +
                      `• Complete onboarding to get started\n` +
                      `• Add money to your wallet\n` +
                      `• Start sending and receiving money\n\n` +
                      `Would you like to continue with setup?`;
      
      const helpButtons = [
        { id: 'complete_onboarding', title: '✅ Continue Setup' },
        { id: 'contact_support', title: '📞 Contact Support' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, helpText, helpButtons);
      
    } catch (error) {
      logger.error('Failed to send help message', {
        error: error.message,
        userId: user.id
      });
    }
  }

  async handleCompletedUserMessage(user, message, messageType) {
    try {
      // Get user's name for personalization
      const userName = user.firstName || user.lastName || 'there';
      
      // Process different message types
      let processedText = '';
      let extractedData = null;

      switch (messageType) {
        case 'text':
          processedText = message.text;
          break;
          
        case 'audio':
          processedText = await this.processVoiceMessage(message.mediaId, user);
          break;
          
        case 'image':
          const { text, data } = await this.processImageMessage(message.mediaId, message.caption, user);
          processedText = text;
          extractedData = data;
          break;
          
        case 'document':
          processedText = await this.processDocumentMessage(message.mediaId, message.filename, user);
          break;
          
        case 'interactive':
          const interactiveResult = this.processInteractiveMessage(message);
          if (interactiveResult) {
            processedText = interactiveResult.text;
            if (interactiveResult.buttonReply) {
              // For button replies, we might want to store state or pass data
              // For now, we'll just pass the text and the button reply
              await this.storeConversationState(user, {
                intent: 'button_reply',
                context: 'button_reply',
                step: 1,
                data: { buttonReply: interactiveResult.buttonReply }
              });
            } else if (interactiveResult.listReply) {
              // For list replies, we might want to store state or pass data
              // For now, we'll just pass the text and the list reply
              await this.storeConversationState(user, {
                intent: 'list_reply',
                context: 'list_reply',
                step: 1,
                data: { listReply: interactiveResult.listReply }
              });
            }
          }
          break;
          
        default:
          await whatsappService.sendTextMessage(
            user.whatsappNumber, 
            "I can understand text, voice notes, and images. Please send your request in one of these formats."
          );
          return;
      }

      if (!processedText) {
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          "I couldn't understand your message. Please try again or type 'help' for assistance."
        );
        return;
      }

      // Log processed message
      await ActivityLog.logUserActivity(
        user.id,
        'whatsapp_message_received',
        'message_processed',
        {
          source: 'whatsapp',
          description: `Processed ${messageType} message successfully`,
          messageType,
          hasExtractedData: !!extractedData
        }
      );

      // Process with AI Assistant for intent recognition and response
      const aiAssistant = require('./aiAssistant');
      const aiAnalysis = await aiAssistant.analyzeUserIntent(processedText, user);
      
      logger.info('AI intent analysis result', {
        userId: user.id,
        originalMessage: processedText,
        detectedIntent: aiAnalysis.intent,
        confidence: aiAnalysis.confidence,
        suggestedAction: aiAnalysis.suggestedAction
      });

      // Handle the AI analysis result
      if (aiAnalysis.intent && aiAnalysis.confidence > 0.7) {
        // Check if user is awaiting PIN verification
        if (user.conversationState?.awaitingInput === 'pin_verification' || user.conversationState?.awaitingInput === 'pin_for_transfer') {
          logger.info('PIN verification detected', {
            userId: user.id,
            conversationState: user.conversationState,
            awaitingInput: user.conversationState?.awaitingInput,
            hasData: !!user.conversationState?.data,
            hasAmount: !!user.conversationState?.data?.amount,
            hasAccountNumber: !!user.conversationState?.data?.accountNumber,
            hasPhoneNumber: !!user.conversationState?.data?.phoneNumber
          });
          
          // Check if we have valid transfer data (either accountNumber for bank transfers or phoneNumber for P2P transfers)
          const hasValidTransferData = user.conversationState?.data?.amount && 
            (user.conversationState?.data?.accountNumber || user.conversationState?.data?.phoneNumber);
          
          if (hasValidTransferData) {
            return await this.handlePinVerification(user, { text: processedText }, messageType);
          } else {
            // Clear invalid conversation state and ask user to start over
            await user.updateConversationState(null);
            await whatsappService.sendTextMessage(user.whatsappNumber, 
              "I couldn't find your transfer details. Please try your transfer request again.");
            return;
          }
        }

        // Handle different intents
        switch (aiAnalysis.intent) {
          case 'transaction_history':
            await aiAssistant.handleTransactionHistory(user, aiAnalysis.extractedData);
            break;
            
          case 'balance':
          case 'balance_inquiry':
            await aiAssistant.handleBalanceInquiry(user);
            break;
            
          case 'wallet_details':
          case 'account_info':
          case 'account_details':
            await aiAssistant.handleWalletDetails(user);
            break;
            
          case 'transfer_limits':
            await aiAssistant.handleTransferLimits(user);
            break;
            
          case 'bank_transfer':
            return await this.handleTransferIntent(user, { text: processedText }, messageType);
            
          case 'transfer':
            return await this.handleTransferIntent(user, { text: processedText }, messageType);
            
          case 'airtime':
            return await this.handleAirtimeIntent(user, { text: processedText }, messageType);
            
          case 'data':
            return await this.handleDataIntent(user, { text: processedText }, messageType);
            
          case 'bills':
            return await this.handleBillsIntent(user, { text: processedText }, messageType);
            
          case 'help':
            return await this.handleHelpIntent(user, { text: processedText }, messageType);
            
          case 'menu':
            return await this.handleMenuIntent(user, { text: processedText }, messageType);
            
          case 'greeting':
            const greetingMessage = `Hello ${user.firstName || 'there'}! 👋\n\nI'm MiiMii, your financial assistant. I can help you with:\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do today?`;
            await whatsappService.sendTextMessage(user.whatsappNumber, greetingMessage);
            break;
            
          default:
            // If AI couldn't determine intent, try traditional processing
            return await this.processMessageByType(user, userName, { text: processedText }, messageType);
        }
      } else {
        // If AI couldn't determine intent, check if user is awaiting PIN verification
        if (user.conversationState?.awaitingInput === 'pin_verification' || user.conversationState?.awaitingInput === 'pin_for_transfer') {
          // Check if we have valid transfer data (either accountNumber for bank transfers or phoneNumber for P2P transfers)
          const hasValidTransferData = user.conversationState?.data?.amount && 
            (user.conversationState?.data?.accountNumber || user.conversationState?.data?.phoneNumber);
          
          if (hasValidTransferData) {
            return await this.handlePinVerification(user, { text: processedText }, messageType);
          } else {
            // Clear invalid conversation state and ask user to start over
            await user.updateConversationState(null);
            await whatsappService.sendTextMessage(user.whatsappNumber, 
              "I couldn't find your transfer details. Please try your transfer request again.");
            return;
          }
        }
        
        // If AI couldn't determine intent, try traditional processing
        return await this.processMessageByType(user, userName, { text: processedText }, messageType);
      }

    } catch (error) {
      logger.error('Completed user message processing failed', { 
        error: error.message, 
        userId: user.id 
      });
      
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I encountered an error processing your request. Please try again or contact support."
      );
    }
  }

  async processFlowCompletion(parsedMessage) {
    try {
      const { flowToken, screen, data } = parsedMessage;
      
      logger.info('Processing Flow completion', {
        flowToken,
        screen,
        hasData: !!data
      });

      // Get user from flow token or phone number
      let user = null;
      if (data?.phoneNumber) {
        user = await userService.getUserByWhatsappNumber(data.phoneNumber);
      }

      if (!user) {
        logger.warn('No user found for Flow completion', {
          flowToken,
          screen,
          phoneNumber: data?.phoneNumber
        });
        return;
      }

      // Determine flow type based on screen
      if (screen === 'PIN_INPUT_SCREEN') {
        // Handle login flow
        const whatsappFlowService = require('./whatsappFlowService');
        const result = await whatsappFlowService.handleLoginFlow(data, user.whatsappNumber);
        
        if (result.success) {
          logger.info('Login flow completed successfully', {
            userId: user.id,
            flowToken,
            screen
          });
        } else {
          logger.error('Login flow processing failed', {
            userId: user.id,
            flowToken,
            screen,
            error: result.error
          });
        }
        
        return result;
      } else {
        // Handle onboarding flow
        const onboardingService = require('./onboarding');
        const result = await onboardingService.processCompletedFlow(user, {
          flowToken,
          screen,
          data
        });

        if (result.success) {
          logger.info('Onboarding flow completion processed successfully', {
            userId: user.id,
            flowToken,
            screen
          });

          // Send completion message
          const completionMessage = `🎉 Welcome to MiiMii! Your account setup is complete. You can now use all our services including transfers, airtime, data, and bill payments.`;
          await whatsappService.sendTextMessage(user.whatsappNumber, completionMessage);

          // Send account details if available
          if (result.accountDetails) {
            const accountMessage = `📋 *Account Details*\n\n🏦 Virtual Account: ${result.accountDetails.accountNumber}\n🏛️ Bank: ${result.accountDetails.bankName}\n💰 Balance: ₦${result.accountDetails.balance || '0.00'}\n\nYour virtual account is ready for use!`;
            await whatsappService.sendTextMessage(user.whatsappNumber, accountMessage);
          }
        } else {
          logger.error('Onboarding flow completion processing failed', {
            userId: user.id,
            flowToken,
            screen,
            error: result.error
          });
        }

        return result;
      }

    } catch (error) {
      logger.error('Error processing Flow completion', {
        error: error.message,
        stack: error.stack,
        parsedMessage
      });
      throw error;
    }
  }

  async processVoiceMessage(mediaId, user) {
    try {
      logger.info('Processing voice message', { mediaId, userId: user.id });
      
      // Download and transcribe the voice message
      const transcription = await transcriptionService.transcribeAudio(mediaId);
      
      if (transcription && transcription.text) {
        // Log successful transcription
        await ActivityLog.logUserActivity(
          user.id,
          'whatsapp_message_received',
          'voice_transcribed',
          {
            source: 'whatsapp',
            description: 'Voice message transcribed successfully',
            transcriptionConfidence: transcription.confidence,
            duration: transcription.duration
          }
        );

        // Send confirmation to user
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `🎤 I heard: "${transcription.text}"\n\nProcessing your request...`
        );
        
        return transcription.text;
      } else {
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          "I couldn't understand your voice message. Please try sending it as text or speak more clearly."
        );
        return null;
      }
    } catch (error) {
      logger.error('Voice message processing failed', { error: error.message, mediaId });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I couldn't process your voice message. Please try sending it as text instead."
      );
      return null;
    }
  }

  async processImageMessage(mediaId, caption, user) {
    try {
      logger.info('Processing image message', { mediaId, userId: user.id });
      
      let processedText = caption || '';
      let extractedData = null;

      // Try to extract text/data from the image
      try {
        const ocrResult = await ocrService.extractTextFromImage(mediaId);
        
        if (ocrResult.text) {
          processedText += (processedText ? '\n' : '') + ocrResult.text;
          extractedData = ocrResult.data;
          
          // Log successful OCR
          await ActivityLog.logUserActivity(
            user.id,
            'whatsapp_message_received',
            'image_ocr_processed',
            {
              source: 'whatsapp',
              description: 'Image OCR processed successfully',
              extractedTextLength: ocrResult.text.length,
              hasStructuredData: !!ocrResult.data
            }
          );

          // Inform user about extracted text
          if (ocrResult.text.length > 10) {
            await whatsappService.sendTextMessage(
              user.whatsappNumber,
              `📷 I can see text in your image:\n"${ocrResult.text.substring(0, 200)}${ocrResult.text.length > 200 ? '...' : ''}"\n\nProcessing your request...`
            );
          }
        }
      } catch (ocrError) {
        logger.warn('OCR processing failed', { error: ocrError.message, mediaId });
      }

      // If no text extracted and no caption, ask for clarification
      if (!processedText) {
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          "I can see your image, but I need more information. Please tell me what you'd like me to help you with."
        );
        return { text: null, data: null };
      }

      return { text: processedText, data: extractedData };
    } catch (error) {
      logger.error('Image message processing failed', { error: error.message, mediaId });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I couldn't process your image. Please try sending it again or describe what you need as text."
      );
      return { text: null, data: null };
    }
  }

  async processDocumentMessage(mediaId, filename, user) {
    try {
      logger.info('Processing document message', { mediaId, filename, userId: user.id });
      
      // For now, we'll just acknowledge the document and ask for text
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `📄 I received your document "${filename}". Please tell me how I can help you with it, or send the information as text for faster processing.`
      );
      
      return filename || 'Document received';
    } catch (error) {
      logger.error('Document processing failed', { error: error.message, mediaId });
      return null;
    }
  }

  processInteractiveMessage(message) {
    try {
      // Handle button responses and list selections
      if (message.buttonReply) {
        const buttonId = message.buttonReply.id;
        const buttonTitle = message.buttonReply.title;
        
        // Map button IDs to specific commands for better processing
        let processedText = buttonTitle;
        
        switch (buttonId) {
          case 'view_balance':
          case 'check_balance':
            processedText = 'check balance';
            break;
          case 'send_money':
          case 'transfer_money':
            processedText = 'send money';
            break;
          case 'pay_bills':
          case 'bill_payment':
            processedText = 'pay bills';
            break;
          case 'buy_airtime':
            processedText = 'buy airtime';
            break;
          case 'buy_data':
            processedText = 'buy data';
            break;
          case 'transaction_history':
            processedText = 'transaction history';
            break;
          case 'complete_onboarding':
            processedText = 'complete onboarding';
            break;
          case 'learn_more':
            processedText = 'help';
            break;
          case 'get_help':
            processedText = 'help';
            break;
          default:
            processedText = buttonTitle;
        }
        
        return {
          text: processedText,
          buttonReply: message.buttonReply,
          originalText: buttonTitle
        };
      } else if (message.listReply) {
        const listId = message.listReply.id;
        const listTitle = message.listReply.title;
        
        // Map list IDs to specific commands
        let processedText = listTitle;
        
        // Handle list selections based on common patterns
        if (listId.includes('balance')) {
          processedText = 'check balance';
        } else if (listId.includes('transfer') || listId.includes('send')) {
          processedText = 'send money';
        } else if (listId.includes('airtime')) {
          processedText = 'buy airtime';
        } else if (listId.includes('data')) {
          processedText = 'buy data';
        } else if (listId.includes('bill')) {
          processedText = 'pay bills';
        } else if (listId.includes('history')) {
          processedText = 'transaction history';
        }
        
        return {
          text: processedText,
          listReply: message.listReply,
          originalText: listTitle
        };
      } else {
        return {
          text: 'Interactive message received',
          interactive: true
        };
      }
    } catch (error) {
      logger.error('Interactive message processing failed', { error: error.message });
      return {
        text: 'help', // Fallback to help command
        error: true
      };
    }
  }

  async storeConversationState(user, result) {
    try {
      const conversationState = {
        awaitingInput: result.awaitingInput,
        intent: result.intent,
        context: result.context,
        step: result.step || 1,
        data: result.data || {},
        timestamp: new Date()
      };

      await user.updateConversationState(conversationState);
      
      logger.info('Conversation state stored', { 
        userId: user.id, 
        intent: result.intent,
        step: result.step 
      });
    } catch (error) {
      logger.error('Failed to store conversation state', { error: error.message, userId: user.id });
    }
  }

  async sendTransactionReceipt(user, transactionDetails) {
    try {
      const receipt = this.formatTransactionReceipt(transactionDetails);
      await whatsappService.sendTextMessage(user.whatsappNumber, receipt);
      
      // Log receipt sent
      await ActivityLog.logUserActivity(
        user.id,
        'whatsapp_message_sent',
        'transaction_receipt_sent',
        {
          source: 'whatsapp',
          description: 'Transaction receipt sent to user',
          transactionId: transactionDetails.id,
          transactionType: transactionDetails.type
        }
      );
    } catch (error) {
      logger.error('Failed to send transaction receipt', { error: error.message, userId: user.id });
    }
  }

  formatTransactionReceipt(transaction) {
    const status = transaction.status === 'completed' ? '✅' : 
                  transaction.status === 'failed' ? '❌' : 
                  transaction.status === 'pending' ? '⏳' : '🔄';

    return `${status} *Transaction Receipt*\n\n` +
           `📄 Reference: ${transaction.reference}\n` +
           `💰 Amount: ₦${parseFloat(transaction.amount).toLocaleString()}\n` +
           `💳 Fee: ₦${parseFloat(transaction.fee || 0).toLocaleString()}\n` +
           `💵 Total: ₦${parseFloat(transaction.totalAmount).toLocaleString()}\n` +
           `📊 Status: ${transaction.status.toUpperCase()}\n` +
           `📅 Date: ${new Date(transaction.createdAt).toLocaleString()}\n` +
           `📝 Description: ${transaction.description}\n` +
           `${transaction.recipientDetails ? `👤 Recipient: ${transaction.recipientDetails.name || transaction.recipientDetails.phoneNumber}\n` : ''}` +
           `\nThank you for using MiiMii! 🎉`;
  }

  async handleSpecialActions(user, result) {
    try {
      switch (result.requiresAction) {
        case 'VERIFY_PIN':
          await this.requestPinVerification(user, result);
          break;
        case 'SHOW_BALANCE':
          await this.sendBalanceInfo(user);
          break;
        case 'SHOW_HELP':
          await this.sendHelpMenu(user);
          break;
        default:
          logger.warn('Unknown special action', { action: result.requiresAction, userId: user.id });
      }
    } catch (error) {
      logger.error('Failed to handle special action', { error: error.message, userId: user.id });
    }
  }

  async requestPinVerification(user, result) {
    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      "🔐 Please enter your 4-digit PIN to authorize this transaction.\n\nYour PIN is secure and will not be stored in chat history."
    );
  }

  async sendBalanceInfo(user) {
    try {
      const walletService = require('./wallet');
      const wallet = await walletService.getUserWallet(user.id);
      const summary = wallet.getWalletSummary();

      const balanceMessage = `💰 *Wallet Balance*\n\n` +
                           `💵 Available: ₦${summary.availableBalance.toLocaleString()}\n` +
                           `⏳ Pending: ₦${summary.pendingBalance.toLocaleString()}\n` +
                           `📊 Total: ₦${summary.balance.toLocaleString()}\n\n` +
                           `📈 Daily Limit: ₦${summary.dailyLimit.toLocaleString()}\n` +
                           `💸 Today's Spending: ₦${summary.dailySpent.toLocaleString()}\n` +
                           `✅ Available Today: ₦${summary.dailyRemaining.toLocaleString()}\n\n` +
                           `💳 Account: ${summary.virtualAccount.number}\n` +
                           `🏦 Bank: ${summary.virtualAccount.bank}`;

      await whatsappService.sendTextMessage(user.whatsappNumber, balanceMessage);
    } catch (error) {
      logger.error('Failed to send balance info', { error: error.message, userId: user.id });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "I couldn't retrieve your balance at the moment. Please try again later."
      );
    }
  }

  async sendHelpMenu(user) {
    const helpMessage = `🤖 *MiiMii Help Center*\n\n` +
                       `💰 *Money Transfer*\n` +
                       `• "Send 5000 to John 08123456789"\n` +
                       `• "Transfer 2000 to GTB 0123456789"\n\n` +
                       `📱 *Airtime & Data*\n` +
                       `• "Buy 1000 airtime for 08123456789"\n` +
                       `• "Buy 1GB data for 08123456789"\n\n` +
                       `⚡ *Bill Payments*\n` +
                       `• "Pay 5000 electricity EKEDC 12345"\n` +
                       `• "Pay 3000 cable DStv 123456789"\n\n` +
                       `📊 *Account Management*\n` +
                       `• "Check balance"\n` +
                       `• "Show transactions"\n` +
                       `• "Account details"\n\n` +
                       `🎯 *Tips*\n` +
                       `• Send voice notes - I understand speech!\n` +
                       `• Send images of bills - I can read them!\n` +
                       `• Just type naturally - I'm smart! 😊\n\n` +
                       `Need human help? Type "support" 💬`;

    await whatsappService.sendTextMessage(user.whatsappNumber, helpMessage);
  }

  /**
   * Handle onboarding intent
   */
  async handleOnboardingIntent(user, userName, message, messageType, messageId = null) {
    // Check if user needs onboarding
    if (user.onboardingStep !== 'completed') {
      await this.sendOnboardingFlow(user, userName, messageId);
    } else {
      // User is already completed, send AI-generated personalized welcome back message
      const aiAssistant = require('./aiAssistant');
      const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, personalizedMessage);
    }
  }

  /**
   * Handle balance check intent
   */
  async handleBalanceIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first before checking your balance.");
      return;
    }

    try {
      // Get wallet balance
      const walletService = require('./wallet');
      const wallet = await walletService.getUserWallet(user.id);
      
      if (!wallet) {
        const whatsappService = require('./whatsapp');
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "❌ Wallet not found. Please contact support.");
        return;
      }

      const balanceValue = parseFloat(wallet.balance || 0);
      const availableBalance = parseFloat(wallet.availableBalance || wallet.balance || 0);
      const pendingBalance = parseFloat(wallet.pendingBalance || 0);

      // Check if this is a natural language query and provide appropriate response
      const messageText = (message?.text || '').toLowerCase();
      const isNaturalQuery = /what'?s?\s+my\s+(current\s+)?balance|how\s+much\s+(do\s+)?i\s+have|check\s+my\s+balance|show\s+my\s+balance|my\s+balance/.test(messageText);

      let responseMessage;
      if (isNaturalQuery) {
        responseMessage = `💰 *Your Current Balance*\n\n` +
                         `💵 Available: ₦${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
        
        if (pendingBalance > 0) {
          responseMessage += `⏳ Pending: ₦${pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
        }
        
        responseMessage += `📊 Total: ₦${balanceValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\n` +
                          `Your account is ready for transactions! 💳`;
      } else {
        responseMessage = `💰 *Account Balance*\n\nCurrent Balance: ₦${balanceValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\nYour account is ready for transactions!`;
      }

      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, responseMessage);
      
    } catch (error) {
      logger.error('Failed to get balance', { error: error.message, userId: user.id });
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve your balance at the moment. Please try again later.");
    }
  }

  /**
   * Handle transfer intent
   */
  async handleTransferIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Hey! 👋 I'd love to help you with transfers, but we need to complete your account setup first. It's quick and secure! Just let me know when you're ready to get started.");
      return;
    }

    const whatsappService = require('./whatsapp');
    const bankTransferService = require('./bankTransfer');

    // First, let's use AI to analyze the message and extract data
    const aiAssistant = require('./aiAssistant');
    const aiAnalysis = await aiAssistant.analyzeUserIntent(message?.text || '', user);
    
    logger.info('AI transfer analysis', {
      intent: aiAnalysis.intent,
      confidence: aiAnalysis.confidence,
      extractedData: aiAnalysis.extractedData || {}
    });

    // If AI detected transfer intent with high confidence, use AI processing
    if ((aiAnalysis.intent === 'transfer' || aiAnalysis.intent === 'bank_transfer') && aiAnalysis.confidence > 0.7) {
      try {
        const extractedData = aiAnalysis.extractedData || {};
        const { amount, accountNumber, bankName, bankCode, recipientName, phoneNumber } = extractedData;
        
        if (!amount) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "I can see you want to make a transfer! 💸\n\nTo help you better, I need the amount.\n\nTry something like: *Send 5k to John 1234567890 GTBank* or *Send 100 to 08123456789*");
          return;
        }

        const transferAmount = this.parseAmount(amount);
        
        // Validate amount
        if (transferAmount < 100) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "The minimum transfer amount is ₦100. Please specify a higher amount.");
          return;
        }

        // Check wallet balance first
        const walletService = require('./wallet');
        const wallet = await walletService.getUserWallet(user.id);
        if (!wallet) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "❌ Wallet not found. Please contact support.");
          return;
        }

        const walletBalance = parseFloat(wallet.balance);
        const feeInfo = bankTransferService.calculateTransferFee(transferAmount, bankTransferService.transferTypes.WALLET_TO_BANK);
        const totalAmount = feeInfo.totalAmount;

        // Check if user has sufficient balance
        if (walletBalance < totalAmount) {
          const shortfall = totalAmount - walletBalance;
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            `❌ *Insufficient Balance*\n\nYou need ₦${totalAmount.toLocaleString()} for this transfer but only have ₦${walletBalance.toLocaleString()}.\n\n💰 Please fund your wallet with ₦${shortfall.toLocaleString()} more to complete this transfer.`);
          return;
        }

        // Determine if this is a bank transfer or P2P transfer
        if (accountNumber && bankName) {
          // This is a bank transfer
          // Try to get dynamic bank mapping from BellBank API first
          let resolvedBankCode = bankCode;
          
          if (!resolvedBankCode) {
            try {
              logger.info('Attempting to fetch dynamic bank mapping for message processing');
              const bankMapping = await bellbankService.getBankMapping();
              
              // More flexible bank name matching
              const bankNameLower = bankName?.toLowerCase().trim();
              
              // Look for exact match or partial match in dynamic mapping
              const foundCode = bankMapping.bankMapping[bankNameLower] || 
                               Object.keys(bankMapping.bankMapping).find(key => 
                                 bankNameLower?.includes(key) || key.includes(bankNameLower)
                               );
              
              if (foundCode) {
                // If foundCode is already an institution code (6 digits), use it directly
                // Otherwise, it's a bank name key, so get the institution code from the mapping
                const dynamicValue = bankMapping.bankMapping[foundCode];
                resolvedBankCode = foundCode.length === 6 ? foundCode : dynamicValue;
                
                logger.info('Found dynamic bank code mapping for message processing', {
                  bankName,
                  foundCode,
                  foundCodeLength: foundCode.length,
                  foundCodeIs6Digits: foundCode.length === 6,
                  bankMappingValue: dynamicValue,
                  resolvedBankCode,
                  resolvedBankCodeType: typeof resolvedBankCode,
                  source: 'BellBank API'
                });
                
                // If dynamic mapping didn't work (resolvedBankCode is undefined), fall back to static
                if (!resolvedBankCode) {
                  logger.warn('Dynamic mapping found but value is undefined, falling back to static mapping', {
                    foundCode,
                    bankName
                  });
                  // Continue to static fallback below
                }
              }
              
              // If dynamic mapping failed or returned undefined, use static fallback
              if (!resolvedBankCode) {
                // Fallback to static mapping if dynamic lookup fails
                logger.warn('Dynamic bank mapping failed for message processing, using static fallback', {
                  bankName
                });
                const bankMap = {
                  // Traditional Banks
                  'keystone': '000082', 'keystone bank': '000082',
                  'gtb': '000058', 'gtbank': '000058', 'guaranty trust': '000058',
                  'access': '000014', 'access bank': '000014',
                  'uba': '000033', 'united bank for africa': '000033',
                  'fidelity': '000070', 'fidelity bank': '000070',
                  'wema': '000035', 'wema bank': '000035',
                  'union': '000032', 'union bank': '000032',
                  'fcmb': '000214', 'first city monument bank': '000214',
                  'first': '000016', 'first bank': '000016', 'firstbank': '000016',
                  'fbn': '000016', 'first bank of nigeria': '000016',
                  'zenith': '000057', 'zenith bank': '000057',
                  'stanbic': '000221', 'stanbic ibtc': '000221', 'ibtc': '000221',
                  'sterling': '000232', 'sterling bank': '000232',
                  'ecobank': '000050', 'eco bank': '000050',
                  'heritage': '000030', 'heritage bank': '000030',
                  'unity': '000215', 'unity bank': '000215',
                  'citibank': '000023', 'citi bank': '000023',
                  'standard': '000068', 'standard chartered': '000068', 'standard chartered bank': '000068',
                  'enterprise': '000084', 'enterprise bank': '000084',
                  
                  // Digital Banks and Fintech
                  'opay': '000090', 'palmpay': '000091', 'kuda': '000092', 'carbon': '000093',
                  'alat': '000094', 'v bank': '000095', 'vbank': '000095', 'rubies': '000096',
                  'fintech': '000097', 'mintyn': '000098', 'fairmoney': '000099', 'branch': '000100',
                  'eyowo': '000101', 'flutterwave': '000102', 'paystack': '000103', 'moniepoint': '000104',
                  '9psb': '000105', 'providus': '000106', 'polaris': '000107', 'titan': '000108',
                  'titan trust': '000108', 'tcf': '000109', 'covenant': '000110', 'nova': '000111',
                  'optimus': '000112', 'bowen': '000113', 'sparkle': '000114', 'mutual': '000115',
                  'npf': '000116', 'signature': '000117', 'globus': '000118', 'jaiz': '000119',
                  'taj': '000120', 'vfd': '000121', 'parallex': '000122', 'premiumtrust': '000123',
                  'coronation': '000124', 'rand merchant': '000125', 'fbnquest': '000126', 'suntrust': '000127',
                  'diamond': '000129',
                  
                  // Test Bank
                  'test': '000010', 'testbank': '000010', 'test bank': '000010'
                };
                
                resolvedBankCode = bankMap[bankNameLower] || 
                  Object.keys(bankMap).find(key => bankNameLower?.includes(key)) ? 
                  bankMap[Object.keys(bankMap).find(key => bankNameLower?.includes(key))] : null;
                
                logger.info('Static bank mapping result', {
                  bankNameLower,
                  directMatch: bankMap[bankNameLower],
                  partialMatch: Object.keys(bankMap).find(key => bankNameLower?.includes(key)),
                  partialMatchValue: Object.keys(bankMap).find(key => bankNameLower?.includes(key)) ? 
                    bankMap[Object.keys(bankMap).find(key => bankNameLower?.includes(key))] : null,
                  resolvedBankCode,
                  resolvedBankCodeType: typeof resolvedBankCode
                });
              }
            } catch (dynamicError) {
              logger.warn('Dynamic bank mapping failed for message processing, using static fallback', {
                error: dynamicError.message,
                bankName
              });
              // Fallback to static mapping
              const bankMap = {
                // Traditional Banks
                'keystone': '000082', 'keystone bank': '000082',
                'gtb': '000058', 'gtbank': '000058', 'guaranty trust': '000058',
                'access': '000014', 'access bank': '000014',
                'uba': '000033', 'united bank for africa': '000033',
                'fidelity': '000070', 'fidelity bank': '000070',
                'wema': '000035', 'wema bank': '000035',
                'union': '000032', 'union bank': '000032',
                'fcmb': '000214', 'first city monument bank': '000214',
                'first': '000016', 'first bank': '000016', 'firstbank': '000016',
                'fbn': '000016', 'first bank of nigeria': '000016',
                'zenith': '000057', 'zenith bank': '000057',
                'stanbic': '000221', 'stanbic ibtc': '000221', 'ibtc': '000221',
                'sterling': '000232', 'sterling bank': '000232',
                'ecobank': '000050', 'eco bank': '000050',
                'heritage': '000030', 'heritage bank': '000030',
                'unity': '000215', 'unity bank': '000215',
                'citibank': '000023', 'citi bank': '000023',
                'standard': '000068', 'standard chartered': '000068', 'standard chartered bank': '000068',
                'enterprise': '000084', 'enterprise bank': '000084',
                
                // Digital Banks and Fintech
                'opay': '000090', 'palmpay': '000091', 'kuda': '000092', 'carbon': '000093',
                'alat': '000094', 'v bank': '000095', 'vbank': '000095', 'rubies': '000096',
                'fintech': '000097', 'mintyn': '000098', 'fairmoney': '000099', 'branch': '000100',
                'eyowo': '000101', 'flutterwave': '000102', 'paystack': '000103', 'moniepoint': '000104',
                '9psb': '000105', 'providus': '000106', 'polaris': '000107', 'titan': '000108',
                'titan trust': '000108', 'tcf': '000109', 'covenant': '000110', 'nova': '000111',
                'optimus': '000112', 'bowen': '000113', 'sparkle': '000114', 'mutual': '000115',
                'npf': '000116', 'signature': '000117', 'globus': '000118', 'jaiz': '000119',
                'taj': '000120', 'vfd': '000121', 'parallex': '000122', 'premiumtrust': '000123',
                'coronation': '000124', 'rand merchant': '000125', 'fbnquest': '000126', 'suntrust': '000127',
                'diamond': '000129',
                
                // Test Bank
                'test': '000010', 'testbank': '000010', 'test bank': '000010'
              };
              
              const bankNameLower = bankName?.toLowerCase().trim();
              resolvedBankCode = bankMap[bankNameLower] || 
                Object.keys(bankMap).find(key => bankNameLower?.includes(key)) ? 
                bankMap[Object.keys(bankMap).find(key => bankNameLower?.includes(key))] : null;
            }
          }
          
          if (!resolvedBankCode) {
            logger.error('Bank code resolution failed', {
              bankName,
              bankNameLower: bankName?.toLowerCase().trim(),
              resolvedBankCode,
              resolvedBankCodeType: typeof resolvedBankCode,
              resolvedBankCodeLength: resolvedBankCode?.length
            });
            await whatsappService.sendTextMessage(user.whatsappNumber, 
              `I couldn't identify the bank "${bankName}". Please use a valid bank name like GTBank, Access, UBA, Zenith, Keystone, etc.`);
            return;
          }

          // Use AI-generated conversational response if available
          if (aiAnalysis.response) {
            await whatsappService.sendTextMessage(user.whatsappNumber, aiAnalysis.response);
            
            // Store conversation state for PIN verification
            await user.updateConversationState({
              intent: 'bank_transfer',
              awaitingInput: 'pin_for_transfer',
              context: 'bank_transfer_pin',
              step: 1,
              data: {
                accountNumber: accountNumber,
                bankCode: resolvedBankCode,
                bankName: bankName,
                amount: transferAmount,
                recipientName: recipientName,
                narration: 'Wallet transfer',
                reference: `TXN${Date.now()}`
              }
            });
            return;
          }

          // Fallback to traditional processing if no AI response
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "🔍 Validating account details... Please wait a moment.");

          // Validate account via BellBank API
          const validation = await bankTransferService.validateBankAccount(accountNumber, resolvedBankCode);
          
          if (!validation.valid) {
            await whatsappService.sendTextMessage(user.whatsappNumber, 
              "❌ I couldn't validate those account details. Please double-check the account number and bank name, then try again.");
            return;
          }

          // Store transaction details and request confirmation
          await user.updateConversationState({
            intent: 'bank_transfer',
            awaitingInput: 'confirm_transfer',
            context: 'bank_transfer_confirmation',
            step: 1,
            data: {
              accountNumber: validation.accountNumber,
              bankCode: resolvedBankCode,
              bankName: validation.bank,
              amount: transferAmount,
              totalFee: feeInfo.totalFee,
              totalAmount: feeInfo.totalAmount,
              narration: 'Wallet transfer',
              reference: `TXN${Date.now()}`,
              recipientName: recipientName || validation.accountName
            }
          });

          const confirmMsg = `💸 *Transfer Confirmation*\n\n` +
                            `💰 Amount: ₦${transferAmount.toLocaleString()}\n` +
                            `💳 Fee: ₦${feeInfo.totalFee.toLocaleString()}\n` +
                            `🧾 Total: ₦${feeInfo.totalAmount.toLocaleString()}\n\n` +
                            `👤 Recipient: ${validation.accountName}\n` +
                            `🏦 Bank: ${validation.bank}\n` +
                            `🔢 Account: ${validation.accountNumber}\n\n` +
                            `Does this look correct? Reply *YES* to confirm or *NO* to cancel.`;

          await whatsappService.sendTextMessage(user.whatsappNumber, confirmMsg);
          return;

        } else if (phoneNumber) {
          // This is a P2P transfer
          // For real money transfers, we need bank account details
          // Guide the user to provide bank information in a more conversational way
          
          const guidanceMessage = `Great! I can help you send ₦${transferAmount.toLocaleString()} to ${recipientName || phoneNumber}! 💸\n\n` +
            `To complete this transfer, I need the recipient's bank details:\n\n` +
            `📝 *Account number* (10 digits)\n` +
            `🏦 *Bank name*\n\n` +
            `Please send the complete transfer request like this:\n` +
            `*Send ${transferAmount} to 1234567890 GTBank ${recipientName || phoneNumber}*`;
          
          await whatsappService.sendTextMessage(user.whatsappNumber, guidanceMessage);
          return;
        } else {
          // Not enough information for either type
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "I can see you want to make a transfer! 💸\n\n" +
            "To help you better, I need more details:\n\n" +
            "📝 *Amount* (e.g., 1000, 5k, 10k)\n" +
            "👤 *Recipient name*\n" +
            "🏦 *Bank details* (account number + bank name)\n\n" +
            "Try something like:\n" +
            "• *Send 5k to John 1234567890 GTBank*\n" +
            "• *Send 1000 to 1234567890 First Bank Jane Doe*");
        }

      } catch (error) {
        logger.error('AI transfer processing failed', { 
          error: error.message, 
          userId: user.id,
          aiAnalysis 
        });
        
        // Check if it's a balance error and provide helpful message
        if (error.message.includes('Insufficient')) {
          await whatsappService.sendTextMessage(user.whatsappNumber, error.message);
          return;
        }
        
        // Fallback to manual processing
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "I'm having trouble processing that transfer request. Let me help you manually:\n\nPlease send:\n• Amount (e.g., 5k or 5000)\n• Account number (10 digits) and bank name for bank transfers\n• Phone number for P2P transfers\n\nExample: *Send 5k to 1234567890 GTBank* or *Send 100 to 08123456789*");
        return;
      }
    }

    // Fallback to traditional parsing for lower confidence or other transfer types
    const text = (message?.text || '').toLowerCase();
    
    // Try to parse quick intent: amount, account number, bank name/code
    const amountMatch = message?.text?.match(/(\d+[\d,]*)(?:\s*(?:ngn|naira|₦|k|k\b))?/i);
    let amount = null;
    if (amountMatch) {
      const raw = amountMatch[1].replace(/,/g, '');
      amount = raw.endsWith('k') ? Number(raw.slice(0, -1)) * 1000 : Number(raw);
      if (Number.isNaN(amount)) amount = null;
    }

    const acctMatch = message?.text?.match(/\b(\d{10})\b/);
    const accountNumber = acctMatch ? acctMatch[1] : null;

    // Map common bank mentions to codes
    const bankMap = {
      zenith: '057', gtb: '058', gtbank: '058', access: '044', uba: '033', fidelity: '070', wema: '035',
      union: '032', fcmb: '214', first: '011', fbn: '011', keystone: '082', stanbic: '221', sterling: '232',
      bell: '000023', bellbank: '000023', bells: '000023', test: '010', testbank: '010', 'test bank': '010'
    };
    let bankCode = null;
    
    // More flexible bank name matching
    const textLower = text.toLowerCase();
    for (const [key, code] of Object.entries(bankMap)) {
      if (textLower.includes(key)) { 
        bankCode = code; 
        break; 
      }
    }

    if (amount && accountNumber && bankCode) {
      // Process the bank transfer (same logic as above)
      try {
        // Check wallet balance first
        const walletService = require('./wallet');
        const wallet = await walletService.getUserWallet(user.id);
        if (!wallet) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "❌ Wallet not found. Please contact support.");
          return;
        }

        const walletBalance = parseFloat(wallet.balance);
        const feeInfo = bankTransferService.calculateTransferFee(amount, bankTransferService.transferTypes.WALLET_TO_BANK);
        const totalAmount = feeInfo.totalAmount;

        // Check if user has sufficient balance
        if (walletBalance < totalAmount) {
          const shortfall = totalAmount - walletBalance;
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            `❌ *Insufficient Balance*\n\nYou need ₦${totalAmount.toLocaleString()} for this transfer but only have ₦${walletBalance.toLocaleString()}.\n\n💰 Please fund your wallet with ₦${shortfall.toLocaleString()} more to complete this transfer.`);
          return;
        }

        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "🔍 Validating account details... Please wait a moment.");

        const validation = await bankTransferService.validateBankAccount(accountNumber, bankCode);
        
        if (!validation.valid) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "❌ I couldn't validate those account details. Please double-check the account number and bank name.");
          return;
        }

        await user.updateConversationState({
          intent: 'bank_transfer',
          awaitingInput: 'confirm_transfer',
          context: 'bank_transfer_confirmation',
          step: 1,
          data: {
            accountNumber: validation.accountNumber,
            bankCode: bankCode,
            bankName: validation.bank,
            amount: amount,
            totalFee: feeInfo.totalFee,
            totalAmount: feeInfo.totalAmount,
            narration: 'Wallet transfer',
            reference: `TXN${Date.now()}`,
            recipientName: validation.accountName
          }
        });

        const confirmMsg = `💸 *Transfer Confirmation*\n\n` +
                          `💰 Amount: ₦${amount.toLocaleString()}\n` +
                          `💳 Fee: ₦${feeInfo.totalFee.toLocaleString()}\n` +
                          `🧾 Total: ₦${feeInfo.totalAmount.toLocaleString()}\n\n` +
                          `👤 Recipient: ${validation.accountName}\n` +
                          `🏦 Bank: ${validation.bank}\n` +
                          `🔢 Account: ${validation.accountNumber}\n\n` +
                          `Does this look correct? Reply *YES* to confirm or *NO* to cancel.`;

        await whatsappService.sendTextMessage(user.whatsappNumber, confirmMsg);
        return;

      } catch (err) {
        // Check if it's a balance error and provide helpful message
        if (err.message.includes('Insufficient')) {
          await whatsappService.sendTextMessage(user.whatsappNumber, err.message);
          return;
        }
        
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          `❌ ${err.message}. Please recheck the details or try a different bank.`);
        return;
      }
    }

    // If we couldn't parse the transfer details, ask for them
    await whatsappService.sendTextMessage(user.whatsappNumber, 
      "I'd love to help you with that transfer! 💸\n\nTo make it quick and easy, please send me:\n• Amount (like 5k or 5000)\n• Account number (10 digits) and bank name for bank transfers\n• Phone number for P2P transfers\n\nFor example: *Send 5k to 1234567890 GTBank* or *Send 100 to 08123456789*");
  }

  // Handle PIN verification for transfers
  async handlePinVerification(user, message, messageType) {
    const whatsappService = require('./whatsapp');
    const bankTransferService = require('./bankTransfer');
    
    try {
      const pin = message?.text?.trim();
      
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "Please enter a valid 4-digit PIN to authorize your transfer. 🔐");
        return;
      }

      // Get stored transfer data
      const transferData = user.conversationState?.data;
      if (!transferData) {
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "I couldn't find your transfer details. Please try your transfer request again.");
        
        // Clear any invalid conversation state
        await user.updateConversationState(null);
        return;
      }

      // Validate that we have the required transfer data
      const isBankTransfer = transferData.accountNumber && transferData.bankCode;
      const isP2PTransfer = transferData.phoneNumber;
      
      if (!transferData.amount || (!isBankTransfer && !isP2PTransfer)) {
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "Transfer details are incomplete. Please try your transfer request again.");
        
        // Clear invalid conversation state
        await user.updateConversationState(null);
        return;
      }

      // Show processing message
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "🔐 Verifying your PIN and processing transfer... Please wait a moment.");

      // Process the transfer based on type
      let result;
      if (isBankTransfer) {
        // Bank transfer
        const bankTransferData = {
          accountNumber: transferData.accountNumber,
          bankCode: transferData.bankCode,
          amount: transferData.amount,
          narration: transferData.narration || 'Wallet transfer',
          reference: transferData.reference
        };
        result = await bankTransferService.processBankTransfer(user.id, bankTransferData, pin);
      } else {
        // P2P transfer - treat as bank transfer to the recipient's bank account
        // For P2P transfers, we need to determine the recipient's bank
        // For now, we'll use a default bank or ask user to specify
        
        // Check if we have bank information in the transfer data
        if (transferData.bankCode && transferData.accountNumber) {
          // User provided bank details, treat as regular bank transfer
          const bankTransferData = {
            accountNumber: transferData.accountNumber,
            bankCode: transferData.bankCode,
            amount: transferData.amount,
            narration: transferData.narration || 'P2P transfer',
            reference: transferData.reference
          };
          result = await bankTransferService.processBankTransfer(user.id, bankTransferData, pin);
        } else {
          // For P2P transfers without bank details, we need to ask user for bank information
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "For P2P transfers, I need the recipient's bank details. Please provide:\n\n" +
            "• Account number (10 digits)\n" +
            "• Bank name\n\n" +
            "Example: *Send 100 to 1234567890 GTBank Musa Abdulkadir*");
          
          // Store conversation state to continue the transfer flow
          await user.updateConversationState({
            intent: 'transfer',
            awaitingInput: 'bank_details',
            context: 'p2p_bank_details',
            step: 1,
            data: {
              phoneNumber: transferData.phoneNumber,
              amount: transferData.amount,
              recipientName: transferData.recipientName,
              narration: 'P2P transfer',
              reference: transferData.reference
            }
          });
          return;
        }
      }
      
      if (result.success) {
        // Don't send message here - let the bellbank service handle completion messages
        // This prevents duplicate messages when transfer completes via webhook
        logger.info('Transfer initiated successfully, waiting for completion notification', {
          userId: user.id,
          reference: result.transaction.reference
        });
      } else {
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          `❌ Transfer failed: ${result.message}. Please try again or contact support if the issue persists.`);
      }

      // Clear conversation state
      await user.updateConversationState(null);

    } catch (error) {
      logger.error('PIN verification failed', { 
        error: error.message, 
        userId: user.id,
        conversationState: user.conversationState
      });
      
      // Provide a more helpful error message
      let errorMessage = "❌ Transfer failed. Please try again or contact support if the issue persists.";
      
      if (error.message.includes('Insufficient')) {
        errorMessage = error.message; // Use the detailed balance error message
      } else if (error.message.includes('createTransaction')) {
        errorMessage = "❌ System error: Transaction service unavailable. Please try again in a moment.";
      } else if (error.message.includes('PIN')) {
        errorMessage = "❌ Invalid PIN. Please check your PIN and try again.";
      } else if (error.message.includes('Invalid bank account')) {
        errorMessage = "❌ Invalid account details. Please check the account number and bank name.";
      } else if (error.message.includes('Transfer limit')) {
        errorMessage = "❌ Transfer limit exceeded. Please try a smaller amount or contact support.";
      } else if (error.message.includes('Failed To Fecth Account Info')) {
        errorMessage = "❌ The account number could not be found. Please check the account number and bank name, then try again.";
      } else if (error.message.includes('could not be found in')) {
        errorMessage = error.message; // Use the user-friendly message from bankTransfer service
      }
      
      await whatsappService.sendTextMessage(user.whatsappNumber, errorMessage);
      
      // Clear conversation state on error
      await user.updateConversationState(null);
    }
  }

  // Helper method to parse amounts
  parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Handle "k" suffix (thousands)
    if (amountStr.toString().toLowerCase().includes('k')) {
      return parseInt(amountStr.replace(/[k,\s]/gi, '')) * 1000;
    }
    
    // Handle regular numbers with commas
    return parseInt(amountStr.toString().replace(/[,\s]/g, ''));
  }

  /**
   * Handle airtime purchase intent
   */
  async handleAirtimeIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first before buying airtime.");
      return;
    }

    // Process the airtime request directly since AI has already analyzed it
    const aiAssistant = require('./aiAssistant');
    
    try {
      // Extract data from the message
      const extractedData = {
        amount: aiAssistant.extractAmount(message.text || message.content),
        phoneNumber: aiAssistant.extractPhoneNumber(message.text || message.content),
        network: aiAssistant.detectNetwork(aiAssistant.extractPhoneNumber(message.text || message.content) || user.whatsappNumber)
      };
      
      // Process the airtime purchase
      const result = await aiAssistant.handleAirtimePurchase(user, extractedData, { intent: 'airtime' });
      
      // Don't send message here as bilal service already handles it
      // The result.message will be null if receipt was sent successfully
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId: user.id });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Airtime purchase failed!\n\nReason: " + error.message + "\n\nPlease try again or contact support.");
    }
  }

  /**
   * Handle data purchase intent
   */
  async handleDataIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first before buying data.");
      return;
    }

    // Process the data request directly since AI has already analyzed it
    const aiAssistant = require('./aiAssistant');
    
    try {
      // Extract data from the message
      const extractedData = {
        amount: aiAssistant.extractAmount(message.text || message.content),
        phoneNumber: aiAssistant.extractPhoneNumber(message.text || message.content),
        network: aiAssistant.detectNetwork(aiAssistant.extractPhoneNumber(message.text || message.content) || user.whatsappNumber)
      };
      
      // Process the data purchase
      const result = await aiAssistant.handleDataPurchase(user, extractedData, { intent: 'data' });
      
      // Don't send message here as bilal service already handles it
      // The result.message will be null if receipt was sent successfully
    } catch (error) {
      logger.error('Data purchase failed', { error: error.message, userId: user.id });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Data purchase failed!\n\nReason: " + error.message + "\n\nPlease try again or contact support.");
    }
  }

  /**
   * Handle bills payment intent
   */
  async handleBillsIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first before paying bills.");
      return;
    }

    // Process the bills request directly since AI has already analyzed it
    const aiAssistant = require('./aiAssistant');
    
    try {
      // Extract data from the message
      const extractedData = {
        amount: aiAssistant.extractAmount(message.text || message.content),
        phoneNumber: aiAssistant.extractPhoneNumber(message.text || message.content),
        network: aiAssistant.detectNetwork(aiAssistant.extractPhoneNumber(message.text || message.content) || user.whatsappNumber)
      };
      
      // Process the bill payment
      const result = await aiAssistant.handleBillPayment(user, extractedData, { intent: 'bills' });
      
      if (result && result.message) {
        const whatsappService = require('./whatsapp');
        await whatsappService.sendTextMessage(user.whatsappNumber, result.message);
      }
    } catch (error) {
      logger.error('Bill payment failed', { error: error.message, userId: user.id });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Bill payment failed!\n\nReason: " + error.message + "\n\nPlease try again or contact support.");
    }
  }

  /**
   * Handle help intent
   */
  async handleHelpIntent(user, message, messageType) {
    const helpMessage = `❓ *Help & Support*\n\nI'm here to help! Here's what I can do:\n\n💰 *Account Management*\n• Check balance\n• View transactions\n• Account details\n\n💸 *Money Services*\n• Send money\n• Buy airtime\n• Buy data\n• Pay bills\n\n📞 *Support*\n• Contact support\n• Report issues\n\nJust tell me what you need!`;
    
    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, helpMessage);
  }

  /**
   * Handle menu intent
   */
  async handleMenuIntent(user, message, messageType) {
    const menuMessage = `📋 *MiiMii Services Menu*\n\n💰 *Money*\n• Check balance\n• Send money\n• Transaction history\n\n📱 *Airtime & Data*\n• Buy airtime\n• Buy data bundles\n\n�� *Bills & Utilities*\n• Pay electricity\n• Pay water\n• Pay other bills\n\n📊 *Account*\n• Account details\n• Virtual account info\n\n❓ *Support*\n• Get help\n• Contact support\n\nJust say what you need!`;
    
    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, menuMessage);
  }

  /**
   * Handle account details intent
   */
  async handleAccountDetailsIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first to view account details.");
      return;
    }

    try {
      // Get wallet details using the correct method
      const walletService = require('./wallet');
      const walletDetails = await walletService.getWalletDetails(user.id);
      
      if (walletDetails) {
        const accountMessage = `📋 *Account Details*\n\n` +
          `🏦 *Virtual Account:* ${walletDetails.user.accountNumber || 'N/A'}\n` +
          `🏛️ *Bank:* ${walletDetails.user.bankName || 'BellBank'}\n` +
          `👤 *Account Name:* ${walletDetails.user.accountName}\n` +
          `💰 *Balance:* ₦${parseFloat(walletDetails.wallet.balance).toLocaleString()}\n` +
          `📱 *Phone:* ${user.whatsappNumber}\n\n` +
          `📈 *Transaction Limits*\n` +
          `• Daily: ₦${walletDetails.limits.daily.toLocaleString()}\n` +
          `• Monthly: ₦${walletDetails.limits.monthly.toLocaleString()}\n` +
          `• Single: ₦${walletDetails.limits.single.toLocaleString()}`;
        
        const whatsappService = require('./whatsapp');
        await whatsappService.sendTextMessage(user.whatsappNumber, accountMessage);
      } else {
        const whatsappService = require('./whatsapp');
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "Account details not available. Please contact support.");
      }
    } catch (error) {
      logger.error('Failed to get account details', { error: error.message, userId: user.id });
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve account details right now. Please try again later.");
    }
  }

  /**
   * Handle transaction history intent
   */
  async handleTransactionHistoryIntent(user, message, messageType, messageId) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first to view transaction history.");
      return;
    }

    try {
      const aiAssistant = require('./aiAssistant');
      await aiAssistant.handleTransactionHistory(user, { limit: 5 });
      
      logger.info('Transaction history sent via message processor', {
        userId: user.id
      });
    } catch (error) {
      logger.error('Failed to send transaction history via message processor', {
        error: error.message,
        userId: user.id
      });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve transaction history right now. Please try again later.");
    }
  }

  /**
   * Process message by type (fallback method)
   */
  async processMessageByType(user, userName, message, messageType) {
    // Handle different message types
    switch (messageType) {
      case 'text':
        return await this.handleTextMessage(user, userName, message);
      case 'interactive':
        return await this.handleInteractiveMessage(user, userName, message);
      default:
        const whatsappService = require('./whatsapp');
        await whatsappService.sendTextMessage(user.whatsappNumber, 
          "I'm sorry, I don't understand that type of message. Please send a text message.");
    }
  }

  /**
   * Handle text messages
   */
  async handleTextMessage(user, userName, message) {
    const messageText = message?.text || '';
    
    // Check if user needs onboarding
    if (user.onboardingStep !== 'completed') {
      await this.sendOnboardingFlow(user, userName);
      return;
    }

    // For completed users, process their message with AI intent analysis
    return await this.handleCompletedUserMessage(user, message, 'text');
  }

  /**
   * Handle interactive messages (buttons, lists, etc.)
   */
  async handleInteractiveMessage(user, userName, message) {
    const whatsappService = require('./whatsapp');
    
    // Handle button replies
    if (message?.buttonReply) {
      const buttonId = message.buttonReply.id;
      
      switch (buttonId) {
        case 'start_onboarding':
          await this.sendOnboardingFlow(user, userName);
          break;
        case 'learn_more':
          const learnMessage = `📚 *About MiiMii*\n\nI'm your personal financial assistant! I can help you with:\n\n💰 *Money Management*\n• Send money to anyone\n• Check your balance\n• View transaction history\n\n📱 *Airtime & Data*\n• Buy airtime for any network\n• Purchase data bundles\n• Recharge family & friends\n\n💡 *Bill Payments*\n• Pay electricity bills\n• Cable TV subscriptions\n• Water and other utilities\n\n🔐 *Security*\n• Secure transactions\n• PIN protection\n• 24/7 support\n\nReady to get started?`;
          await whatsappService.sendTextMessage(user.whatsappNumber, learnMessage);
          break;
        case 'get_help':
          await this.handleHelpIntent(user, message, 'interactive');
          break;
        default:
          await whatsappService.sendTextMessage(user.whatsappNumber, 
            "I'm sorry, I don't understand that option. Please try again or say 'help' for assistance.");
      }
    } else {
      // Handle other interactive message types
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "I received your interactive message. Please send a text message or use the menu options.");
    }
  }
}

module.exports = new MessageProcessor();
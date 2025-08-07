const aiAssistantService = require('./aiAssistant');
const whatsappService = require('./whatsapp');
const userService = require('./user');
const onboardingService = require('./onboarding');
const ocrService = require('./ocr');
const transcriptionService = require('./transcription');
const logger = require('../utils/logger');
const activityLogger = require('./activityLogger');

class MessageProcessor {
  async processIncomingMessage(parsedMessage) {
    try {
      const { from, message, messageType, contact } = parsedMessage;
      
      // Get or create user
      const user = await userService.getOrCreateUser(from, contact);
      
      // Get user's WhatsApp profile name
      const userName = contact?.profile?.name || user.firstName || 'there';
      
      // Extract the actual message content
      const messageContent = message?.text || message?.buttonReply?.title || '';
      
      // Log the incoming message
      logger.info('Processing incoming message', {
        userId: user.id,
        phoneNumber: from,
        messageType,
        userName,
        messageContent: messageContent || 'No text content'
      });

      // Analyze user message with AI to determine intent
      const aiAssistant = require('./aiAssistant');
      const intentAnalysis = await aiAssistant.analyzeUserIntent(messageContent, user);
      
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
          return await this.handleOnboardingIntent(user, userName, message, messageType);
          
        case 'balance':
        case 'check_balance':
        case 'account_balance':
          return await this.handleBalanceIntent(user, message, messageType);
          
        case 'transfer':
        case 'send_money':
        case 'bank_transfer':
          return await this.handleTransferIntent(user, message, messageType);
          
        case 'airtime':
        case 'buy_airtime':
        case 'recharge':
          return await this.handleAirtimeIntent(user, message, messageType);
          
        case 'data':
        case 'buy_data':
        case 'internet':
          return await this.handleDataIntent(user, message, messageType);
          
        case 'bills':
        case 'pay_bills':
        case 'utility':
          return await this.handleBillsIntent(user, message, messageType);
          
        case 'help':
        case 'support':
        case 'customer_service':
          return await this.handleHelpIntent(user, message, messageType);
          
        case 'menu':
        case 'services':
        case 'options':
          return await this.handleMenuIntent(user, message, messageType);
          
        case 'account_details':
        case 'virtual_account':
        case 'account_info':
          return await this.handleAccountDetailsIntent(user, message, messageType);
          
        default:
          // If AI couldn't determine intent, try traditional processing
          return await this.processMessageByType(user, userName, message, messageType);
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

  async sendPersonalizedWelcome(user, message, messageType) {
    try {
      const isReturningUser = user.onboardingStep === 'completed';
      
      // Get the user's name from WhatsApp profile or stored data
      let userName = 'there';
      
      // Priority: WhatsApp profile name > stored fullName > firstName > contact name
      if (user.fullName) {
        userName = user.fullName;
      } else if (user.firstName) {
        userName = user.firstName;
      } else if (message?.contact?.name) {
        userName = message.contact.name;
      }
      
      if (isReturningUser) {
        // For returning users, send login flow
        await this.sendLoginFlow(user, userName);
      } else {
        // For new users, send onboarding flow
        await this.sendOnboardingFlow(user, userName);
      }
      
      logger.info('Sent personalized welcome message', {
        userId: user.id,
        userName: userName,
        isReturningUser,
        phoneNumber: user.whatsappNumber,
        source: 'whatsapp_profile'
      });
      
    } catch (error) {
      logger.error('Failed to send personalized welcome', {
        error: error.message,
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
    }
  }

  async sendLoginFlow(user, userName) {
    try {
      const whatsappFlowService = require('./whatsappFlowService');
      
      // Generate a secure flow token
      const flowToken = whatsappFlowService.generateFlowToken(user.id, 'pin_verification');
      
      // Create the login flow data
      const flowData = {
        flowId: process.env.WHATSAPP_LOGIN_FLOW_ID || 'miimii_login_flow',
        flowToken: flowToken,
        flowCta: 'Login with PIN',
        header: {
          type: 'text',
          text: 'Welcome Back!'
        },
        body: `🌟 *Welcome back, ${userName}!* 🌟\n\nGreat to see you again! I'm your Personal Financial Assistant from MiiMii.\n\nPlease enter your 4-digit PIN to access your account securely.`,
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
      
      // Fallback to button message if flow fails
      const welcomeText = `🌟 *Welcome back, ${userName}!* 🌟\n\n` +
                         `Great to see you again! I'm your Personal Financial Assistant from MiiMii.\n\n` +
                         `I'm here to help you manage your finances. What would you like to do today?`;
      
      const buttons = [
        { id: 'view_balance', title: '💰 Check Balance' },
        { id: 'send_money', title: '💸 Send Money' },
        { id: 'pay_bills', title: '📱 Pay Bills' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, welcomeText, buttons);
    }
  }

  async sendOnboardingFlow(user, userName) {
    try {
      const whatsappFlowService = require('./whatsappFlowService');
      
      // Check if we have a valid flow ID configured
      const config = require('../config');
      const flowId = config.getWhatsappConfig().onboardingFlowId;
      
      // Add detailed logging for Flow ID debugging
      logger.info('🚀 FLOW ID DEBUG: About to send onboarding flow', {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        configuredFlowId: flowId,
        flowIdType: typeof flowId,
        flowIdLength: flowId ? flowId.length : 0,
        isFlowIdValid: flowId && flowId !== 'SET_THIS_IN_DO_UI' && flowId !== 'miimii_onboarding_flow' && flowId !== 'DISABLED_FOR_LOCAL_DEV',
        environment: process.env.NODE_ENV,
        whatsappConfig: {
          hasAccessToken: !!config.getWhatsappConfig().accessToken,
          hasPhoneNumberId: !!config.getWhatsappConfig().phoneNumberId,
          hasBusinessAccountId: !!config.getWhatsappConfig().businessAccountId
        }
      });
      
      if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow' || flowId === 'DISABLED_FOR_LOCAL_DEV') {
        logger.warn('WhatsApp Flow ID not configured or disabled, falling back to interactive buttons', {
          userId: user.id,
          configuredFlowId: flowId
        });
        // Skip flow message and go directly to fallback
        throw new Error('Flow ID not properly configured or disabled for local development');
      }
      
      // Generate a secure flow token
      const flowToken = whatsappFlowService.generateFlowToken(user.id, 'personal_details');
      
      // Get AI-generated personalized welcome message with user's WhatsApp profile name
      const aiAssistant = require('./aiAssistant');
      const personalizedMessage = await aiAssistant.generatePersonalizedWelcome(userName, user.whatsappNumber);
      
      // Create the onboarding flow data with custom content
      const flowData = {
        flowId: flowId,
        flowToken: flowToken,
        flowCta: 'Complete Onboarding',
        flowAction: 'navigate',
        header: {
          type: 'text',
          text: 'Welcome to MiiMii!'
        },
        body: personalizedMessage || `Hey ${userName}! 👋 I'm MiiMii, your financial assistant. Before we dive in, please complete the onboarding process so I can get to know you better. Once that's done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨`,
        footer: 'Secure • Fast • Easy',
        flowActionPayload: {
          screen: 'QUESTION_ONE',
          data: {
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            step: 'personal_details',
            userName: userName
          }
        }
      };

      // Send the Flow message using the configured Flow ID
      await whatsappService.sendTypingIndicator(user.whatsappNumber, 1500);
      await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);
      
      // Update user onboarding step
      await user.update({ onboardingStep: 'flow_onboarding' });
      
      logger.info('Sent onboarding flow to new user', {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        userName: userName,
        personalizedMessage: !!personalizedMessage
      });
      
    } catch (error) {
      logger.error('Failed to send onboarding flow', {
        error: error.message,
        userId: user.id,
        phoneNumber: user.whatsappNumber
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

  async handleOnboardingFlow(user, message, messageType, contactName = null) {
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
        return await this.sendPersonalizedWelcome(user, message, messageType);
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
      
      // Create the flow data
      const flowData = {
        flowId: flowId,
        flowToken: flowToken,
        flowCta: 'Complete Onboarding',
        flowAction: 'navigate',
        header: {
          type: 'text',
          text: 'MiiMii Account Setup'
        },
        body: `Hi ${user.fullName || user.firstName || 'there'}! 👋\n\nLet's complete your MiiMii account setup securely. This will only take a few minutes.\n\nYou'll provide:\n✅ Personal details\n✅ BVN for verification\n✅ Set up your PIN\n\nReady to start?`,
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
      const aiProcessingResult = await aiAssistantService.processUserMessage(
        user.whatsappNumber, 
        processedText, 
        messageType,
        extractedData
      );

      // Handle the AI processing result
      if (aiProcessingResult.success) {
        const { result } = aiProcessingResult;
        
        // Send response message
        if (result.message) {
          await whatsappService.sendTextMessage(user.whatsappNumber, result.message);
          
          // Log outgoing message
          await ActivityLog.logUserActivity(
            user.id,
            'whatsapp_message_sent',
            'response_sent',
            {
              source: 'whatsapp',
              description: 'Sent AI response to user',
              responseType: result.intent || 'general'
            }
          );
        }
        
        // Handle specific response types
        if (result.awaitingInput) {
          // Store conversation state for next message
          await this.storeConversationState(user, result);
        }
        
        if (result.transactionDetails) {
          // Send transaction receipt
          await this.sendTransactionReceipt(user, result.transactionDetails);
        }
        
        if (result.requiresAction) {
          await this.handleSpecialActions(user, result);
        }

      } else if (aiProcessingResult.error) {
        // Send error response
        await whatsappService.sendTextMessage(user.whatsappNumber, aiProcessingResult.userFriendlyResponse);
        
        // Log error
        await ActivityLog.logUserActivity(
          user.id,
          'whatsapp_message_sent',
          'error_response_sent',
          {
            source: 'whatsapp',
            description: 'Sent error response to user',
            errorType: aiProcessingResult.errorType || 'general'
          }
        );
      } else {
        // Fallback response
        await whatsappService.sendTextMessage(
          user.whatsappNumber, 
          "I'm here to help! Type 'help' to see what I can do for you."
        );
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
  async handleOnboardingIntent(user, userName, message, messageType) {
    // Check if user needs onboarding
    if (user.onboardingStep !== 'completed') {
      await this.sendOnboardingFlow(user, userName);
    } else {
      // User is already completed, send welcome back message
      const welcomeMessage = `Hey ${userName}! 👋 Welcome back to MiiMii! How can I help you today?`;
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, welcomeMessage);
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

    // Get wallet balance
    const walletService = require('./wallet');
    const balance = await walletService.getWalletBalance(user.id);
    
    const balanceMessage = `💰 *Account Balance*\n\nCurrent Balance: ₦${balance.toFixed(2)}\n\nYour account is ready for transactions!`;
    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, balanceMessage);
  }

  /**
   * Handle transfer intent
   */
  async handleTransferIntent(user, message, messageType) {
    if (user.onboardingStep !== 'completed') {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Please complete your account setup first before making transfers.");
      return;
    }

    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, 
      "💸 *Money Transfer*\n\nTo transfer money, please provide:\n\n• Recipient's phone number\n• Amount\n• Description (optional)\n\nExample: Send 5000 to 08012345678 for groceries");
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

    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, 
      "📱 *Buy Airtime*\n\nTo buy airtime, please provide:\n\n• Phone number\n• Amount\n\nExample: Buy 1000 airtime for 08012345678");
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

    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, 
      "📶 *Buy Data*\n\nTo buy data, please provide:\n\n• Phone number\n• Data plan\n\nExample: Buy 2GB data for 08012345678");
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

    const whatsappService = require('./whatsapp');
    await whatsappService.sendTextMessage(user.whatsappNumber, 
      "💡 *Pay Bills*\n\nTo pay bills, please provide:\n\n• Bill type (PHCN, Water, etc.)\n• Meter number\n• Amount\n\nExample: Pay PHCN bill for meter 12345");
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
    const menuMessage = `📋 *MiiMii Services Menu*\n\n💰 *Money*\n• Check balance\n• Send money\n• Transaction history\n\n📱 *Airtime & Data*\n• Buy airtime\n• Buy data bundles\n\n💡 *Bills & Utilities*\n• Pay electricity\n• Pay water\n• Pay other bills\n\n📊 *Account*\n• Account details\n• Virtual account info\n\n❓ *Support*\n• Get help\n• Contact support\n\nJust say what you need!`;
    
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

    // Get account details
    const walletService = require('./wallet');
    const accountDetails = await walletService.getAccountDetails(user.id);
    
    if (accountDetails) {
      const accountMessage = `📋 *Account Details*\n\n🏦 Virtual Account: ${accountDetails.accountNumber}\n🏛️ Bank: ${accountDetails.bankName}\n💰 Balance: ₦${accountDetails.balance.toFixed(2)}\n👤 Name: ${user.firstName} ${user.lastName}\n📱 Phone: ${user.whatsappNumber}`;
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, accountMessage);
    } else {
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "Account details not available. Please contact support.");
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

    // For completed users, send a welcome back message
    const whatsappService = require('./whatsapp');
    const welcomeMessage = `Hey ${userName}! 👋 Welcome back to MiiMii! How can I help you today?\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nJust tell me what you need!`;
    await whatsappService.sendTextMessage(user.whatsappNumber, welcomeMessage);
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
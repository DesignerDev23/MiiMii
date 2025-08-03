const aiAssistantService = require('./aiAssistant');
const whatsappService = require('./whatsapp');
const userService = require('./user');
const ocrService = require('./ocr');
const transcriptionService = require('./transcription');
const logger = require('../utils/logger');

class MessageProcessor {
  async processIncomingMessage(messageData) {
    try {
      const { from, messageType, message, contact } = messageData;
      
      // Get or create user
      const user = await userService.getOrCreateUser(from, contact.name);
      
      // Update last seen
      await user.update({ lastSeen: new Date() });

      // Process different message types
      let processedText = '';
      let extractedData = null;

      switch (messageType) {
        case 'text':
          processedText = message.text;
          break;
          
        case 'audio':
          processedText = await this.processVoiceMessage(message.mediaId);
          break;
          
        case 'image':
          const { text, data } = await this.processImageMessage(message.mediaId, message.caption);
          processedText = text;
          extractedData = data;
          break;
          
        case 'document':
          processedText = await this.processDocumentMessage(message.mediaId, message.filename);
          break;
          
        case 'interactive':
          processedText = this.processInteractiveMessage(message);
          break;
          
        default:
          await whatsappService.sendTextMessage(
            from, 
            "I can understand text, voice notes, and images. Please send your request in one of these formats."
          );
          return;
      }

      if (!processedText) {
        await whatsappService.sendTextMessage(
          from,
          "I couldn't understand your message. Please try again or type 'help' for assistance."
        );
        return;
      }

      // Process with AI Assistant for intent recognition and response
      const aiProcessingResult = await aiAssistantService.processUserMessage(from, processedText, messageType);

      // Handle the AI processing result
      if (aiProcessingResult.result) {
        const { result } = aiProcessingResult;
        
        // Send response message
        await whatsappService.sendTextMessage(from, result.message);
        
        // Handle specific response types
        if (result.awaitingInput) {
          // Store conversation state for next message
          await this.storeConversationState(from, result);
        }
        
        if (result.transactionDetails) {
          // Send transaction receipt
          await this.sendTransactionReceipt(from, result.transactionDetails);
        }
        
        if (result.requiresAction === 'COMPLETE_REGISTRATION') {
          // Send registration flow
          await this.sendRegistrationFlow(from);
        }
      } else if (aiProcessingResult.error) {
        // Send error response
        await whatsappService.sendTextMessage(from, aiProcessingResult.userFriendlyResponse);
      } else {
        // Fallback response
        await whatsappService.sendTextMessage(from, "I'm here to help! Type 'help' to see what I can do for you.");
      }

    } catch (error) {
      logger.error('Message processing failed', { error: error.message, messageData });
      
      // Send error message to user
      try {
        await whatsappService.sendTextMessage(
          messageData.from,
          "Sorry, I'm having trouble processing your request right now. Please try again in a few moments."
        );
      } catch (sendError) {
        logger.error('Failed to send error message', { sendError: sendError.message });
      }
    }
  }

  async processVoiceMessage(mediaId) {
    try {
      const media = await whatsappService.downloadMedia(mediaId);
      const transcription = await transcriptionService.transcribeAudio(media.stream, media.mimeType);
      return transcription;
    } catch (error) {
      logger.error('Voice message processing failed', { error: error.message, mediaId });
      throw new Error('Could not process voice message');
    }
  }

  async processImageMessage(mediaId, caption = '') {
    try {
      const media = await whatsappService.downloadMedia(mediaId);
      const ocrResult = await ocrService.extractText(media.stream);
      
      // Combine caption and OCR text
      const combinedText = [caption, ocrResult.text].filter(Boolean).join(' ');
      
      return {
        text: combinedText,
        data: {
          ocrData: ocrResult,
          caption
        }
      };
    } catch (error) {
      logger.error('Image processing failed', { error: error.message, mediaId });
      return { text: caption || '', data: null };
    }
  }

  async processDocumentMessage(mediaId, filename) {
    try {
      // For now, just process as image if it's an image document
      if (filename && /\.(jpg|jpeg|png|gif|bmp)$/i.test(filename)) {
        const { text } = await this.processImageMessage(mediaId);
        return text;
      }
      
      // For other documents, return filename for now
      return `Document received: ${filename}`;
    } catch (error) {
      logger.error('Document processing failed', { error: error.message, mediaId });
      return `Document received: ${filename}`;
    }
  }

  processInteractiveMessage(message) {
    if (message.buttonReply) {
      return `Button clicked: ${message.buttonReply.title}`;
    } else if (message.listReply) {
      return `List item selected: ${message.listReply.title}`;
    }
    return '';
  }

  async executeAction(intent, user, phoneNumber, originalText, extractedData) {
    try {
      switch (intent.action) {
        case 'welcome':
          await this.handleWelcome(phoneNumber, user);
          break;
          
        case 'balance_inquiry':
          await this.handleBalanceInquiry(phoneNumber, user);
          break;
          
        case 'transfer_money':
          await this.handleTransferMoney(phoneNumber, user, intent.parameters);
          break;
          
        case 'buy_airtime':
          await this.handleBuyAirtime(phoneNumber, user, intent.parameters);
          break;
          
        case 'buy_data':
          await this.handleBuyData(phoneNumber, user, intent.parameters);
          break;
          
        case 'pay_utility':
          await this.handlePayUtility(phoneNumber, user, intent.parameters);
          break;
          
        case 'transaction_history':
          await this.handleTransactionHistory(phoneNumber, user, intent.parameters);
          break;
          
        case 'start_kyc':
          await this.handleStartKyc(phoneNumber, user, extractedData);
          break;
          
        case 'set_pin':
          await this.handleSetPin(phoneNumber, user, intent.parameters);
          break;
          
        case 'menu':
          await this.handleMenu(phoneNumber, user);
          break;
          
        case 'help':
          await this.handleHelp(phoneNumber, user);
          break;
          
        case 'complaint':
          await this.handleComplaint(phoneNumber, user, originalText);
          break;
          
        default:
          await this.handleUnknownIntent(phoneNumber, user, originalText, intent);
      }
    } catch (error) {
      logger.error('Action execution failed', { 
        error: error.message, 
        action: intent.action, 
        userId: user.id 
      });
      
      await whatsappService.sendTextMessage(
        phoneNumber,
        "I encountered an error while processing your request. Our team has been notified. Please try again or contact support."
      );
    }
  }

  async handleWelcome(phoneNumber, user) {
    if (user.isKycComplete()) {
      const menuData = whatsappService.getMenuMessage();
      await whatsappService.sendButtonMessage(phoneNumber, menuData.text, menuData.buttons);
    } else {
      await whatsappService.sendTextMessage(phoneNumber, whatsappService.getWelcomeMessage());
    }
  }

  async handleBalanceInquiry(phoneNumber, user) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const walletService = require('./wallet');
    const wallet = await walletService.getUserWallet(user.id);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      `💰 *Your Balance*\n\n` +
      `Available: ₦${parseFloat(wallet.balance).toLocaleString()}\n` +
      `Account: ${wallet.virtualAccountNumber || 'Setting up...'}\n\n` +
      `💡 Send money by typing: "Send 5000 to John 08012345678"`
    );
  }

  async handleTransferMoney(phoneNumber, user, parameters) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const { amount, recipient, phoneNumber: recipientPhone } = parameters;
    
    if (!amount || !recipientPhone) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Please provide the amount and recipient's phone number.\n\n" +
        "Example: 'Send 5000 to 08012345678' or 'Transfer 10000 to John 08098765432'"
      );
      return;
    }

    // Start transfer process
    const transactionService = require('./transaction');
    await transactionService.initiateTransfer(user, {
      amount: parseFloat(amount),
      recipientPhone,
      recipientName: recipient,
      description: `Transfer to ${recipient || recipientPhone}`
    }, phoneNumber);
  }

  async handleBuyAirtime(phoneNumber, user, parameters) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const { amount, phoneNumber: targetPhone } = parameters;
    
    if (!amount) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Please specify the airtime amount.\n\n" +
        "Example: 'Buy 1000 airtime' or 'Buy 500 airtime for 08012345678'"
      );
      return;
    }

    const bilalService = require('./bilal');
    await bilalService.purchaseAirtime(user, {
      amount: parseFloat(amount),
      phoneNumber: targetPhone || phoneNumber
    }, phoneNumber);
  }

  async handleBuyData(phoneNumber, user, parameters) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const { amount, dataSize, phoneNumber: targetPhone } = parameters;
    
    if (!dataSize && !amount) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Please specify the data bundle.\n\n" +
        "Example: 'Buy 2GB data' or 'Buy 1GB data for 08012345678'"
      );
      return;
    }

    const bilalService = require('./bilal');
    await bilalService.purchaseData(user, {
      dataSize,
      amount: amount ? parseFloat(amount) : null,
      phoneNumber: targetPhone || phoneNumber
    }, phoneNumber);
  }

  async handlePayUtility(phoneNumber, user, parameters) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const { utilityType, meterNumber, amount } = parameters;
    
    if (!utilityType || !meterNumber) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Please provide utility type and meter/account number.\n\n" +
        "Example: 'Pay PHCN bill for meter 12345678' or 'Pay DStv bill for 1234567890'"
      );
      return;
    }

    const bilalService = require('./bilal');
    await bilalService.payUtilityBill(user, {
      utilityType,
      meterNumber,
      amount: amount ? parseFloat(amount) : null
    }, phoneNumber);
  }

  async handleTransactionHistory(phoneNumber, user, parameters) {
    if (!user.canPerformTransactions()) {
      await this.sendKycRequiredMessage(phoneNumber, user);
      return;
    }

    const transactionService = require('./transaction');
    await transactionService.sendTransactionHistory(user, phoneNumber, parameters.limit || 5);
  }

  async handleStartKyc(phoneNumber, user, extractedData) {
    const kycService = require('./kyc');
    await kycService.startKycProcess(user, phoneNumber, extractedData);
  }

  async handleSetPin(phoneNumber, user, parameters) {
    const { pin } = parameters;
    
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Please provide a 4-digit PIN.\n\nExample: 'Set PIN 1234'"
      );
      return;
    }

    await user.update({ pin });
    await whatsappService.sendTextMessage(
      phoneNumber,
      "✅ Your PIN has been set successfully! You can now perform transactions."
    );
  }

  async handleMenu(phoneNumber, user) {
    if (user.isKycComplete()) {
      const menuData = whatsappService.getMenuMessage();
      await whatsappService.sendButtonMessage(phoneNumber, menuData.text, menuData.buttons);
    } else {
      await whatsappService.sendTextMessage(phoneNumber, whatsappService.getWelcomeMessage());
    }
  }

  async handleHelp(phoneNumber, user) {
    const helpText = `🆘 *MiiMii Help*\n\n` +
      `*Available Commands:*\n` +
      `• "Balance" - Check your wallet balance\n` +
      `• "Send 5000 to John 08012345678" - Transfer money\n` +
      `• "Buy 1000 airtime" - Purchase airtime\n` +
      `• "Buy 2GB data" - Purchase data bundle\n` +
      `• "Pay PHCN bill for 12345" - Pay utility bills\n` +
      `• "Transactions" - View transaction history\n` +
      `• "Menu" - Show main menu\n` +
      `• "Start KYC" - Begin verification process\n\n` +
      `*Need Support?*\n` +
      `Just describe your issue and we'll help you!\n\n` +
      `📞 Support: Call us for urgent matters`;

    await whatsappService.sendTextMessage(phoneNumber, helpText);
  }

  async handleComplaint(phoneNumber, user, originalText) {
    const supportService = require('./support');
    await supportService.createSupportTicket(user, {
      type: 'complaint',
      subject: 'User Complaint',
      description: originalText,
      priority: 'medium'
    });

    await whatsappService.sendTextMessage(
      phoneNumber,
      "📝 Your complaint has been recorded. Our support team will contact you within 24 hours.\n\n" +
      "Ticket ID: #" + Date.now().toString().slice(-6)
    );
  }

  async handleUnknownIntent(phoneNumber, user, originalText, intent) {
    // Log unknown intents for improvement
    logger.info('Unknown intent detected', { 
      originalText, 
      intent, 
      userId: user.id,
      confidence: intent.confidence 
    });

    if (intent.confidence < 0.3) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "I didn't quite understand that. Type 'help' to see what I can do, or try rephrasing your request."
      );
    } else {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "I'm still learning! I think you want to " + intent.action + 
        ", but I'm not sure how to help with that yet. Type 'help' for available commands."
      );
    }
  }

  async sendKycRequiredMessage(phoneNumber, user) {
    const message = `🔐 *Verification Required*\n\n` +
      `To use MiiMii services, please complete your verification first.\n\n` +
      `📄 Send a photo of your ID card or\n` +
      `💬 Type "Start KYC" to begin\n\n` +
      `This is required by CBN regulations to keep your money safe.`;

    await whatsappService.sendTextMessage(phoneNumber, message);
  }

  // Store conversation state for multi-step interactions
  async storeConversationState(phoneNumber, result) {
    try {
      // Store conversation state in Redis or database
      // For now, we'll use the user's metadata field
      const user = await userService.getUserByPhoneNumber(phoneNumber);
      if (user) {
        const conversationState = {
          awaitingInput: result.awaitingInput,
          pendingTransaction: result.pendingTransaction,
          timestamp: new Date()
        };
        
        await user.update({
          metadata: {
            ...user.metadata,
            conversationState
          }
        });
      }
    } catch (error) {
      logger.error('Failed to store conversation state', { error: error.message, phoneNumber });
    }
  }

  // Send transaction receipt
  async sendTransactionReceipt(phoneNumber, transactionDetails) {
    try {
      let receiptMessage = `🧾 *Transaction Receipt*\n\n`;
      
      if (transactionDetails.reference) {
        receiptMessage += `📄 Reference: ${transactionDetails.reference}\n`;
      }
      
      if (transactionDetails.amount) {
        receiptMessage += `💰 Amount: ₦${parseFloat(transactionDetails.amount).toLocaleString()}\n`;
      }
      
      if (transactionDetails.fee && transactionDetails.fee > 0) {
        receiptMessage += `💳 Fee: ₦${parseFloat(transactionDetails.fee).toLocaleString()}\n`;
      }
      
      if (transactionDetails.recipient || transactionDetails.accountNumber) {
        receiptMessage += `👤 Recipient: ${transactionDetails.recipient || transactionDetails.accountNumber}\n`;
      }
      
      receiptMessage += `✅ Status: Successful\n`;
      receiptMessage += `⏰ Time: ${new Date().toLocaleString()}\n\n`;
      receiptMessage += `Thank you for using MiiMii! 💚`;

      await whatsappService.sendTextMessage(phoneNumber, receiptMessage);
    } catch (error) {
      logger.error('Failed to send transaction receipt', { error: error.message, phoneNumber });
    }
  }

  // Send registration flow
  async sendRegistrationFlow(phoneNumber) {
    try {
      const registrationMessage = `🚀 *Complete Your Registration*\n\n` +
        `To enjoy all MiiMii services:\n\n` +
        `1️⃣ Complete your profile\n` +
        `2️⃣ Set your transaction PIN\n` +
        `3️⃣ Verify your identity (KYC)\n\n` +
        `Type "register" to start the process!`;

      await whatsappService.sendTextMessage(phoneNumber, registrationMessage);
    } catch (error) {
      logger.error('Failed to send registration flow', { error: error.message, phoneNumber });
    }
  }
}

module.exports = new MessageProcessor();
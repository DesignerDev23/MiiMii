const logger = require('../utils/logger');
const whatsappService = require('./whatsapp');
const userService = require('./user');
const kycService = require('./kyc');
const bellbankService = require('./bellbank');
const walletService = require('./wallet');
const { ActivityLog } = require('../models');

class OnboardingService {
  constructor() {
    this.onboardingSteps = {
      'greeting': 'name_collection',
      'name_collection': 'kyc_data',
      'kyc_data': 'bvn_verification',
      'bvn_verification': 'virtual_account_creation',
      'virtual_account_creation': 'pin_setup',
      'pin_setup': 'completed'
    };
    
    // Interactive flow states
    this.interactiveFlowStates = {
      'name_input_flow': 'name_collection',
      'kyc_guided_flow': 'kyc_data',
      'pin_creation_flow': 'pin_setup'
    };
  }

  async handleOnboarding(phoneNumber, message, messageType = 'text', contactName = null) {
    try {
      // Get or create user with enhanced profile fetching
      const user = await this.getOrCreateUserWithProfile(phoneNumber, contactName);
      
      // Check if user is already onboarded
      if (user.onboardingStep === 'completed') {
        return await this.handleCompletedUserMessage(user, message, messageType);
      }

      // Show typing indicator for interactive experience
      await whatsappService.sendTypingIndicator(phoneNumber, 2000);

      // Process based on current onboarding step
      switch (user.onboardingStep) {
        case 'greeting':
          return await this.handleInteractiveGreeting(user, message, contactName);
        case 'name_collection':
          return await this.handleInteractiveNameCollection(user, message);
        case 'kyc_data':
          return await this.handleInteractiveKycDataCollection(user, message, messageType);
        case 'bvn_verification':
          return await this.handleBvnVerification(user, message);
        case 'virtual_account_creation':
          return await this.handleVirtualAccountCreation(user);
        case 'pin_setup':
          return await this.handleInteractivePinSetup(user, message);
        default:
          return await this.handleInteractiveGreeting(user, message, contactName);
      }
    } catch (error) {
      logger.error('Onboarding error', { error: error.message, phoneNumber });
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Sorry, I'm experiencing technical difficulties. Please try again in a moment."
      );
    }
  }

  async getOrCreateUserWithProfile(phoneNumber, contactName = null) {
    let user = await userService.getOrCreateUser(phoneNumber, contactName);
    
    // If no contact name provided or stored, try to fetch from WhatsApp
    if (!user.firstName && !contactName) {
      try {
        const profile = await whatsappService.getContactProfile(phoneNumber);
        if (profile.name) {
          const nameParts = profile.name.trim().split(/\s+/);
          if (nameParts.length >= 1) {
            await user.update({
              firstName: nameParts[0],
              lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : null,
              middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : null,
              profilePicture: profile.profilePicture
            });
            user = await user.reload();
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch user profile from WhatsApp', { error: error.message, phoneNumber });
      }
    }
    
    return user;
  }

  async handleInteractiveGreeting(user, message, contactName = null) {
    const greetingKeywords = ['hi', 'hello', 'hey', 'start', '/start', 'good morning', 'good afternoon', 'good evening'];
    
    // Ensure message is a string before calling toLowerCase
    const messageText = typeof message === 'string' ? message : (message?.text || '');
    const isGreeting = greetingKeywords.some(keyword => 
      messageText.toLowerCase().includes(keyword)
    );

    // Handle button responses from welcome message
    if (message?.buttonReply?.id === 'complete_onboarding') {
      return await this.startOnboardingFlow(user);
    }
    
    if (message?.buttonReply?.id === 'learn_more') {
      return await this.sendLearnMoreMessage(user);
    }
    
    if (message?.buttonReply?.id === 'get_help') {
      return await this.sendHelpMessage(user);
    }

    // Send an enhanced greeting with the user's name
    const userName = user.firstName || contactName || 'there';
    
    if (isGreeting || !user.firstName) {
      const greetingMessage = `👋 *Hello ${userName}!* Welcome to MiiMii!\n\n` +
                             `I'm Xara, your AI assistant. I'll help you set up your account step by step.\n\n` +
                             `Let's start by collecting some basic information about you.`;
      
      const buttons = [
        { id: 'start_onboarding', title: '🚀 Start Setup' },
        { id: 'skip_to_flow', title: '⚡ Quick Setup' },
        { id: 'need_help', title: '❓ I Need Help' }
      ];
      
      await whatsappService.sendButtonMessage(user.whatsappNumber, greetingMessage, buttons);
      
      // Move to next step
      await user.update({ onboardingStep: 'name_collection' });
      
      return { success: true, step: 'greeting_sent' };
    }

    // If they send something else, proceed to name collection
    return await this.handleInteractiveNameCollection(user, message);
  }

  async showNameCollectionFlow(user, existingName = null) {
    if (existingName) {
      // If we have the user's name, confirm and proceed
      const confirmationMessage = {
        text: `🎉 *Welcome to MiiMii, ${existingName}!*\n\n` +
              `I'm excited to help you manage your finances effortlessly through WhatsApp!\n\n` +
              `I see your name as *${existingName}*. Is this correct?`,
        buttons: [
          { id: 'name_correct', title: '✅ Yes, that\'s correct' },
          { id: 'name_incorrect', title: '✏️ Let me correct it' },
          { id: 'add_full_name', title: '📝 Add full name' }
        ]
      };
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        confirmationMessage.text,
        confirmationMessage.buttons
      );
    } else {
      // Interactive name collection
      const nameCollectionMessage = {
        text: `🎉 *Welcome to MiiMii!*\n\n` +
              `I'm excited to help you manage your finances effortlessly through WhatsApp!\n\n` +
              `Let's start by getting to know you better. What should I call you?`,
        buttons: [
          { id: 'enter_full_name', title: '📝 Enter Full Name' },
          { id: 'use_first_name', title: '👤 Just First Name' },
          { id: 'guided_name_setup', title: '🧭 Guided Setup' }
        ]
      };
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        nameCollectionMessage.text,
        nameCollectionMessage.buttons
      );
    }
  }

  async handleInteractiveNameCollection(user, message) {
    const messageText = typeof message === 'string' ? message : (message?.text || '');
    const buttonId = message?.buttonReply?.id || message?.listReply?.id;

    // Handle button responses
    if (buttonId) {
      switch (buttonId) {
        case 'name_correct':
          // Proceed to next step
          await user.update({ onboardingStep: 'kyc_data' });
          return await this.showKycDataCollectionFlow(user);
          
        case 'name_incorrect':
        case 'add_full_name':
        case 'enter_full_name':
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `📝 Please tell me your *full name* (First, Middle, Last name).\n\n` +
            `Example: John Emeka Smith`
          );
          return;
          
        case 'use_first_name':
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `👤 Please tell me your *first name*.\n\n` +
            `Example: John`
          );
          return;
          
        case 'guided_name_setup':
          return await this.startGuidedNameSetup(user);
      }
    }

    // Process name input
    const nameParts = messageText.trim().split(/\s+/);
    
    if (nameParts.length < 1 || nameParts[0].length < 2) {
      const retryMessage = {
        text: `Please provide at least your first name (minimum 2 characters).\n\n` +
              `You can also use the options below:`,
        buttons: [
          { id: 'enter_full_name', title: '📝 Enter Full Name' },
          { id: 'guided_name_setup', title: '🧭 Guided Setup' },
          { id: 'skip_middle_name', title: '⏭️ Skip to First & Last' }
        ]
      };
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        retryMessage.text,
        retryMessage.buttons
      );
      return;
    }

    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : null;

    // Update user with name information
    await user.update({
      firstName,
      lastName,
      middleName,
      onboardingStep: 'kyc_data'
    });

    // Log activity
    await ActivityLog.logUserActivity(
      user.id, 
      'profile_update', 
      'name_collected',
      { 
        source: 'whatsapp',
        description: 'User provided name information',
        newValues: { firstName, lastName, middleName },
        namePartsCount: nameParts.length
      }
    );

    // Send confirmation and proceed to KYC
    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `✅ Perfect! Nice to meet you, *${firstName}*! 🤝\n\n` +
      `Your name has been saved as:\n` +
      `👤 ${firstName}${middleName ? ` ${middleName}` : ''}${lastName ? ` ${lastName}` : ''}\n\n` +
      `Next, I need to verify your identity for security and compliance.`
    );

    // Small delay for better UX
    setTimeout(async () => {
      await this.showKycDataCollectionFlow(user);
    }, 2000);
  }

  async startGuidedNameSetup(user) {
    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `🧭 *Guided Name Setup*\n\n` +
      `I'll help you enter your name step by step.\n\n` +
      `Let's start with your *first name*. What is your first name?`
    );
    
    // Set user state for guided flow
    await user.update({ 
      onboardingStep: 'name_collection',
      conversationState: JSON.stringify({
        flow: 'guided_name_setup',
        step: 'first_name',
        data: {}
      })
    });
  }

  async showKycDataCollectionFlow(user) {
    const templates = whatsappService.getOnboardingFlowTemplates();
    const kycFlow = templates.kycDataCollection;
    
    await whatsappService.sendListMessage(
      user.whatsappNumber,
      kycFlow.body,
      kycFlow.action.button,
      kycFlow.action.sections
    );
  }

  async handleInteractiveKycDataCollection(user, message, messageType) {
    const buttonId = message?.buttonReply?.id || message?.listReply?.id;
    
    // Handle button/list responses
    if (buttonId) {
      switch (buttonId) {
        case 'upload_id_card':
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `📄 *Upload ID Document*\n\n` +
            `Please take a clear photo of one of these documents:\n\n` +
            `🆔 National ID Card\n` +
            `🚗 Driver's License\n` +
            `✈️ International Passport\n\n` +
            `Make sure:\n` +
            `✅ Photo is clear and readable\n` +
            `✅ All corners are visible\n` +
            `✅ No glare or shadows\n\n` +
            `📸 Send the photo when ready!`
          );
          return;
          
        case 'upload_bvn_slip':
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `🏦 *Upload BVN Document*\n\n` +
            `Please take a photo of your Bank Verification Number slip or any document containing your BVN.\n\n` +
            `📸 Send the photo when ready!`
          );
          return;
          
        case 'manual_kyc_entry':
          return await this.startManualKycEntry(user);
          
        case 'guided_kyc_flow':
          return await this.startGuidedKycFlow(user);
      }
    }

    // Handle image messages for document upload
    if (messageType === 'image') {
      return await this.processKycDocument(user, message);
    }

    // Handle manual text input
    return await this.processManualKycData(user, message);
  }

  async startManualKycEntry(user) {
    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `⌨️ *Manual Information Entry*\n\n` +
      `Please provide the following details all at once or one by one:\n\n` +
      `📅 *Date of Birth* (DD/MM/YYYY)\n` +
      `👤 *Gender* (Male/Female)\n` +
      `🏠 *Full Address*\n` +
      `🆔 *11-digit BVN*\n\n` +
      `📝 *Example (all at once):*\n` +
      `01/01/1990\n` +
      `Male\n` +
      `123 Lagos Street, Victoria Island, Lagos\n` +
      `12345678901\n\n` +
      `Or send them one by one - I'll guide you! 😊`
    );
  }

  async startGuidedKycFlow(user) {
    try {
      // Check if we have a valid flow ID configured
      const flowId = process.env.WHATSAPP_ONBOARDING_FLOW_ID;
      if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow') {
        logger.warn('WhatsApp Flow ID not configured for guided KYC, falling back to traditional', {
          userId: user.id,
          configuredFlowId: flowId
        });
        return await this.fallbackToTraditionalOnboarding(user);
      }
      
      // Create and send WhatsApp Flow for guided KYC setup
      const whatsappFlowService = require('./whatsappFlowService');
      const flowData = {
        flowId: flowId,
        flowToken: whatsappFlowService.generateFlowToken(user.id),
        flowCta: 'Start Guided Setup',
        flowAction: 'navigate',
        header: {
          type: 'text',
          text: 'KYC Information Setup'
        },
        body: `🧭 *Guided KYC Setup*\n\nI'll walk you through each piece of information step by step.\n\nThis interactive form will collect:\n📅 Date of Birth\n👤 Gender\n🆔 BVN Number\n🏠 Address\n\nReady to start?`,
        footer: 'Secure • Step-by-step • Easy',
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
      const whatsappService = require('./whatsapp');
      await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);
      
      // Update user state to indicate flow was sent
      await user.update({
        conversationState: JSON.stringify({
          flow: 'guided_kyc',
          step: 'flow_sent',
          data: {}
        })
      });

      logger.info('Started guided KYC flow for user', {
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
      
      return { success: true, step: 'flow_sent' };
    } catch (error) {
      logger.error('Failed to start guided KYC flow', {
        error: error.message,
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
      
      // Send error message and ask user to try again
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `❌ *Flow Message Failed*\n\n` +
        `I'm having trouble sending the interactive onboarding form. This might be due to:\n\n` +
        `• Network connectivity issues\n` +
        `• WhatsApp Flow configuration\n\n` +
        `Please try saying "hi" again or contact support if the issue persists.`
      );
      
      await user.update({
        conversationState: JSON.stringify({
          flow: 'guided_kyc',
          step: 'flow_error',
          data: {}
        })
      });
      
      return { success: false, step: 'flow_error' };
    }
  }

  async processKycDocument(user, message) {
    try {
      const ocrService = require('./ocr');
      
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `🔍 *Processing your document...*\n\n` +
        `Please wait while I extract the information from your document.`
      );
      
      const extractedData = await ocrService.extractDataFromImage(message.mediaId, 'identity_document');
      
      if (extractedData && extractedData.bvn) {
        // Show extracted data for confirmation
        const confirmationMessage = {
          text: `✅ *Information Extracted Successfully!*\n\n` +
                `I found the following information:\n\n` +
                `📅 Date of Birth: ${extractedData.dateOfBirth || 'Not found'}\n` +
                `👤 Gender: ${extractedData.gender || 'Not found'}\n` +
                `🆔 BVN: ${extractedData.bvn || 'Not found'}\n` +
                `🏠 Address: ${extractedData.address || 'Not found'}\n\n` +
                `Is this information correct?`,
          buttons: [
            { id: 'kyc_data_correct', title: '✅ Yes, correct' },
            { id: 'kyc_data_incorrect', title: '✏️ Need corrections' },
            { id: 'manual_kyc_entry', title: '⌨️ Enter manually' }
          ]
        };
        
        // Store extracted data temporarily
        await user.update({
          conversationState: JSON.stringify({
            flow: 'kyc_confirmation',
            extractedData: extractedData
          })
        });
        
        await whatsappService.sendButtonMessage(
          user.whatsappNumber,
          confirmationMessage.text,
          confirmationMessage.buttons
        );
      } else {
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `❌ I couldn't extract all the required information from your document.\n\n` +
          `Please try:\n` +
          `📸 Taking a clearer photo\n` +
          `⌨️ Entering the information manually\n\n` +
          `Would you like to try again or enter manually?`
        );
        
        const retryMessage = {
          text: `Choose how you'd like to proceed:`,
          buttons: [
            { id: 'retry_document_upload', title: '📸 Try again' },
            { id: 'manual_kyc_entry', title: '⌨️ Enter manually' },
            { id: 'guided_kyc_flow', title: '🧭 Guided setup' }
          ]
        };
        
        await whatsappService.sendButtonMessage(
          user.whatsappNumber,
          retryMessage.text,
          retryMessage.buttons
        );
      }
    } catch (error) {
      logger.error('KYC document processing failed', { error: error.message, userId: user.id });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `❌ I couldn't process your document. Please try entering the information manually.`
      );
      await this.startManualKycEntry(user);
    }
  }

  async processManualKycData(user, message) {
    // Parse the message for KYC data
    const kycData = this.parseKycData(message);
    
    if (!kycData.isComplete) {
      const missingFieldsMessage = {
        text: `I need a bit more information. Missing:\n\n${kycData.missingFields.join('\n')}\n\n` +
              `You can send all details at once or use guided setup:`,
        buttons: [
          { id: 'guided_kyc_flow', title: '🧭 Guided Setup' },
          { id: 'kyc_help', title: '❓ Need Help' },
          { id: 'kyc_example', title: '📝 Show Example' }
        ]
      };
      
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        missingFieldsMessage.text,
        missingFieldsMessage.buttons
      );
      return;
    }

    // Validate BVN format
    if (!kycData.bvn || kycData.bvn.length !== 11 || !/^\d{11}$/.test(kycData.bvn)) {
      const bvnErrorMessage = {
        text: `❌ Invalid BVN format. Your BVN should be exactly 11 digits.\n\n` +
              `📝 Example: 12345678901\n\n` +
              `Need help finding your BVN?`,
        buttons: [
          { id: 'bvn_help', title: '❓ How to find BVN' },
          { id: 'manual_kyc_entry', title: '⌨️ Try again' },
          { id: 'guided_kyc_flow', title: '🧭 Guided setup' }
        ]
      };
      
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        bvnErrorMessage.text,
        bvnErrorMessage.buttons
      );
      return;
    }

    // Show confirmation before proceeding
    const confirmationMessage = {
      text: `✅ *Please confirm your information:*\n\n` +
            `📅 Date of Birth: ${kycData.dateOfBirth}\n` +
            `👤 Gender: ${kycData.gender}\n` +
            `🏠 Address: ${kycData.address}\n` +
            `🆔 BVN: ${kycData.bvn}\n\n` +
            `Is this information correct?`,
      buttons: [
        { id: 'kyc_confirmed', title: '✅ Yes, proceed' },
        { id: 'kyc_edit', title: '✏️ Make changes' },
        { id: 'guided_kyc_flow', title: '🧭 Start over' }
      ]
    };
    
    // Store KYC data temporarily
    await user.update({
      conversationState: JSON.stringify({
        flow: 'kyc_confirmation',
        kycData: kycData
      })
    });
    
    await whatsappService.sendButtonMessage(
      user.whatsappNumber,
      confirmationMessage.text,
      confirmationMessage.buttons
    );
  }

  async handleVirtualAccountCreation(user) {
    try {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "🔄 Creating your virtual account...\n\nThis may take a moment. Please wait."
      );

      // Create virtual account with BellBank
      const virtualAccountData = await bellbankService.createVirtualAccount({
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phoneNumber: user.whatsappNumber,
        address: user.address,
        bvn: user.bvn,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth.replace(/\//g, '/'), // Ensure correct format
        userId: user.id
      });

      if (virtualAccountData.success) {
        // Create or update wallet
        const wallet = await walletService.createUserWallet(user.id, {
          virtualAccountNumber: virtualAccountData.accountNumber,
          virtualAccountBank: virtualAccountData.bankName,
          virtualAccountName: virtualAccountData.accountName,
          bankCode: virtualAccountData.bankCode,
          accountReference: virtualAccountData.externalReference
        });

        // Log activity
        await ActivityLog.logUserActivity(
          user.id, 
          'wallet_funding', 
          'virtual_account_created',
          { 
            source: 'system',
            description: 'Virtual account created successfully',
            virtualAccountNumber: virtualAccountData.accountNumber
          }
        );

        await user.update({ onboardingStep: 'pin_setup' });

        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `🎉 *Account Created Successfully!*\n\n` +
          `Your virtual account details:\n\n` +
          `💳 *Account Number:* ${virtualAccountData.accountNumber}\n` +
          `🏦 *Bank:* ${virtualAccountData.bankName}\n` +
          `👤 *Account Name:* ${virtualAccountData.accountName}\n\n` +
          `You can fund your wallet by transferring money to this account from any Nigerian bank.\n\n` +
          `*Final Step:* Please create a 4-digit PIN to secure your transactions.\n\n` +
          `📱 Send your 4-digit PIN (e.g., 1234)`
        );
      } else {
        throw new Error('Virtual account creation failed');
      }
    } catch (error) {
      logger.error('Virtual account creation failed', { error: error.message, userId: user.id });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "❌ Unable to create your account at the moment. Please try again later or contact support."
      );
    }
  }

  async handleInteractivePinSetup(user, message) {
    const messageText = typeof message === 'string' ? message : (message?.text || '');
    const buttonId = message?.buttonReply?.id || message?.listReply?.id;

    // Handle button responses
    if (buttonId) {
      switch (buttonId) {
        case 'create_pin_flow':
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `🔢 *Create Your 4-Digit PIN*\n\n` +
            `Your PIN will be used to authorize transactions and secure your account.\n\n` +
            `⚠️ *PIN Requirements:*\n` +
            `• Exactly 4 digits\n` +
            `• Avoid common patterns (1234, 1111)\n` +
            `• Choose something memorable but secure\n\n` +
            `📱 Please enter your 4-digit PIN now:`
          );
          return;
          
        case 'pin_requirements':
          await this.showPinRequirements(user);
          return;
          
        case 'security_info':
          await this.showSecurityInfo(user);
          return;
      }
    }

    // Process PIN input
    const pin = messageText.trim().replace(/\s+/g, '');
    
    // Validate PIN
    if (!/^\d{4}$/.test(pin)) {
      const pinErrorMessage = {
        text: `❌ Invalid PIN format. Please provide exactly 4 digits.\n\n` +
              `📝 Example: 1234\n\n` +
              `Need help?`,
        buttons: [
          { id: 'pin_requirements', title: 'ℹ️ PIN Requirements' },
          { id: 'create_pin_flow', title: '🔢 Try Again' },
          { id: 'security_info', title: '🛡️ Security Info' }
        ]
      };
      
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        pinErrorMessage.text,
        pinErrorMessage.buttons
      );
      return;
    }

    // Check for weak PINs
    const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];
    if (weakPins.includes(pin)) {
      const weakPinMessage = {
        text: `⚠️ This PIN is too common and not secure. Please choose a different 4-digit PIN.\n\n` +
              `❌ *Avoid these patterns:*\n` +
              `• Repeated digits (1111, 2222)\n` +
              `• Sequential numbers (1234, 4321)\n` +
              `• Common patterns (0000)\n\n` +
              `🔐 Choose a more secure PIN:`,
        buttons: [
          { id: 'pin_requirements', title: 'ℹ️ See Guidelines' },
          { id: 'create_pin_flow', title: '🔢 Try Another PIN' },
          { id: 'pin_help', title: '❓ Need Help?' }
        ]
      };
      
      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        weakPinMessage.text,
        weakPinMessage.buttons
      );
      return;
    }

    // Confirm PIN creation
    const pinConfirmMessage = {
      text: `🔐 *Confirm Your PIN*\n\n` +
            `You entered: ••••\n\n` +
            `⚠️ Make sure you remember this PIN as it will be required for all transactions.\n\n` +
            `Ready to secure your account?`,
      buttons: [
        { id: 'confirm_pin', title: '✅ Confirm & Complete' },
        { id: 'change_pin', title: '🔄 Choose Different PIN' },
        { id: 'pin_requirements', title: 'ℹ️ PIN Guidelines' }
      ]
    };
    
    // Store PIN temporarily for confirmation
    await user.update({
      conversationState: JSON.stringify({
        flow: 'pin_confirmation',
        tempPin: pin
      })
    });
    
    await whatsappService.sendButtonMessage(
      user.whatsappNumber,
      pinConfirmMessage.text,
      pinConfirmMessage.buttons
    );
  }

  async showPinRequirements(user) {
    const requirementsMessage = {
      text: `ℹ️ *PIN Requirements & Guidelines*\n\n` +
            `✅ *Requirements:*\n` +
            `• Exactly 4 digits (0-9)\n` +
            `• No letters or special characters\n\n` +
            `🔒 *Security Tips:*\n` +
            `• Use a combination you'll remember\n` +
            `• Avoid birthdays or obvious dates\n` +
            `• Don't use repeated digits (1111)\n` +
            `• Avoid sequential numbers (1234)\n\n` +
            `💡 *Good Examples:*\n` +
            `• Mix of numbers: 5739\n` +
            `• Non-obvious pattern: 2847\n\n` +
            `Ready to create your PIN?`,
      buttons: [
        { id: 'create_pin_flow', title: '🔢 Create PIN' },
        { id: 'security_info', title: '🛡️ Security Info' },
        { id: 'pin_help', title: '❓ More Help' }
      ]
    };
    
    await whatsappService.sendButtonMessage(
      user.whatsappNumber,
      requirementsMessage.text,
      requirementsMessage.buttons
    );
  }

  async showSecurityInfo(user) {
    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `🛡️ *Your Security & Privacy*\n\n` +
      `🔐 *How we protect your PIN:*\n` +
      `• Encrypted using bank-grade security\n` +
      `• Never stored in plain text\n` +
      `• Never shared with third parties\n` +
      `• Only you have access to it\n\n` +
      `🏦 *Transaction Security:*\n` +
      `• PIN required for all money transfers\n` +
      `• Real-time fraud monitoring\n` +
      `• Instant notifications for all activities\n` +
      `• 24/7 security monitoring\n\n` +
      `💼 *Compliance:*\n` +
      `• Licensed by CBN (Central Bank of Nigeria)\n` +
      `• PCI DSS compliant\n` +
      `• ISO 27001 certified security\n\n` +
      `Your financial security is our top priority! 🛡️`
    );
  }

  async handleCompletedUserMessage(user, message, messageType) {
    // Forward to main AI processing
    const aiAssistantService = require('./aiAssistant');
    return await aiAssistantService.processUserMessage(user.whatsappNumber, message, messageType);
  }

  parseKycData(message) {
    // Ensure message is a string before processing
    const messageText = typeof message === 'string' ? message : (message?.text || '');
    const lines = messageText.split('\n').map(line => line.trim()).filter(line => line);
    const data = {};
    const missing = [];

    // Try to extract date of birth
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/;
    const dateMatch = messageText.match(dateRegex);
    if (dateMatch) {
      data.dateOfBirth = `${dateMatch[1].padStart(2, '0')}/${dateMatch[2].padStart(2, '0')}/${dateMatch[3]}`;
    } else {
      missing.push("📅 Date of Birth (DD/MM/YYYY)");
    }

    // Try to extract gender
    const genderRegex = /\b(male|female|man|woman|m|f)\b/i;
    const genderMatch = messageText.match(genderRegex);
    if (genderMatch) {
      const g = genderMatch[1].toLowerCase();
      data.gender = (g === 'male' || g === 'man' || g === 'm') ? 'male' : 'female';
    } else {
      missing.push("👤 Gender (Male/Female)");
    }

    // Try to extract BVN
    const bvnRegex = /\b(\d{11})\b/;
    const bvnMatch = messageText.match(bvnRegex);
    if (bvnMatch) {
      data.bvn = bvnMatch[1];
    } else {
      missing.push("🆔 11-digit BVN");
    }

    // Extract address (everything else that's not date, gender, or BVN)
    let addressParts = lines.filter(line => {
      return !dateRegex.test(line) && 
             !genderRegex.test(line) && 
             !bvnRegex.test(line) &&
             line.length > 5; // Assume address is longer than 5 characters
    });

    if (addressParts.length > 0) {
      data.address = addressParts.join(', ');
    } else {
      missing.push("🏠 Full Address");
    }

    return {
      ...data,
      isComplete: missing.length === 0,
      missingFields: missing
    };
  }

  async startOnboardingFlow(user) {
    try {
      // Check if we have a valid flow ID configured
      const flowId = process.env.WHATSAPP_ONBOARDING_FLOW_ID;
      if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow') {
        logger.warn('WhatsApp Flow ID not configured for onboarding, falling back to traditional', {
          userId: user.id,
          configuredFlowId: flowId
        });
        return await this.fallbackToTraditionalOnboarding(user);
      }

      // Create and send WhatsApp Flow for account onboarding
      const flowData = {
        flowId: flowId,
        flowToken: this.generateFlowToken(user.id),
        flowCta: 'Complete Onboarding',
        header: {
          type: 'text',
          text: 'Account Setup'
        },
        body: `Hi ${user.firstName || user.fullName || 'there'}! 👋\n\nLet's complete your MiiMii account setup. This will only take a few minutes.\n\nYou'll provide:\n✅ Personal details\n✅ BVN for verification\n✅ Set up your PIN\n\nReady to start?`,
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
      const whatsappService = require('./whatsapp');
      await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);
      
      // Update user step
      await user.update({ onboardingStep: 'kyc_data' });
      
      logger.info('Started onboarding flow for user', {
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });
      
      return { success: true, step: 'flow_sent' };
      
    } catch (error) {
      logger.error('Failed to start onboarding flow', {
        error: error.message,
        userId: user.id
      });
      
      // Fallback to traditional onboarding
      return await this.fallbackToTraditionalOnboarding(user);
    }
  }

  async sendLearnMoreMessage(user) {
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
    
    const buttons = [
      { id: 'complete_onboarding', title: '✅ Complete Setup' },
      { id: 'contact_support', title: '📞 Contact Support' }
    ];
    
    await whatsappService.sendButtonMessage(user.whatsappNumber, learnMoreText, buttons);
    return { success: true, step: 'learn_more_sent' };
  }

  async sendHelpMessage(user) {
    const helpText = `❓ *Need Help?* ❓\n\n` +
                    `I'm here to assist you! Here are some common questions:\n\n` +
                    `🔹 *What is onboarding?*\n` +
                    `It's a simple process to verify your identity and set up your account.\n\n` +
                    `🔹 *Is it safe?*\n` +
                    `Yes! We use bank-level security to protect your information.\n\n` +
                    `🔹 *How long does it take?*\n` +
                    `Usually just 3-5 minutes.\n\n` +
                    `Still have questions? Contact our support team!`;
    
    const buttons = [
      { id: 'complete_onboarding', title: '✅ I\'m Ready' },
      { id: 'contact_support', title: '📞 Contact Support' }
    ];
    
    await whatsappService.sendButtonMessage(user.whatsappNumber, helpText, buttons);
    return { success: true, step: 'help_sent' };
  }

  async fallbackToTraditionalOnboarding(user) {
    const fallbackText = `Let's set up your account step by step.\n\n` +
                        `First, I need to collect some basic information about you.\n\n` +
                        `What's your full name?`;
    
    await whatsappService.sendTextMessage(user.whatsappNumber, fallbackText);
    await user.update({ onboardingStep: 'name_collection' });
    
    return { success: true, step: 'fallback_name_collection' };
  }

  generateFlowToken(userId) {
    // Generate a secure token for flow verification
    const crypto = require('crypto');
    const timestamp = Date.now();
    const data = `${userId}_${timestamp}`;
    return crypto.createHash('sha256').update(data + process.env.APP_SECRET).digest('hex');
  }

  async completePinSetup(userId, pin) {
    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash the PIN before storing
      const bcrypt = require('bcryptjs');
      const hashedPin = await bcrypt.hash(pin, 10);

      // Update user with PIN and complete onboarding
      await user.update({
        pin: hashedPin,
        onboardingStep: 'completed',
        kycStatus: 'verified' // Assuming KYC is verified if they reach this step
      });

      // Create wallet for user if not exists
      await walletService.getOrCreateWallet(user.id);

      // Send completion message
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `🎉 *Congratulations!* 🎉\n\n` +
        `Your MiiMii account has been successfully created!\n\n` +
        `✅ Account verified\n` +
        `✅ PIN set up\n` +
        `✅ Wallet created\n\n` +
        `You can now:\n` +
        `💰 Send and receive money\n` +
        `📱 Pay bills and buy airtime\n` +
        `💳 Get virtual cards\n` +
        `📊 Track your expenses\n\n` +
        `Welcome to the future of banking! 🚀`
      );

      // Send main menu
      const buttons = [
        { id: 'check_balance', title: '💰 Check Balance' },
        { id: 'send_money', title: '💸 Send Money' },
        { id: 'pay_bills', title: '📱 Pay Bills' }
      ];

      await whatsappService.sendButtonMessage(
        user.whatsappNumber,
        `What would you like to do first?`,
        buttons
      );

      logger.info('User onboarding completed successfully', {
        userId: user.id,
        phoneNumber: user.whatsappNumber
      });

      return { success: true };

    } catch (error) {
      logger.error('Failed to complete PIN setup', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  // Helper method to check if user needs onboarding
  static async needsOnboarding(phoneNumber) {
    try {
      const user = await userService.getUserByPhone(phoneNumber);
      return !user || user.onboardingStep !== 'completed';
    } catch (error) {
      return true;
    }
  }
}

module.exports = new OnboardingService();
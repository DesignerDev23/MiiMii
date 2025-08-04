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
  }

  async handleOnboarding(phoneNumber, message, messageType = 'text') {
    try {
      // Get or create user
      const user = await userService.getOrCreateUser(phoneNumber);
      
      // Check if user is already onboarded
      if (user.onboardingStep === 'completed') {
        return await this.handleCompletedUserMessage(user, message, messageType);
      }

      // Process based on current onboarding step
      switch (user.onboardingStep) {
        case 'greeting':
          return await this.handleGreeting(user, message);
        case 'name_collection':
          return await this.handleNameCollection(user, message);
        case 'kyc_data':
          return await this.handleKycDataCollection(user, message, messageType);
        case 'bvn_verification':
          return await this.handleBvnVerification(user, message);
        case 'virtual_account_creation':
          return await this.handleVirtualAccountCreation(user);
        case 'pin_setup':
          return await this.handlePinSetup(user, message);
        default:
          return await this.handleGreeting(user, message);
      }
    } catch (error) {
      logger.error('Onboarding error', { error: error.message, phoneNumber });
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Sorry, I'm experiencing technical difficulties. Please try again in a moment."
      );
    }
  }

  async handleGreeting(user, message) {
    const greetingKeywords = ['hi', 'hello', 'hey', 'start', '/start', 'good morning', 'good afternoon', 'good evening'];
    
    // Ensure message is a string before calling toLowerCase
    const messageText = typeof message === 'string' ? message : (message?.text || '');
    const isGreeting = greetingKeywords.some(keyword => 
      messageText.toLowerCase().includes(keyword)
    );

    if (!isGreeting && !user.firstName) {
      // If not a greeting but user hasn't started, prompt them
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "👋 Hello! Welcome to *MiiMii* - Your Smart Financial Assistant!\n\n" +
        "I can help you with:\n" +
        "💰 Send money to anyone\n" +
        "📱 Buy airtime & data\n" +
        "⚡ Pay utility bills\n" +
        "💳 Manage your digital wallet\n\n" +
        "To get started, please tell me your full name (First, Middle, Last name).\n\n" +
        "Example: John Emeka Smith"
      );
      return;
    }

    // Move to name collection
    await user.update({ onboardingStep: 'name_collection' });
    
    // Log activity
    await ActivityLog.logUserActivity(
      user.id, 
      'user_registration', 
      'greeting_completed',
      { 
        source: 'whatsapp',
        description: 'User started onboarding process'
      }
    );

    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      "🎉 *Welcome to MiiMii!*\n\n" +
      "I'm excited to help you manage your finances effortlessly through WhatsApp!\n\n" +
      "Let's set up your account in just a few simple steps.\n\n" +
      "First, please tell me your *full name* (First, Middle, Last name).\n\n" +
      "📝 Example: John Emeka Smith"
    );
  }

  async handleNameCollection(user, message) {
    const nameParts = message.trim().split(/\s+/);
    
    if (nameParts.length < 2) {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "Please provide your complete name with at least your first and last name.\n\n" +
        "📝 Example: John Smith\n" +
        "📝 Example: John Emeka Smith"
      );
      return;
    }

    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
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
        newValues: { firstName, lastName, middleName }
      }
    );

    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `✅ Great! Nice to meet you, *${firstName}*!\n\n` +
      "Now I need some information to verify your identity and create your secure wallet.\n\n" +
      "Please provide the following details:\n\n" +
      "📅 *Date of Birth* (DD/MM/YYYY)\n" +
      "👤 *Gender* (Male/Female)\n" +
      "🏠 *Full Address*\n" +
      "🆔 *11-digit BVN* (Bank Verification Number)\n\n" +
      "You can send all this information in one message like this:\n\n" +
      "📝 Example:\n" +
      "01/01/1990\n" +
      "Male\n" +
      "123 Lagos Street, Victoria Island, Lagos\n" +
      "12345678901\n\n" +
      "Or send them one by one - I'll guide you through each step! 😊"
    );
  }

  async handleKycDataCollection(user, message, messageType) {
    let extractedData = null;
    
    // Handle image messages (ID cards, documents)
    if (messageType === 'image') {
      try {
        const ocrService = require('./ocr');
        extractedData = await ocrService.extractDataFromImage(message.mediaId, 'identity_document');
        
        if (extractedData && extractedData.bvn) {
          message = `${extractedData.dateOfBirth || ''}\n${extractedData.gender || ''}\n${extractedData.address || ''}\n${extractedData.bvn}`;
        } else {
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            "I couldn't extract the required information from the image. Please provide your details as text:\n\n" +
            "📅 Date of Birth (DD/MM/YYYY)\n" +
            "👤 Gender (Male/Female)\n" +
            "🏠 Address\n" +
            "🆔 BVN (11 digits)"
          );
          return;
        }
      } catch (error) {
        logger.error('OCR extraction failed during KYC', { error: error.message, userId: user.id });
        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          "I couldn't process the image. Please send your information as text instead."
        );
        return;
      }
    }

    // Parse the message for KYC data
    const kycData = this.parseKycData(message);
    
    if (!kycData.isComplete) {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `I need a bit more information. Please provide:\n\n${kycData.missingFields.join('\n')}\n\n` +
        "You can send all the details in one message or one by one."
      );
      return;
    }

    // Validate BVN format
    if (!kycData.bvn || kycData.bvn.length !== 11 || !/^\d{11}$/.test(kycData.bvn)) {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "❌ Invalid BVN format. Please provide your 11-digit Bank Verification Number.\n\n" +
        "📝 Example: 12345678901"
      );
      return;
    }

    // Update user and move to BVN verification
    await user.update({
      dateOfBirth: kycData.dateOfBirth,
      gender: kycData.gender,
      address: kycData.address,
      bvn: kycData.bvn,
      onboardingStep: 'bvn_verification',
      kycStatus: 'pending'
    });

    // Start KYC process
    try {
      await kycService.startKycProcess(user, user.whatsappNumber, kycData, extractedData);
      
      // Log activity
      await ActivityLog.logUserActivity(
        user.id, 
        'kyc_submission', 
        'kyc_data_submitted',
        { 
          source: 'whatsapp',
          description: 'User submitted KYC information',
          extractedFromImage: !!extractedData
        }
      );

      await user.update({ onboardingStep: 'virtual_account_creation' });
      await this.handleVirtualAccountCreation(user);
      
    } catch (error) {
      logger.error('KYC process failed', { error: error.message, userId: user.id });
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "❌ There was an issue verifying your information. Please check your details and try again.\n\n" +
        "If the problem persists, please contact our support team."
      );
    }
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

  async handlePinSetup(user, message) {
    const pin = message.trim().replace(/\s+/g, '');
    
    // Validate PIN
    if (!/^\d{4}$/.test(pin)) {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "❌ Invalid PIN format. Please provide a 4-digit PIN.\n\n" +
        "📝 Example: 1234"
      );
      return;
    }

    // Check for common weak PINs
    const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];
    if (weakPins.includes(pin)) {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        "⚠️ This PIN is too common and not secure. Please choose a different 4-digit PIN.\n\n" +
        "Avoid:\n• Repeated digits (1111, 2222)\n• Sequential numbers (1234, 4321)\n• Common patterns"
      );
      return;
    }

    // Set PIN and complete onboarding
    await user.update({
      pin: pin,
      onboardingStep: 'completed',
      kycStatus: 'verified'
    });

    // Log activity
    await ActivityLog.logUserActivity(
      user.id, 
      'pin_creation', 
      'pin_set_successfully',
      { 
        source: 'whatsapp',
        description: 'User completed PIN setup and onboarding'
      }
    );

    // Send welcome message with account summary
    const wallet = await walletService.getUserWallet(user.id);
    const walletSummary = wallet.getWalletSummary();

    await whatsappService.sendTextMessage(
      user.whatsappNumber,
      `🎉 *Welcome to MiiMii, ${user.firstName}!*\n\n` +
      `Your account is now fully set up and ready to use!\n\n` +
      `💰 *Wallet Balance:* ₦${walletSummary.balance.toLocaleString()}\n` +
      `💳 *Account Number:* ${walletSummary.virtualAccount.number}\n` +
      `🏦 *Bank:* ${walletSummary.virtualAccount.bank}\n\n` +
      `*What can I help you with?*\n\n` +
      `💸 Send money to anyone\n` +
      `📱 Buy airtime & data\n` +
      `⚡ Pay utility bills\n` +
      `📊 Check balance & history\n\n` +
      `Just tell me what you want to do! For example:\n` +
      `• "Send 5000 to John 08123456789"\n` +
      `• "Buy 1000 airtime for 08098765432"\n` +
      `• "Pay 3000 electricity bill"\n` +
      `• "Check my balance"\n\n` +
      `Type *help* anytime for assistance! 😊`
    );

    // Send referral information
    setTimeout(async () => {
      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `🎁 *Earn with MiiMii!*\n\n` +
        `Share your referral code: *${user.referralCode}*\n\n` +
        `Get ₦100 for every friend who joins and completes their first transaction!\n\n` +
        `They also get ₦50 welcome bonus! 🎉`
      );
    }, 5000);
  }

  async handleCompletedUserMessage(user, message, messageType) {
    // Forward to main AI processing
    const aiAssistantService = require('./aiAssistant');
    return await aiAssistantService.processUserMessage(user.whatsappNumber, message, messageType);
  }

  parseKycData(message) {
    const lines = message.split('\n').map(line => line.trim()).filter(line => line);
    const data = {};
    const missing = [];

    // Try to extract date of birth
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/;
    const dateMatch = message.match(dateRegex);
    if (dateMatch) {
      data.dateOfBirth = `${dateMatch[1].padStart(2, '0')}/${dateMatch[2].padStart(2, '0')}/${dateMatch[3]}`;
    } else {
      missing.push("📅 Date of Birth (DD/MM/YYYY)");
    }

    // Try to extract gender
    const genderRegex = /\b(male|female|man|woman|m|f)\b/i;
    const genderMatch = message.match(genderRegex);
    if (genderMatch) {
      const g = genderMatch[1].toLowerCase();
      data.gender = (g === 'male' || g === 'man' || g === 'm') ? 'male' : 'female';
    } else {
      missing.push("👤 Gender (Male/Female)");
    }

    // Try to extract BVN
    const bvnRegex = /\b(\d{11})\b/;
    const bvnMatch = message.match(bvnRegex);
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
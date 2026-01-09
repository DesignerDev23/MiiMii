const logger = require('../utils/logger');
const whatsappService = require('./whatsapp');
const activityLogger = require('./activityLogger');

class InteractiveFlowService {
  constructor() {
    this.flows = {
      onboarding: {
        name_collection: this.createNameCollectionFlow(),
        kyc_verification: this.createKycVerificationFlow(),
        pin_setup: this.createPinSetupFlow(),
        account_creation: this.createAccountCreationFlow()
      },
      services: {
        main_menu: this.createMainServiceMenuFlow(),
        money_transfer: this.createMoneyTransferFlow(),
        bill_payment: this.createBillPaymentFlow(),
        airtime_data: this.createAirtimeDataFlow(),
        data_purchase: this.createDataPurchaseFlow()
      },
      support: {
        help_center: this.createHelpCenterFlow(),
        contact_support: this.createContactSupportFlow()
      }
    };
  }

  // Main flow handler
  async handleInteractiveFlow(phoneNumber, flowType, flowStep, userData = {}, flowData = {}) {
    try {
      const flow = this.getFlow(flowType, flowStep);
      if (!flow) {
        throw new Error(`Flow not found: ${flowType}.${flowStep}`);
      }

      // Send typing indicator for better UX
      await whatsappService.sendTypingIndicator(phoneNumber, 1500);

      // Execute the flow
      const result = await flow.handler(phoneNumber, userData, flowData);
      
      // Log flow activity
      await activityLogger.logUserActivity(
        userData.userId || null,
        'interactive_flow',
        'flow_executed',
        {
          source: 'whatsapp',
          description: `Executed interactive flow: ${flowType}.${flowStep}`,
          flowType,
          flowStep,
          hasUserData: !!userData,
          hasFlowData: !!flowData
        }
      );

      return result;
    } catch (error) {
      logger.error('Interactive flow handling failed', { 
        error: error.message, 
        phoneNumber, 
        flowType, 
        flowStep 
      });
      
      // Send fallback message
      await whatsappService.sendTextMessage(
        phoneNumber,
        "I'm having trouble processing your request. Let me help you with a simple menu instead."
      );
      
      // Send basic service menu as fallback
      await this.sendBasicServiceMenu(phoneNumber);
      
      return { success: false, error: error.message };
    }
  }

  getFlow(flowType, flowStep) {
    return this.flows[flowType]?.[flowStep] || null;
  }

  // Onboarding Flows
  createNameCollectionFlow() {
    return {
      id: 'name_collection_flow',
      name: 'Name Collection',
      description: 'Interactive name collection for new users',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `👋 *Welcome to MiiMii!*\n\n` +
                `I'm your personal financial assistant. Let's get you set up!\n\n` +
                `First, I'd like to know what to call you. How would you like to proceed?`,
          buttons: [
            { id: 'quick_name_setup', title: '⚡ Quick Setup' },
            { id: 'detailed_name_setup', title: '📝 Detailed Setup' },
            { id: 'guided_name_setup', title: '🧭 Guided Setup' }
          ]
        };

        return await whatsappService.sendButtonMessage(
          phoneNumber,
          message.text,
          message.buttons
        );
      }
    };
  }

  createKycVerificationFlow() {
    return {
      id: 'kyc_verification_flow',
      name: 'KYC Verification',
      description: 'Interactive KYC document verification',
      handler: async (phoneNumber, userData, flowData) => {
        const templates = whatsappService.getOnboardingFlowTemplates();
        const kycFlow = templates.kycDataCollection;
        
        return await whatsappService.sendListMessage(
          phoneNumber,
          kycFlow.body,
          kycFlow.action.button,
          kycFlow.action.sections
        );
      }
    };
  }

  createPinSetupFlow() {
    return {
      id: 'pin_setup_flow',
      name: 'PIN Setup',
      description: 'Interactive PIN creation with security guidance',
      handler: async (phoneNumber, userData, flowData) => {
        const templates = whatsappService.getOnboardingFlowTemplates();
        const pinFlow = templates.pinSetup;
        
        return await whatsappService.sendButtonMessage(
          phoneNumber,
          pinFlow.body,
          pinFlow.action.buttons.map(btn => ({
            id: btn.reply.id,
            title: btn.reply.title
          }))
        );
      }
    };
  }

  createAccountCreationFlow() {
    return {
      id: 'account_creation_flow',
      name: 'Account Creation',
      description: 'Interactive account creation process',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `🏦 *Creating Your Account*\n\n` +
                `Your information has been verified! Let's create your MiiMii account.\n\n` +
                `What type of account would you like?`,
          buttons: [
            { id: 'standard_account', title: '💰 Standard Account' },
            { id: 'premium_account', title: '⭐ Premium Account' },
            { id: 'business_account', title: '🏢 Business Account' }
          ]
        };

        return await whatsappService.sendButtonMessage(
          phoneNumber,
          message.text,
          message.buttons
        );
      }
    };
  }

  // Service Flows
  createMainServiceMenuFlow() {
    return {
      id: 'main_service_menu_flow',
      name: 'Main Service Menu',
      description: 'Interactive main service selection',
      handler: async (phoneNumber, userData, flowData) => {
        const serviceMenus = whatsappService.getServiceMenus();
        const mainServices = serviceMenus.mainServices;
        
        return await whatsappService.sendListMessage(
          phoneNumber,
          mainServices.text,
          mainServices.buttonText,
          mainServices.sections
        );
      }
    };
  }

  createMoneyTransferFlow() {
    return {
      id: 'money_transfer_flow',
      name: 'Money Transfer',
      description: 'Interactive money transfer process',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `💸 *Send Money*\n\n` +
                `Choose how you'd like to send money:`,
          buttonText: 'Select Transfer Type',
          sections: [
            {
              title: 'Quick Transfer',
              rows: [
                { id: 'transfer_to_phone', title: '📱 To Phone Number', description: 'Send money using phone number' },
                { id: 'transfer_to_contact', title: '👥 To Contact', description: 'Send to saved contacts' },
                { id: 'recent_transfers', title: '🔄 Recent Recipients', description: 'Send to recent recipients' }
              ]
            },
            {
              title: 'Bank Transfer',
              rows: [
                { id: 'transfer_to_account', title: '🏦 To Bank Account', description: 'Transfer to any Nigerian bank' },
                { id: 'transfer_same_bank', title: '🔁 Same Bank Transfer', description: 'Instant same-bank transfers' }
              ]
            }
          ]
        };

        return await whatsappService.sendListMessage(
          phoneNumber,
          message.text,
          message.buttonText,
          message.sections
        );
      }
    };
  }

  createBillPaymentFlow() {
    return {
      id: 'bill_payment_flow',
      name: 'Bill Payment',
      description: 'Interactive bill payment selection',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `⚡ *Pay Bills*\n\n` +
                `What bill would you like to pay today?`,
          buttonText: 'Select Bill Type',
          sections: [
            {
              title: 'Utility Bills',
              rows: [
                { id: 'electricity_bill', title: '💡 Electricity', description: 'PHCN, EKEDC, EEDC, KEDCO & more' },
                { id: 'water_bill', title: '💧 Water', description: 'Water utility bills' },
                { id: 'waste_bill', title: '🗑️ Waste Management', description: 'Waste disposal bills' }
              ]
            },
            {
              title: 'Entertainment',
              rows: [
                { id: 'cable_tv_bill', title: '📺 Cable TV', description: 'DStv, GOtv, Startimes' },
                { id: 'internet_bill', title: '🌐 Internet', description: 'Wifi and internet bills' },
                { id: 'streaming_bill', title: '🎬 Streaming', description: 'Netflix, Spotify, etc.' }
              ]
            },
            {
              title: 'Government',
              rows: [
                { id: 'tax_payment', title: '🏛️ Tax Payment', description: 'FIRS, State taxes' },
                { id: 'govt_services', title: '📄 Govt Services', description: 'License renewals, permits' }
              ]
            }
          ]
        };

        return await whatsappService.sendListMessage(
          phoneNumber,
          message.text,
          message.buttonText,
          message.sections
        );
      }
    };
  }

  createAirtimeDataFlow() {
    return {
      id: 'airtime_data_flow',
      name: 'Airtime & Data',
      description: 'Interactive airtime and data purchase',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `📱 *Airtime & Data*\n\n` +
                `What would you like to purchase?`,
          buttonText: 'Select Service',
          sections: [
            {
              title: 'Airtime',
              rows: [
                { id: 'buy_airtime_self', title: '📞 Buy for Myself', description: 'Purchase airtime for your number' },
                { id: 'buy_airtime_others', title: '🎁 Buy for Others', description: 'Gift airtime to friends & family' },
                { id: 'bulk_airtime', title: '📦 Bulk Purchase', description: 'Buy airtime in bulk' }
              ]
            },
            {
              title: 'Data Bundles',
              rows: [
                { id: 'buy_data_self', title: '📶 Buy for Myself', description: 'Purchase data for your number' },
                { id: 'buy_data_others', title: '🎁 Gift Data', description: 'Send data to friends & family' },
                { id: 'data_subscriptions', title: '🔄 Auto-renewal', description: 'Set up automatic data renewal' }
              ]
            },
            {
              title: 'Special Offers',
              rows: [
                { id: 'combo_deals', title: '💫 Combo Deals', description: 'Airtime + Data packages' },
                { id: 'family_plans', title: '👨‍👩‍👧‍👦 Family Plans', description: 'Group data sharing plans' }
              ]
            }
          ]
        };

        return await whatsappService.sendListMessage(
          phoneNumber,
          message.text,
          message.buttonText,
          message.sections
        );
      }
    };
  }

  createDataPurchaseFlow() {
    return {
      id: 'data_purchase_flow',
      name: 'Data Purchase',
      description: 'Interactive data bundle purchase',
      handler: async (phoneNumber, userData, flowData) => {
        // Send the data purchase flow
        const whatsappService = require('./whatsapp');
        return await whatsappService.sendDataPurchaseFlow(phoneNumber, userData);
      }
    };
  }

  // Support Flows
  createHelpCenterFlow() {
    return {
      id: 'help_center_flow',
      name: 'Help Center',
      description: 'Interactive help and support center',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `🆘 *Help Center*\n\n` +
                `How can I help you today?`,
          buttonText: 'Select Help Topic',
          sections: [
            {
              title: 'Account Help',
              rows: [
                { id: 'account_issues', title: '👤 Account Issues', description: 'Login, profile, settings' },
                { id: 'kyc_help', title: '🆔 KYC Help', description: 'Verification problems' },
                { id: 'pin_issues', title: '🔐 PIN Issues', description: 'Forgot PIN, change PIN' }
              ]
            },
            {
              title: 'Transaction Help',
              rows: [
                { id: 'failed_transaction', title: '❌ Failed Transaction', description: 'Transaction not completed' },
                { id: 'missing_money', title: '💰 Missing Money', description: 'Money not received/sent' },
                { id: 'dispute_transaction', title: '⚖️ Dispute Transaction', description: 'Report transaction issues' }
              ]
            },
            {
              title: 'General Support',
              rows: [
                { id: 'how_to_use', title: '📖 How to Use MiiMii', description: 'App tutorial and guides' },
                { id: 'faq', title: '❓ FAQ', description: 'Frequently asked questions' },
                { id: 'contact_human', title: '👨‍💼 Speak to Agent', description: 'Connect with human support' }
              ]
            }
          ]
        };

        return await whatsappService.sendListMessage(
          phoneNumber,
          message.text,
          message.buttonText,
          message.sections
        );
      }
    };
  }

  createContactSupportFlow() {
    return {
      id: 'contact_support_flow',
      name: 'Contact Support',
      description: 'Interactive support contact options',
      handler: async (phoneNumber, userData, flowData) => {
        const message = {
          text: `👨‍💼 *Contact Support*\n\n` +
                `Choose how you'd like to reach our support team:`,
          buttons: [
            { id: 'live_chat', title: '💬 Live Chat' },
            { id: 'call_support', title: '📞 Call Us' },
            { id: 'email_support', title: '📧 Email Support' }
          ]
        };

        return await whatsappService.sendButtonMessage(
          phoneNumber,
          message.text,
          message.buttons
        );
      }
    };
  }

  // Utility Methods
  async sendBasicServiceMenu(phoneNumber) {
    const message = {
      text: `🏠 *Main Menu*\n\n` +
            `What would you like to do?`,
      buttons: [
        { id: 'check_balance', title: '💰 Check Balance' },
        { id: 'send_money', title: '💸 Send Money' },
        { id: 'buy_services', title: '📱 Buy Services' }
      ]
    };

    return await whatsappService.sendButtonMessage(
      phoneNumber,
      message.text,
      message.buttons
    );
  }

  async sendQuickActionsMenu(phoneNumber, userData) {
    const userActions = await this.getPersonalizedQuickActions(userData);
    
    const message = {
      text: `⚡ *Quick Actions*\n\n` +
            `Here are some actions based on your recent activity:`,
      buttonText: 'Select Action',
      sections: [
        {
          title: 'Recent Activity',
          rows: userActions.recent
        },
        {
          title: 'Favorites',
          rows: userActions.favorites
        },
        {
          title: 'Recommended',
          rows: userActions.recommended
        }
      ]
    };

    return await whatsappService.sendListMessage(
      phoneNumber,
      message.text,
      message.buttonText,
      message.sections
    );
  }

  async getPersonalizedQuickActions(userData) {
    // This would normally query the database for user's transaction history
    // For now, return default actions
    return {
      recent: [
        { id: 'repeat_last_transfer', title: '🔄 Repeat Last Transfer', description: 'Send ₦5,000 to John again' },
        { id: 'buy_usual_data', title: '📶 Buy Usual Data', description: '1GB MTN data bundle' }
      ],
      favorites: [
        { id: 'favorite_contact_1', title: '👥 Send to Sarah', description: 'Quick transfer to Sarah' },
        { id: 'favorite_bill_1', title: '💡 Pay PHCN Bill', description: 'Meter: 123456789' }
      ],
      recommended: [
        { id: 'check_promos', title: '🎁 Check Promos', description: 'See available discounts' },
        { id: 'refer_friend', title: '👫 Refer a Friend', description: 'Earn ₦500 bonus' }
      ]
    };
  }

  // Flow Analytics
  async logFlowCompletion(phoneNumber, flowType, flowStep, userData, success = true) {
    try {
      await activityLogger.logUserActivity(
        userData.userId || null,
        'interactive_flow',
        success ? 'flow_completed' : 'flow_failed',
        {
          source: 'whatsapp',
          description: `${success ? 'Completed' : 'Failed'} interactive flow: ${flowType}.${flowStep}`,
          flowType,
          flowStep,
          phoneNumber,
          success
        }
      );
    } catch (error) {
      logger.warn('Failed to log flow completion', { error: error.message });
    }
  }

  // Flow Validation
  validateFlowData(flowType, flowStep, data) {
    const flow = this.getFlow(flowType, flowStep);
    if (!flow) return false;

    // Add specific validation logic based on flow type
    switch (flowType) {
      case 'onboarding':
        return this.validateOnboardingData(flowStep, data);
      case 'services':
        return this.validateServiceData(flowStep, data);
      default:
        return true;
    }
  }

  validateOnboardingData(flowStep, data) {
    switch (flowStep) {
      case 'name_collection':
        return data.firstName && data.firstName.length >= 2;
      case 'kyc_verification':
        return data.bvn && data.bvn.length === 11;
      case 'pin_setup':
        return data.pin && /^\d{4}$/.test(data.pin);
      default:
        return true;
    }
  }

  validateServiceData(flowStep, data) {
    switch (flowStep) {
      case 'money_transfer':
        return data.amount && data.recipient;
      case 'bill_payment':
        return data.billType && data.amount;
      default:
        return true;
    }
  }
}

module.exports = new InteractiveFlowService();
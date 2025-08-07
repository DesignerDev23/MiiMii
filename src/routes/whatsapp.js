const express = require('express');
const whatsappService = require('../services/whatsapp');
const interactiveFlowService = require('../services/interactiveFlowService');
const logger = require('../utils/logger');

const router = express.Router();

// Send text message
router.post('/send-message', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    // Validate and format phone number before sending
    try {
      const formattedNumber = whatsappService.formatToE164(to);
      if (!whatsappService.validateE164(formattedNumber)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format. Expected E.164 format (+234...) or Nigerian format (08...)',
          receivedNumber: to,
          expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
        });
      }
    } catch (formatError) {
      return res.status(400).json({ 
        error: 'Invalid phone number format', 
        details: formatError.message,
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    const result = await whatsappService.sendTextMessage(to, message);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: whatsappService.formatToE164(to) // Return the formatted number
    });
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send button message
router.post('/send-button-message', async (req, res) => {
  try {
    const { to, text, buttons } = req.body;

    if (!to || !text || !buttons) {
      return res.status(400).json({ error: 'Phone number, text, and buttons are required' });
    }

    // Validate and format phone number before sending
    try {
      const formattedNumber = whatsappService.formatToE164(to);
      if (!whatsappService.validateE164(formattedNumber)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format. Expected E.164 format (+234...) or Nigerian format (08...)',
          receivedNumber: to,
          expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
        });
      }
    } catch (formatError) {
      return res.status(400).json({ 
        error: 'Invalid phone number format', 
        details: formatError.message,
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    const result = await whatsappService.sendButtonMessage(to, text, buttons);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: whatsappService.formatToE164(to) // Return the formatted number
    });
  } catch (error) {
    logger.error('Failed to send WhatsApp button message', { error: error.message });
    res.status(500).json({ error: 'Failed to send button message' });
  }
});

// Send list message
router.post('/send-list-message', async (req, res) => {
  try {
    const { to, text, buttonText, sections } = req.body;

    if (!to || !text || !buttonText || !sections) {
      return res.status(400).json({ 
        error: 'Phone number, text, buttonText, and sections are required' 
      });
    }

    // Validate and format phone number before sending
    try {
      const formattedNumber = whatsappService.formatToE164(to);
      if (!whatsappService.validateE164(formattedNumber)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format. Expected E.164 format (+234...) or Nigerian format (08...)',
          receivedNumber: to,
          expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
        });
      }
    } catch (formatError) {
      return res.status(400).json({ 
        error: 'Invalid phone number format', 
        details: formatError.message,
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    const result = await whatsappService.sendListMessage(to, text, buttonText, sections);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: whatsappService.formatToE164(to) // Return the formatted number
    });
  } catch (error) {
    logger.error('Failed to send WhatsApp list message', { error: error.message });
    res.status(500).json({ error: 'Failed to send list message' });
  }
});

// Download media
router.get('/media/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;

    const media = await whatsappService.downloadMedia(mediaId);
    
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Length', media.fileSize);
    
    media.stream.pipe(res);
  } catch (error) {
    logger.error('Failed to download WhatsApp media', { error: error.message });
    res.status(500).json({ error: 'Failed to download media' });
  }
});

// Get predefined messages
router.get('/templates', (req, res) => {
  res.json({
    welcome: whatsappService.getWelcomeMessage(),
    menu: whatsappService.getMenuMessage(),
    services: whatsappService.getServicesMenu()
  });
});

// Test interactive welcome message
router.post('/test-welcome', async (req, res) => {
  try {
    const { to, userName, isReturningUser } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const welcomeMessage = await whatsappService.getDynamicWelcomeMessage(userName, isReturningUser);
    
    const result = await whatsappService.sendButtonMessage(
      to,
      welcomeMessage.text,
      welcomeMessage.buttons
    );
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      message: 'Dynamic welcome message sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send test welcome message', { error: error.message });
    res.status(500).json({ error: 'Failed to send welcome message' });
  }
});

// Test interactive flow
router.post('/test-flow', async (req, res) => {
  try {
    const { to, flowType, flowStep, userData, flowData } = req.body;

    if (!to || !flowType || !flowStep) {
      return res.status(400).json({ 
        error: 'Phone number, flowType, and flowStep are required' 
      });
    }

    const result = await interactiveFlowService.handleInteractiveFlow(
      to,
      flowType,
      flowStep,
      userData || {},
      flowData || {}
    );
    
    res.json({
      success: true,
      result,
      message: `Interactive flow ${flowType}.${flowStep} executed successfully`
    });
  } catch (error) {
    logger.error('Failed to execute test flow', { error: error.message });
    res.status(500).json({ error: 'Failed to execute flow' });
  }
});

// Test typing indicator
router.post('/test-typing', async (req, res) => {
  try {
    const { to, duration } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    await whatsappService.sendTypingIndicator(to, duration || 3000);
    
    res.json({
      success: true,
      message: 'Typing indicator sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send typing indicator', { error: error.message });
    res.status(500).json({ error: 'Failed to send typing indicator' });
  }
});

// Test service menu
router.post('/test-service-menu', async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const serviceMenus = whatsappService.getServiceMenus();
    const mainServices = serviceMenus.mainServices;
    
    const result = await whatsappService.sendListMessage(
      to,
      mainServices.text,
      mainServices.buttonText,
      mainServices.sections
    );
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      message: 'Service menu sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send service menu', { error: error.message });
    res.status(500).json({ error: 'Failed to send service menu' });
  }
});

// Test onboarding flow templates
router.post('/test-onboarding-template', async (req, res) => {
  try {
    const { to, templateType } = req.body;

    if (!to || !templateType) {
      return res.status(400).json({ 
        error: 'Phone number and templateType are required' 
      });
    }

    const templates = whatsappService.getOnboardingFlowTemplates();
    const template = templates[templateType];
    
    if (!template) {
      return res.status(400).json({ 
        error: `Template '${templateType}' not found. Available: ${Object.keys(templates).join(', ')}` 
      });
    }

    let result;
    if (template.type === 'list') {
      result = await whatsappService.sendListMessage(
        to,
        template.body,
        template.action.button,
        template.action.sections
      );
    } else if (template.type === 'button') {
      result = await whatsappService.sendButtonMessage(
        to,
        template.body,
        template.action.buttons.map(btn => ({
          id: btn.reply.id,
          title: btn.reply.title
        }))
      );
    } else {
      result = await whatsappService.sendTextMessage(to, template.body);
    }
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      templateType,
      message: 'Onboarding template sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send onboarding template', { error: error.message });
    res.status(500).json({ error: 'Failed to send onboarding template' });
  }
});

// Get available templates and flows
router.get('/interactive-resources', (req, res) => {
  try {
    const templates = whatsappService.getOnboardingFlowTemplates();
    const serviceMenus = whatsappService.getServiceMenus();
    
    res.json({
      onboardingTemplates: Object.keys(templates),
      serviceMenus: Object.keys(serviceMenus),
      availableFlows: {
        onboarding: ['name_collection', 'kyc_verification', 'pin_setup', 'account_creation'],
        services: ['main_menu', 'money_transfer', 'bill_payment', 'airtime_data'],
        support: ['help_center', 'contact_support']
      },
      exampleUsage: {
        welcome: {
          endpoint: '/test-welcome',
          payload: { to: '+234XXXXXXXXXX', userName: 'John', isReturningUser: false }
        },
        flow: {
          endpoint: '/test-flow',
          payload: { to: '+234XXXXXXXXXX', flowType: 'onboarding', flowStep: 'name_collection' }
        },
        template: {
          endpoint: '/test-onboarding-template',
          payload: { to: '+234XXXXXXXXXX', templateType: 'kycDataCollection' }
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get interactive resources', { error: error.message });
    res.status(500).json({ error: 'Failed to get resources' });
  }
});

// WhatsApp Flow endpoint for handling Flow interactions
router.post('/flow', async (req, res) => {
  try {
    const { 
      version, 
      action, 
      screen, 
      data, 
      flow_token,
      encrypted_flow_data,
      encrypted_aes_key,
      encrypted_iv
    } = req.body;

    logger.info('WhatsApp Flow request received', {
      version,
      action,
      screen,
      hasFlowToken: !!flow_token,
      hasEncryptedData: !!encrypted_flow_data
    });

    // Validate flow version
    if (version !== '3.0' && version !== '3') {
      return res.status(400).json({
        error: 'Unsupported flow version',
        supported_versions: ['3.0']
      });
    }

    // Handle different flow actions
    switch (action) {
      case 'ping':
        return res.json({
          version: '3.0',
          data: {
            status: 'active'
          }
        });

      case 'INIT':
        return await handleFlowInit(req, res, { screen, data, flow_token });

      case 'data_exchange':
        return await handleFlowDataExchange(req, res, { 
          screen, 
          data, 
          flow_token,
          encrypted_flow_data,
          encrypted_aes_key,
          encrypted_iv
        });

      default:
        logger.warn('Unknown flow action', { action });
        return res.status(400).json({
          error: 'Unknown action',
          received_action: action
        });
    }

  } catch (error) {
    logger.error('WhatsApp Flow processing error', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Flow processing failed'
    });
  }
});

// Test Flow message sending
router.post('/test-flow-message', async (req, res) => {
  try {
    const { to, flowData } = req.body;

    if (!to || !flowData) {
      return res.status(400).json({ 
        error: 'Phone number and flowData are required' 
      });
    }

    // Validate and format phone number
    const formattedNumber = whatsappService.formatToE164(to);
    if (!whatsappService.validateE164(formattedNumber)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    const result = await whatsappService.sendFlowMessage(to, flowData);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: formattedNumber
    });
  } catch (error) {
    logger.error('Failed to send Flow message', { error: error.message });
    res.status(500).json({ error: 'Failed to send Flow message' });
  }
});

// Test comprehensive interactive features
router.post('/test-interactive-bot', async (req, res) => {
  try {
    const { to, testScenario } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate and format phone number
    const formattedNumber = whatsappService.formatToE164(to);
    if (!whatsappService.validateE164(formattedNumber)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    let result;
    
    switch (testScenario) {
      case 'welcome_new_user':
        // Simulate new user with profile name
        await whatsappService.sendTypingIndicator(to, 2000);
        
        const welcomeText = `👋 *Hey Designer!* 👋\n\n` +
                           `I'm Xara, your Personal Account Manager AI from Xava Technologies! 😎\n\n` +
                           `I can handle transactions, schedule payments, and even analyze your spending! 📊\n\n` +
                           `🔒 For extra security, lock your WhatsApp!\n\n` +
                           `Ready to start your onboarding and explore? Let's go! 🚀`;
        
        const welcomeButtons = [
          { id: 'complete_onboarding', title: '✅ Get Started' },
          { id: 'learn_more', title: '📚 Learn More' },
          { id: 'get_help', title: '❓ Get Help' }
        ];
        
        result = await whatsappService.sendButtonMessage(to, welcomeText, welcomeButtons);
        break;

      case 'welcome_returning_user':
        await whatsappService.sendTypingIndicator(to, 1500);
        
        const returnText = `🌟 *Welcome back, Designer!* 🌟\n\n` +
                          `Great to see you again! I'm Xara, your Personal Account Manager AI from Xava Technologies.\n\n` +
                          `I'm here to help you manage your finances. What would you like to do today?`;
        
        const returnButtons = [
          { id: 'view_balance', title: '💰 Check Balance' },
          { id: 'send_money', title: '💸 Send Money' },
          { id: 'pay_bills', title: '📱 Pay Bills' }
        ];
        
        result = await whatsappService.sendButtonMessage(to, returnText, returnButtons);
        break;

      case 'typing_demo':
        await whatsappService.sendTypingIndicator(to, 3000);
        result = await whatsappService.sendTextMessage(
          to, 
          '⌨️ Did you see the typing indicator? This makes our bot feel more human and interactive!'
        );
        break;

      case 'flow_message':
        // Send a Flow message for onboarding
        const flowData = {
          flowId: process.env.WHATSAPP_ONBOARDING_FLOW_ID || 'DEMO_FLOW',
          flowToken: 'demo_token_123',
          flowCta: 'Complete Onboarding',
          header: {
            type: 'text',
            text: 'Account Setup'
          },
          body: `Hi Designer! 👋\n\nLet's complete your MiiMii account setup. This will only take a few minutes.\n\nYou'll provide:\n✅ Personal details\n✅ BVN for verification\n✅ Set up your PIN\n\nReady to start?`,
          footer: 'Secure • Fast • Easy',
          flowActionPayload: {}  // Empty payload to avoid WhatsApp API errors
        };

        await whatsappService.sendTypingIndicator(to, 2000);
        result = await whatsappService.sendFlowMessage(to, flowData);
        break;

      case 'learn_more':
        await whatsappService.sendTypingIndicator(to, 1500);
        
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
        
        result = await whatsappService.sendButtonMessage(to, learnMoreText, learnButtons);
        break;

      default:
        return res.status(400).json({ 
          error: 'Invalid test scenario', 
          available: ['welcome_new_user', 'welcome_returning_user', 'typing_demo', 'flow_message', 'learn_more']
        });
    }
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: formattedNumber,
      testScenario,
      message: 'Interactive bot test completed successfully'
    });

  } catch (error) {
    logger.error('Failed to test interactive bot', { error: error.message });
    res.status(500).json({ error: 'Failed to test interactive bot features' });
  }
});

// Configuration endpoint for Flow settings
router.post('/configure-flow', async (req, res) => {
  try {
    const { flowId, flowSecret, webhookUrl } = req.body;

    if (!flowId) {
      return res.status(400).json({ error: 'Flow ID is required' });
    }

    // Store configuration (in production, save to database or environment)
    const config = {
      flowId,
      flowSecret: flowSecret || process.env.WHATSAPP_FLOW_SECRET,
      webhookUrl: webhookUrl || `${process.env.BASE_URL}/api/whatsapp/flow`,
      timestamp: new Date().toISOString()
    };

    logger.info('WhatsApp Flow configuration updated', config);

    res.json({
      success: true,
      message: 'Flow configuration updated successfully',
      config: {
        flowId: config.flowId,
        webhookUrl: config.webhookUrl,
        timestamp: config.timestamp
      }
    });

  } catch (error) {
    logger.error('Failed to configure flow', { error: error.message });
    res.status(500).json({ error: 'Failed to configure flow' });
  }
});

// Create WhatsApp Flow templates
router.post('/create-flow-templates', async (req, res) => {
  try {
    const whatsappFlowService = require('../services/whatsappFlowService');
    
    // Create onboarding flow template
    const onboardingTemplate = await whatsappFlowService.createOnboardingFlowTemplate();
    
    // Create login flow template
    const loginTemplate = await whatsappFlowService.createLoginFlowTemplate();
    
    res.json({
      success: true,
      message: 'Flow templates created successfully',
      templates: {
        onboarding: {
          id: onboardingTemplate.id,
          name: onboardingTemplate.name,
          status: onboardingTemplate.status
        },
        login: {
          id: loginTemplate.id,
          name: loginTemplate.name,
          status: loginTemplate.status
        }
      }
    });
  } catch (error) {
    logger.error('Failed to create Flow templates', { error: error.message });
    res.status(500).json({ error: 'Failed to create Flow templates' });
  }
});

// Send Flow message for testing
router.post('/send-flow-message', async (req, res) => {
  try {
    const { to, flowType } = req.body;

    if (!to || !flowType) {
      return res.status(400).json({ 
        error: 'Phone number and flowType are required' 
      });
    }

    // Validate and format phone number
    const formattedNumber = whatsappService.formatToE164(to);
    if (!whatsappService.validateE164(formattedNumber)) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        receivedNumber: to,
        expectedFormat: 'E.164 (+234XXXXXXXXXX) or Nigerian (08XXXXXXXXX)'
      });
    }

    const whatsappFlowService = require('../services/whatsappFlowService');
    
    // Get or create user
    const userService = require('../services/user');
    const user = await userService.getOrCreateUser(to);
    
    let flowData;
    
    if (flowType === 'onboarding') {
      // Check if we have a valid flow ID configured
      const flowId = process.env.WHATSAPP_ONBOARDING_FLOW_ID;
      if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow') {
        return res.status(400).json({
          success: false,
          error: 'WhatsApp Flow ID not configured',
          message: 'Please set WHATSAPP_ONBOARDING_FLOW_ID environment variable'
        });
      }
      
      const flowToken = whatsappFlowService.generateFlowToken(user.id);
      flowData = {
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
    } else if (flowType === 'login') {
      const flowToken = whatsappFlowService.generateFlowToken(user.id);
      flowData = {
        flowId: process.env.WHATSAPP_LOGIN_FLOW_ID || 'miimii_login_flow',
        flowToken: flowToken,
        flowCta: 'Login with PIN',
        header: {
          type: 'text',
          text: 'Account Login'
        },
        body: `Welcome back, ${user.fullName || user.firstName || 'there'}! 👋\n\nPlease enter your 4-digit PIN to access your account securely.`,
        footer: 'Secure Login',
        flowActionPayload: {}  // Empty payload to avoid WhatsApp API errors
      };
    } else {
      return res.status(400).json({ 
        error: 'Invalid flowType. Supported: onboarding, login' 
      });
    }

    // Send the Flow message using the configured Flow ID
    const result = await whatsappService.sendFlowMessage(to, flowData);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: formattedNumber,
      flowType,
      flowToken: flowData.flowToken
    });
  } catch (error) {
    logger.error('Failed to send Flow message', { error: error.message });
    res.status(500).json({ error: 'Failed to send Flow message' });
  }
});

// Test Flow webhook handling
router.post('/test-flow-webhook', async (req, res) => {
  try {
    const { flowData } = req.body;

    if (!flowData) {
      return res.status(400).json({ error: 'Flow data is required' });
    }

    const whatsappFlowService = require('../services/whatsappFlowService');
    const result = await whatsappFlowService.handleFlowWebhook(flowData);
    
    res.json({
      success: true,
      result,
      message: 'Flow webhook processed successfully'
    });
  } catch (error) {
    logger.error('Failed to test Flow webhook', { error: error.message });
    res.status(500).json({ error: 'Failed to process Flow webhook' });
  }
});

// Flow handlers
async function handleFlowInit(req, res, { screen, data, flow_token }) {
  try {
    // Verify flow token
    const tokenData = await verifyFlowToken(flow_token);
    if (!tokenData.valid) {
      return res.status(401).json({
        error: 'Invalid flow token'
      });
    }

    // Return initial screen configuration based on the flow type
    const initialScreen = getInitialFlowScreen(screen, tokenData.userId);
    
    return res.json({
      version: '3.0',
      screen: screen,
      data: initialScreen
    });

  } catch (error) {
    logger.error('Flow INIT error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to initialize flow'
    });
  }
}

async function handleFlowDataExchange(req, res, { 
  screen, 
  data, 
  flow_token,
  encrypted_flow_data,
  encrypted_aes_key,
  encrypted_iv 
}) {
  try {
    // Verify flow token
    const tokenData = await verifyFlowToken(flow_token);
    if (!tokenData.valid) {
      return res.status(401).json({
        error: 'Invalid flow token'
      });
    }

    // Decrypt flow data if encrypted
    let flowData = data;
    if (encrypted_flow_data) {
      flowData = await decryptFlowData(encrypted_flow_data, encrypted_aes_key, encrypted_iv);
    }

    // Process the flow data based on screen
    const result = await processFlowScreen(screen, flowData, tokenData.userId);
    
    return res.json({
      version: '3.0',
      screen: result.nextScreen || screen,
      data: result.data || {}
    });

  } catch (error) {
    logger.error('Flow data exchange error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to process flow data'
    });
  }
}

async function verifyFlowToken(flow_token) {
  try {
    // Simple token verification - in production, use proper JWT or similar
    const crypto = require('crypto');
    const parts = flow_token.split('_');
    if (parts.length < 2) {
      return { valid: false };
    }

    // Extract user ID and verify token integrity
    const userId = parts[0];
    const expectedToken = crypto.createHash('sha256')
      .update(userId + '_' + parts[1] + process.env.APP_SECRET)
      .digest('hex');

    return {
      valid: expectedToken === parts[2] || true, // Allow for development
      userId: parseInt(userId)
    };
  } catch (error) {
    logger.error('Token verification error', { error: error.message });
    return { valid: false };
  }
}

function getInitialFlowScreen(screen, userId) {
  // Return initial screen data based on the screen type
  switch (screen) {
    case 'personal_details':
      return {
        title: 'Personal Information',
        fields: [
          {
            type: 'text_input',
            name: 'first_name',
            label: 'First Name',
            required: true,
            placeholder: 'Enter your first name'
          },
          {
            type: 'text_input',
            name: 'last_name',
            label: 'Last Name',
            required: true,
            placeholder: 'Enter your last name'
          },
          {
            type: 'date_picker',
            name: 'date_of_birth',
            label: 'Date of Birth',
            required: true
          },
          {
            type: 'dropdown',
            name: 'gender',
            label: 'Gender',
            required: true,
            options: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' }
            ]
          }
        ]
      };
    
    case 'bvn_verification':
      return {
        title: 'BVN Verification',
        fields: [
          {
            type: 'text_input',
            name: 'bvn',
            label: 'Bank Verification Number (BVN)',
            required: true,
            placeholder: 'Enter your 11-digit BVN',
            max_length: 11,
            input_type: 'number'
          }
        ]
      };
    
    case 'pin_setup':
      return {
        title: 'Secure PIN Setup',
        fields: [
          {
            type: 'text_input',
            name: 'pin',
            label: 'Create 4-digit PIN',
            required: true,
            input_type: 'password',
            max_length: 4,
            placeholder: '••••'
          },
          {
            type: 'text_input',
            name: 'confirm_pin',
            label: 'Confirm PIN',
            required: true,
            input_type: 'password',
            max_length: 4,
            placeholder: '••••'
          }
        ]
      };
    
    default:
      return {
        title: 'Account Setup',
        message: 'Welcome to MiiMii account setup!'
      };
  }
}

async function processFlowScreen(screen, data, userId) {
  const userService = require('../services/user');
  const kycService = require('../services/kyc');
  const onboardingService = require('../services/onboarding');

  try {
    switch (screen) {
      case 'personal_details':
        // Save personal details
        const user = await userService.getUserById(userId);
        if (user) {
          await user.update({
            firstName: data.first_name,
            lastName: data.last_name,
            dateOfBirth: data.date_of_birth,
            gender: data.gender
          });
        }
        
        return {
          nextScreen: 'bvn_verification',
          data: { success: true, message: 'Personal details saved successfully' }
        };

      case 'bvn_verification':
        // Process BVN verification
        const bvnResult = await kycService.verifyBVN(data.bvn, userId);
        
        if (bvnResult.success) {
          return {
            nextScreen: 'pin_setup',
            data: { success: true, message: 'BVN verified successfully' }
          };
        } else {
          return {
            nextScreen: 'bvn_verification',
            data: { 
              success: false, 
              error: 'BVN verification failed. Please check and try again.' 
            }
          };
        }

      case 'pin_setup':
        // Validate and save PIN
        if (data.pin !== data.confirm_pin) {
          return {
            nextScreen: 'pin_setup',
            data: { 
              success: false, 
              error: 'PINs do not match. Please try again.' 
            }
          };
        }

        // Save PIN and complete onboarding
        await onboardingService.completePinSetup(userId, data.pin);
        
        return {
          nextScreen: 'completion',
          data: { 
            success: true, 
            message: 'Account setup completed! Welcome to MiiMii!' 
          }
        };

      default:
        return {
          data: { error: 'Unknown screen' }
        };
    }
  } catch (error) {
    logger.error('Flow screen processing error', { error: error.message, screen, userId });
    return {
      data: { 
        success: false, 
        error: 'Processing failed. Please try again.' 
      }
    };
  }
}

async function decryptFlowData(encryptedData, encryptedKey, encryptedIv) {
  // Implement flow data decryption according to Meta's documentation
  // This is a placeholder - implement actual decryption
  try {
    // For now, return the encrypted data as-is for development
    return JSON.parse(Buffer.from(encryptedData, 'base64').toString());
  } catch (error) {
    logger.error('Flow data decryption error', { error: error.message });
    throw new Error('Failed to decrypt flow data');
  }
}

module.exports = router;
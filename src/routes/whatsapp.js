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

module.exports = router;
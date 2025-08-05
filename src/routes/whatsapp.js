const express = require('express');
const whatsappService = require('../services/whatsapp');
const logger = require('../utils/logger');

const router = express.Router();

// Send text message
router.post('/send-message', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const result = await whatsappService.sendTextMessage(to, message);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to
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

    const result = await whatsappService.sendButtonMessage(to, text, buttons);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to
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

    const result = await whatsappService.sendListMessage(to, text, buttonText, sections);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to
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

module.exports = router;
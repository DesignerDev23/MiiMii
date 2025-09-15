const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const logger = require('../utils/logger');
const WhatsAppDiagnostics = require('../utils/whatsappDiagnostics');

/**
 * Test WhatsApp image sending with multiple approaches
 */
router.post('/test-image-send', async (req, res) => {
  try {
    const { to, testType = 'buffer' } = req.body;
    
    if (!to) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number (to) is required' 
      });
    }

    logger.info('Testing WhatsApp image sending', { to, testType });

    // Create a simple test image buffer (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x5C, 0xC1, 0x8E, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    let result;
    
    if (testType === 'template') {
      // Test Media Message Template approach
      result = await whatsappService.sendImageMessageTemplate(
        to, 
        testImageBuffer, 
        'test-image.png', 
        'Test Image via Template'
      );
    } else if (testType === 'url') {
      // Test URL approach (would need a public URL)
      const testImageUrl = 'https://via.placeholder.com/150x150.png?text=Test';
      result = await whatsappService.sendImageMessageByUrl(
        to, 
        testImageUrl, 
        'Test Image via URL'
      );
    } else {
      // Test standard buffer approach with multiple fallbacks
      result = await whatsappService.sendImageMessage(
        to, 
        testImageBuffer, 
        'test-image.png', 
        'Test Image via Buffer'
      );
    }

    logger.info('WhatsApp image test result', { 
      to, 
      testType, 
      success: result.success,
      messageId: result.messageId,
      error: result.error
    });

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      testType,
      to
    });

  } catch (error) {
    logger.error('WhatsApp image test failed', { 
      error: error.message, 
      to: req.body.to,
      testType: req.body.testType
    });
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      testType: req.body.testType
    });
  }
});

/**
 * Test WhatsApp configuration
 */
router.get('/test-config', async (req, res) => {
  try {
    const whatsappConfig = whatsappService.getConfig();
    
    res.json({
      success: true,
      config: {
        phoneNumberId: whatsappConfig.phoneNumberId,
        accessTokenPrefix: whatsappConfig.accessToken.substring(0, 20) + '...',
        accessTokenLength: whatsappConfig.accessToken.length,
        baseURL: whatsappConfig.baseURL
      }
    });
  } catch (error) {
    logger.error('WhatsApp config test failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Run comprehensive WhatsApp diagnostics
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const diagnostics = new WhatsAppDiagnostics();
    const results = await diagnostics.runDiagnostics();
    const report = diagnostics.generateReport(results);
    
    logger.info('WhatsApp diagnostics completed', { 
      passedTests: report.summary.passedTests,
      failedTests: report.summary.failedTests
    });
    
    res.json({
      success: true,
      results,
      report
    });
  } catch (error) {
    logger.error('WhatsApp diagnostics failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

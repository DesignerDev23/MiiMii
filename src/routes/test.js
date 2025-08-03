const express = require('express');
const router = express.Router();
const kycService = require('../services/kyc');
const bellbankService = require('../services/bellbank');
const whatsappService = require('../services/whatsapp');
const aiService = require('../services/ai');
const ocrService = require('../services/ocr');
const transcriptionService = require('../services/transcription');
const logger = require('../utils/logger');

// Test routes (only available in development)
if (process.env.NODE_ENV !== 'production') {

  // Test BellBank integration
  router.post('/bellbank/token', async (req, res) => {
    try {
      const token = await bellbankService.generateToken();
      res.json({ success: true, token });
    } catch (error) {
      logger.error('BellBank token test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/bellbank/banks', async (req, res) => {
    try {
      const banks = await bellbankService.getBankList();
      res.json({ success: true, banks: banks.slice(0, 10) }); // Return first 10 banks
    } catch (error) {
      logger.error('BellBank bank list test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/bellbank/validate-account', async (req, res) => {
    try {
      const { bankCode, accountNumber } = req.body;
      const result = await bellbankService.validateBankAccount(bankCode, accountNumber);
      res.json({ success: true, result });
    } catch (error) {
      logger.error('BellBank account validation test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test Dojah KYC integration
  router.post('/kyc/bvn', async (req, res) => {
    try {
      const { bvn } = req.body;
      const testBvn = bvn || '22222222222'; // Use test BVN if not provided
      const result = await kycService.testBvnLookup();
      res.json({ success: true, result });
    } catch (error) {
      logger.error('Dojah BVN test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/kyc/nin', async (req, res) => {
    try {
      const { nin } = req.body;
      const testNin = nin || '70123456789'; // Use test NIN if not provided
      const result = await kycService.testNinLookup();
      res.json({ success: true, result });
    } catch (error) {
      logger.error('Dojah NIN test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/kyc/verify-user', async (req, res) => {
    try {
      const { bvn, firstName, lastName, dateOfBirth } = req.body;
      
      // Create a mock user object for testing
      const mockUser = {
        id: 'test-user-123',
        firstName: firstName || 'John',
        lastName: lastName || 'Doe',
        dateOfBirth: dateOfBirth || '1990-01-01'
      };

      const result = await kycService.verifyBvn(bvn || '22222222222', mockUser);
      res.json({ success: true, result });
    } catch (error) {
      logger.error('KYC verification test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test AI service
  router.post('/ai/analyze', async (req, res) => {
    try {
      const { message, userContext } = req.body;
      const result = await aiService.analyzeIntent(
        message || "Send 5000 naira to John on 08012345678",
        userContext || { userId: 'test-user-123', phoneNumber: '08087654321' }
      );
      res.json({ success: true, result });
    } catch (error) {
      logger.error('AI analysis test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test WhatsApp service
  router.post('/whatsapp/send', async (req, res) => {
    try {
      const { to, message } = req.body;
      if (!to || !message) {
        return res.status(400).json({ 
          success: false, 
          error: 'Phone number (to) and message are required' 
        });
      }
      
      const result = await whatsappService.sendTextMessage(to, message);
      res.json({ success: true, result });
    } catch (error) {
      logger.error('WhatsApp send test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test OCR service
  router.post('/ocr', async (req, res) => {
    try {
      if (!req.files || !req.files.image) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image file is required' 
        });
      }

      const imageBuffer = req.files.image.data;
      const result = await ocrService.extractText(imageBuffer);
      res.json({ success: true, result });
    } catch (error) {
      logger.error('OCR test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test transcription service
  router.post('/transcription', async (req, res) => {
    try {
      if (!req.files || !req.files.audio) {
        return res.status(400).json({ 
          success: false, 
          error: 'Audio file is required' 
        });
      }

      const audioBuffer = req.files.audio.data;
      const result = await transcriptionService.transcribeAudio(audioBuffer);
      res.json({ success: true, result });
    } catch (error) {
      logger.error('Transcription test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test database connection
  router.get('/db/connection', async (req, res) => {
    try {
      const { sequelize } = require('../database/connection');
      await sequelize.authenticate();
      res.json({ success: true, message: 'Database connection successful' });
    } catch (error) {
      logger.error('Database connection test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test webhook verification
  router.post('/webhook/verify', async (req, res) => {
    try {
      const { provider, payload, signature } = req.body;
      
      // Mock webhook verification based on provider
      let isValid = false;
      
      switch (provider) {
        case 'bellbank':
          // Add BellBank signature verification logic here
          isValid = true; // Simplified for testing
          break;
        case 'whatsapp':
          isValid = whatsappService.verifyWebhook(req.query['hub.verify_token'], process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
          break;
        default:
          isValid = false;
      }

      res.json({ success: true, valid: isValid });
    } catch (error) {
      logger.error('Webhook verification test failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test environment variables
  router.get('/env/check', async (req, res) => {
    try {
      const envVars = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set',
        WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN ? 'Set' : 'Not set',
        BELLBANK_CONSUMER_KEY: process.env.BELLBANK_CONSUMER_KEY ? 'Set' : 'Not set',
        BELLBANK_CONSUMER_SECRET: process.env.BELLBANK_CONSUMER_SECRET ? 'Set' : 'Not set',
        DOJAH_APP_ID: process.env.DOJAH_APP_ID ? 'Set' : 'Not set',
        DOJAH_SECRET_KEY: process.env.DOJAH_SECRET_KEY ? 'Set' : 'Not set',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set',
        REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not set'
      };

      res.json({ success: true, environment: envVars });
    } catch (error) {
      logger.error('Environment check failed', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Health check for all services
  router.get('/health/all', async (req, res) => {
    const services = {
      database: 'unknown',
      bellbank: 'unknown',
      dojah: 'unknown',
      whatsapp: 'unknown',
      openai: 'unknown'
    };

    // Test database
    try {
      const { sequelize } = require('../database/connection');
      await sequelize.authenticate();
      services.database = 'healthy';
    } catch (error) {
      services.database = 'unhealthy';
    }

    // Test BellBank (token generation)
    try {
      await bellbankService.generateToken();
      services.bellbank = 'healthy';
    } catch (error) {
      services.bellbank = 'unhealthy';
    }

    // Test Dojah (test BVN lookup)
    try {
      await kycService.testBvnLookup();
      services.dojah = 'healthy';
    } catch (error) {
      services.dojah = 'unhealthy';
    }

    // Test OpenAI
    try {
      await aiService.analyzeIntent("test message", { userId: 'test', phoneNumber: 'test' });
      services.openai = 'healthy';
    } catch (error) {
      services.openai = 'unhealthy';
    }

    const allHealthy = Object.values(services).every(status => status === 'healthy');
    
    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      services,
      timestamp: new Date().toISOString()
    });
  });

} else {
  // In production, return 404 for all test routes
  router.use('*', (req, res) => {
    res.status(404).json({ error: 'Test routes not available in production' });
  });
}

module.exports = router;
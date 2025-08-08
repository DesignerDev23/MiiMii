// Configuration management for MiiMii
const logger = require('../utils/logger');

class Config {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // Database Configuration
    this.database = {
      url: process.env.DB_CONNECTION_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    };

    // WhatsApp Configuration - Use exact variable names from Digital Ocean
    this.whatsapp = {
      accessToken: process.env.BOT_ACCESS_TOKEN, // Changed from WHATSAPP_ACCESS_TOKEN
      phoneNumberId: process.env.BOT_PHONE_NUMBER_ID, // Changed from WHATSAPP_PHONE_NUMBER_ID
      businessAccountId: process.env.BOT_BUSINESS_ACCOUNT_ID,
      webhookSecret: process.env.WEBHOOK_SECRET, // Changed from WHATSAPP_WEBHOOK_SECRET
      // Flow Configuration
      welcomeFlowId: process.env.WELCOME_FLOW_ID || '1223628202852216',
      flowSecretKey: process.env.FLOW_SECRET_KEY || 'default-flow-secret-key'
    };

    // Bellbank Configuration
    this.bellbank = {
      consumerKey: process.env.BANK_CONSUMER_KEY,
      consumerSecret: process.env.BANK_CONSUMER_SECRET
    };

    // Bilal Configuration
    this.bilal = {
      username: process.env.PROVIDER_USERNAME,
      password: process.env.PROVIDER_PASSWORD,
      apiKey: process.env.BILAL_API_KEY
    };

    // Dojah Configuration
    this.dojah = {
      appId: process.env.DOJAH_APP_ID,
      secretKey: process.env.DOJAH_SECRET_KEY,
      publicKey: process.env.DOJAH_PUBLIC_KEY
    };

    // Fincra Configuration
    this.fincra = {
      apiKey: process.env.FINCRA_API_KEY,
      secretKey: process.env.FINCRA_SECRET_KEY,
      businessId: process.env.FINCRA_BUSINESS_ID
    };

    // OpenAI Configuration
    this.openai = {
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4-turbo'
    };

    // Server Configuration
    this.server = {
      port: parseInt(process.env.PORT) || 3000,
      nodeEnv: process.env.NODE_ENV || 'development',
      jwtSecret: process.env.APP_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d'
    };

    // Fees Configuration
    this.fees = {
      transferFeePercentage: parseFloat(process.env.TRANSFER_FEE_PERCENTAGE) || 0.5,
      platformFee: parseInt(process.env.PLATFORM_FEE) || 5,
      bellbankFee: parseInt(process.env.BELLBANK_FEE) || 20,
      maintenanceFee: parseInt(process.env.MAINTENANCE_FEE) || 100,
      dataPurchaseFee: parseInt(process.env.DATA_PURCHASE_FEE) || 10
    };

    // Rate Limiting Configuration
    this.rateLimit = {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    };

    // Other Configuration
    this.webhookSecret = process.env.WEBHOOK_SECRET;
    this.adminEmail = process.env.ADMIN_EMAIL;
    this.adminPassword = process.env.ADMIN_PASSWORD;
    this.baseUrl = process.env.BASE_URL;
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760;
    this.uploadPath = process.env.UPLOAD_PATH || 'uploads/';
    this.redisUrl = process.env.REDIS_URL;

    // Log configuration status
    this.logConfigurationStatus();
  }

  logConfigurationStatus() {
    logger.info('Configuration loaded for Digital Ocean App Platform', {
      hasDatabaseUrl: !!this.database.url,
      hasWhatsappToken: !!this.whatsapp.accessToken,
      hasWhatsappPhoneId: !!this.whatsapp.phoneNumberId,
      hasBellbankKey: !!this.bellbank.consumerKey,
      hasOpenAIKey: !!this.openai.apiKey,
      hasJwtSecret: !!this.server.jwtSecret,
      nodeEnv: this.server.nodeEnv,
      port: this.server.port,
      platform: 'DigitalOcean App Platform',
      service: 'config',
      timestamp: new Date().toISOString()
    });

    // Generate a fallback JWT secret if none provided (for development/testing)
    if (!this.server.jwtSecret) {
      if (this.server.nodeEnv === 'production') {
        logger.error('CRITICAL: APP_SECRET environment variable is required in production');
      } else {
        this.server.jwtSecret = 'fallback-jwt-secret-' + Math.random().toString(36).substring(7);
        logger.warn('Using fallback JWT secret for development - set APP_SECRET for production');
      }
    }

    // Warn about critical missing environment variables
    const missingCritical = [];
    
    if (!this.database.url && !this.database.host) {
      missingCritical.push('Database configuration (DB_CONNECTION_URL or DB_HOST)');
      logger.warn('Database configuration missing - running without database connectivity');
    }
    
    if (!this.whatsapp.accessToken) {
      missingCritical.push('WhatsApp Access Token (BOT_ACCESS_TOKEN)');
      logger.warn('BOT_ACCESS_TOKEN environment variable is missing - WhatsApp functionality will be limited');
    }
    
    if (this.server.nodeEnv === 'production' && !this.server.jwtSecret) {
      missingCritical.push('JWT Secret (APP_SECRET)');
      logger.error('APP_SECRET environment variable is required in production');
    }

    if (missingCritical.length > 0) {
      logger.warn('Missing critical configuration:', {
        missing: missingCritical,
        impact: 'Some features will be disabled or have limited functionality',
        recommendation: 'Set missing environment variables for full functionality'
      });
    } else {
      logger.info('✅ All critical configuration variables are present');
    }
  }

  getDatabaseUrl() {
    return this.database.url;
  }

  getWhatsappConfig() {
    // Add runtime logging for Flow ID debugging
    const logger = require('../utils/logger');
    logger.info('🔍 Config: WhatsApp Flow IDs at runtime', {
      // Removed Flow ID dependencies since we're using flow_json approach
      hasOnboardingFlowId: false,
      hasLoginFlowId: false,
      onboardingFlowIdLength: 0,
      loginFlowIdLength: 0,
      environment: process.env.NODE_ENV
    });
    
    return this.whatsapp;
  }

  getBellbankConfig() {
    return this.bellbank;
  }

  getBilalConfig() {
    return this.bilal;
  }

  getDojahConfig() {
    return this.dojah;
  }

  getFincraConfig() {
    return this.fincra;
  }

  getOpenAIConfig() {
    return this.openai;
  }

  getServerConfig() {
    return this.server;
  }

  getFeesConfig() {
    return this.fees;
  }

  getRateLimitConfig() {
    return this.rateLimit;
  }

  getWebhookSecret() {
    return this.webhookSecret;
  }

  getAdminConfig() {
    return {
      email: this.adminEmail,
      password: this.adminPassword
    };
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getFileConfig() {
    return {
      maxSize: this.maxFileSize,
      uploadPath: this.uploadPath
    };
  }

  getRedisUrl() {
    return this.redisUrl;
  }
}

module.exports = new Config(); 
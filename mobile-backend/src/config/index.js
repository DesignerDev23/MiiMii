// Configuration management for MiiMii
const logger = require('../utils/logger');

class Config {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // Database Configuration - Supabase only (no connection strings needed!)
    this.database = {
      // Supabase configuration (required)
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };

    // Rubies Configuration
    this.rubies = {
      apiKey: process.env.RUBIES_API_KEY, // Direct API key for Authorization header
      webhookSecret: process.env.RUBIES_WEBHOOK_SECRET
    };

    // Legacy Bellbank Configuration (deprecated - use Rubies)
    this.bellbank = {
      consumerKey: process.env.BANK_CONSUMER_KEY,
      consumerSecret: process.env.BANK_CONSUMER_SECRET
    };

    // Bilal Configuration
    this.bilal = {
      username: process.env.PROVIDER_USERNAME,
      password: process.env.PROVIDER_PASSWORD,
      apiKey: process.env.BILAL_API_KEY,
      baseUrl: process.env.BILAL_BASE_URL
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
      model: process.env.AI_MODEL || 'gpt-4o-mini'
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
      maintenanceFee: parseInt(process.env.MAINTENANCE_FEE) || 50,
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
    // Enhanced AI API key logging
    const mask = (v) => {
      if (!v) return 'NOT_SET';
      if (v.length < 8) return 'TOO_SHORT';
      return `${v.slice(0, 4)}***${v.slice(-4)}`;
    };
    
    logger.info('Configuration loaded for Mobile Backend', {
      hasSupabaseUrl: !!this.database.supabaseUrl,
      hasSupabaseServiceRoleKey: !!this.database.supabaseServiceRoleKey,
      hasRubiesKey: !!this.rubies.apiKey,
      hasBellbankKey: !!this.bellbank.consumerKey,
      hasOpenAIKey: !!this.openai.apiKey,
      hasJwtSecret: !!this.server.jwtSecret,
      nodeEnv: this.server.nodeEnv,
      port: this.server.port,
      platform: 'Mobile Backend',
      service: 'config',
      timestamp: new Date().toISOString()
    });
    
    // Detailed AI configuration logging
    logger.info('AI Configuration Details', {
      AI_API_KEY: mask(process.env.AI_API_KEY),
      AI_MODEL: process.env.AI_MODEL || 'DEFAULT',
      AI_BASE_URL: process.env.AI_BASE_URL || 'DEFAULT',
      openaiApiKey: mask(this.openai.apiKey),
      openaiModel: this.openai.model,
      apiKeyLength: this.openai.apiKey ? this.openai.apiKey.length : 0,
      apiKeyStartsWith: this.openai.apiKey ? this.openai.apiKey.substring(0, 3) : 'N/A'
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
    
    // Check for Supabase configuration (required - no connection strings!)
    const hasSupabaseConfig = this.database.supabaseUrl && this.database.supabaseServiceRoleKey;
    
    if (!hasSupabaseConfig) {
      missingCritical.push('Supabase configuration (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
      logger.error('❌ Supabase configuration missing - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
      logger.warn('⚠️  Running without database connectivity - application will not function properly');
    } else {
      logger.info('✅ Supabase configuration found - database connectivity available');
    }
    
    if (this.server.nodeEnv === 'production' && !this.server.jwtSecret) {
      missingCritical.push('JWT Secret (APP_SECRET)');
      logger.error('APP_SECRET environment variable is required in production');
    }
    
    if (!this.openai.apiKey) {
      missingCritical.push('OpenAI API Key (AI_API_KEY)');
      logger.warn('AI_API_KEY environment variable is missing - AI features will use fallback processing');
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

  getSupabaseConfig() {
    return {
      url: this.database.supabaseUrl,
      serviceRoleKey: this.database.supabaseServiceRoleKey
    };
  }

  getRubiesConfig() {
    return this.rubies;
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
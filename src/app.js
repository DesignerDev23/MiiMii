const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Environment variables are provided by Digital Ocean App Platform
// No local .env file needed for production deployment

const config = require('./config');

const logger = require('./utils/logger');
const { sequelize, databaseManager } = require('./database/supabaseConnection');
const redisClient = require('./utils/redis');
const errorHandler = require('./middleware/errorHandler');
const { testSSLConnections } = require('./utils/sslTest');
const { initializeDataPlans } = require('./database/self-healing-tables');
const ensureMobileAuthColumns = require('./scripts/selfHealing/mobileAuthColumns');
const ensureChatMessagesTable = require('./scripts/selfHealing/chatMessagesTable');
const ensureNotificationsTable = require('./scripts/selfHealing/notificationsTable');
const ensureOnboardingStepEnum = require('./scripts/selfHealing/onboardingStepEnum');
const ensureRegistrationSourceEnum = require('./scripts/selfHealing/registrationSourceEnum');
const ensureActivityLogEnum = require('./scripts/selfHealing/activityLogEnum');
const ensureAccountLinkingOTPColumns = require('./scripts/selfHealing/accountLinkingOTPColumns');

// Import models to ensure they are registered with Sequelize
require('./models');

// Route imports
const whatsappRoutes = require('./routes/whatsapp');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const adminAuth = require('./middleware/adminAuth');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const kycRoutes = require('./routes/kyc');
const webhookRoutes = require('./routes/webhook');
const dataRoutes = require('./routes/data');
const airtimeRoutes = require('./routes/airtime');
const billsRoutes = require('./routes/bills');
const utilityRoutes = require('./routes/utility');
const userRoutes = require('./routes/user');
const bankTransferRoutes = require('./routes/bankTransfer');
const virtualCardRoutes = require('./routes/virtualCard');
const beneficiaryRoutes = require('./routes/beneficiary');
const dataPlanRoutes = require('./routes/dataPlans');
const debugDataPlansRoutes = require('./routes/debug-data-plans');
const testRoutes = require('./routes/test');
const testWhatsAppRoutes = require('./routes/testWhatsApp');
const mobileRoutes = require('./routes/mobile');
const webRoutes = require('./routes/web');

const app = express();

// Get server configuration early
const serverConfig = config.getServerConfig();

// Log WhatsApp configuration at startup
logger.info('🚀 WhatsApp Flow Configuration', {
  hasAccessToken: !!config.getWhatsappConfig().accessToken,
  hasPhoneNumberId: !!config.getWhatsappConfig().phoneNumberId,
  hasBusinessAccountId: !!config.getWhatsappConfig().businessAccountId,
  environment: process.env.NODE_ENV,
  // Using flow_json approach - no Flow IDs needed
  flowApproach: 'flow_json'
});

// Server configuration for Digital Ocean App Platform
let PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Validate port configuration
if (isNaN(PORT) || PORT <= 0 || PORT > 65535) {
  logger.error(`Invalid port configuration: ${process.env.PORT}. Using default port 3000.`);
  PORT = 3000;
}

// Trust proxy for DigitalOcean App Platform
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
// CORS configuration (allow admin consoles)
const defaultProdOrigins = [
  'https://admin.chatmiimii.com',
  'https://preview--miimii-admin-console.lovable.app'
];
const corsEnv = process.env.CORS_ALLOWED_ORIGINS;
const prodOrigins = corsEnv
  ? corsEnv.split(',').map(s => s.trim()).filter(Boolean)
  : defaultProdOrigins;

const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS === 'true';
const allowedOrigins = (process.env.NODE_ENV === 'production') ? prodOrigins : devOrigins;
const wildcardOriginPatterns = [
  /\.chatmiimii\.com$/,
  /\.lovable\.app$/,
  /localhost:\d+$/,
  /^chrome-extension:\/\// // allow browser extensions for admin tooling
];

const isAllowedOrigin = (origin) => {
  if (allowAllOrigins) return true;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return wildcardOriginPatterns.some(pattern => pattern.test(origin));
};

const defaultAllowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'x-admin-email',
  'x-admin-role',
  'x-admin-id',
  'x-admin-name',
  'x-session-token',
  'x-device-id',
  'x-organization-id'
];

const defaultExposedHeaders = [
  'x-admin-email',
  'x-admin-role',
  'x-admin-id',
  'x-admin-name'
];

const buildCorsOptions = (req, callback) => {
  const origin = req.header('Origin');
  if (!isAllowedOrigin(origin)) {
    logger.warn('CORS blocked request', { origin, allowedOrigins, allowAllOrigins });
    return callback(new Error('Not allowed by CORS'));
  }

  // Merge default headers with whatever the browser requests during preflight
  const requestedHeaders = (req.header('Access-Control-Request-Headers') || '')
    .split(',')
    .map(header => header.trim())
    .filter(Boolean);
  const allowedHeaders = Array.from(new Set([...defaultAllowedHeaders, ...requestedHeaders]));

  callback(null, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders,
    exposedHeaders: defaultExposedHeaders,
    preflightContinue: false
  });
};

app.use(cors(buildCorsOptions));

// Explicitly handle preflight
app.options('*', cors(buildCorsOptions));

// Rate limiting with configuration values
const rateLimitConfig = config.getRateLimitConfig();
const limiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.maxRequests,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging
const nodeEnv = serverConfig.nodeEnv;
if (nodeEnv !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: '🎉 MiiMii Fintech Platform API is running on Digital Ocean!',
    service: 'MiiMii Fintech Platform',
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'production',
    platform: 'DigitalOcean App Platform',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      healthz: '/healthz',
      api: '/api',
      admin: '/admin',
      webhook: '/webhook'
    },
    status: 'operational'
  });
});

// Simple health check for Digital Ocean App Platform (no database checks)
app.get('/healthz', (req, res) => {
  try {
    // Allow forcing dev mode via env (does not leak to other modules here)
    if (process.env.FORCE_DEV === 'true') {
      logger.warn('FORCE_DEV is enabled. Overriding NODE_ENV to development for this process.');
      process.env.NODE_ENV = 'development';
    }
    const healthResponse = {
      status: 'OK',
      service: 'MiiMii Fintech Platform',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'production',
      port: PORT,
      host: HOST,
      version: require('../package.json').version,
      platform: 'DigitalOcean App Platform',
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      }
    };
    
    res.status(200).json(healthResponse);
    logger.debug('Health check (simple) passed');
  } catch (error) {
    logger.error('Health check (simple) failed:', error.message);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Comprehensive health check with service dependencies
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    port: PORT,
    host: HOST,
    version: require('../package.json').version,
    platform: 'DigitalOcean App Platform',
    services: {
      database: 'unknown',
      redis: 'unknown'
    },
    performance: {
      checkDuration: 0
    },
    message: 'Service is operational'
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    await sequelize.authenticate();
    health.services.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart
    };
    logger.debug('Database health check passed');
  } catch (error) {
    logger.debug('Database health check failed:', error.message);
    health.services.database = {
      status: 'disconnected',
      error: 'Database not connected yet or configuration missing',
      message: 'Service will continue with limited functionality'
    };
    // Don't mark as degraded if database is not configured
    if (config.getDatabaseUrl() || process.env.DB_HOST) {
      health.status = 'DEGRADED';
      health.message = 'Service is operational but some features may be limited';
    }
  }

  // Check Redis connection
  try {
    const redisStart = Date.now();
    const redisHealthy = await redisClient.healthCheck();
    health.services.redis = {
      status: redisHealthy ? 'healthy' : 'disconnected',
      responseTime: Date.now() - redisStart
    };
    if (!redisHealthy) {
      logger.debug('Redis health check - not connected');
      health.services.redis.message = 'Redis caching disabled, using fallback';
    } else {
      logger.debug('Redis health check passed');
    }
  } catch (error) {
    logger.debug('Redis health check error:', error.message);
    health.services.redis = {
      status: 'disconnected',
      error: 'Redis not configured or connection failed',
      message: 'Caching features disabled, using fallback'
    };
  }

  // Calculate total check duration
  health.performance.checkDuration = Date.now() - startTime;

  // Always return 200 for basic functionality, even if some services are degraded
  const statusCode = health.status === 'OK' ? 200 : 200; // Changed from 503 to 200
  res.status(statusCode).json(health);
  
  logger.debug(`Health check completed with status: ${health.status}`, {
    duration: health.performance.checkDuration,
    dbStatus: health.services.database.status,
    redisStatus: health.services.redis.status
  });
});

// API Routes
app.use('/webhook', webhookRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/flow', require('./routes/flowEndpoint').router); // Add Flow endpoint
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminAuth, adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/airtime', airtimeRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/utility', utilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bank-transfer', bankTransferRoutes);
app.use('/api/virtual-cards', virtualCardRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/data-plans', dataPlanRoutes);
app.use('/api/debug', debugDataPlansRoutes);
app.use('/api/test', testRoutes);
app.use('/api/test-whatsapp', testWhatsAppRoutes);
app.use('/api/mobile', mobileRoutes);
// Workaround for mobile app calling /api/mobile/mobile/* (duplicate mobile path)
app.use('/api/mobile/mobile', mobileRoutes);
app.use('/api/web', webRoutes);

// Serve admin dashboard
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Database connection and server startup
let server; // Declare server variable for graceful shutdown

async function startServer() {
  try {
    logger.info('🚀 Starting MiiMii Fintech Platform...');
    
    // Log environment information for debugging
    logger.info('Environment Configuration:', {
      nodeEnv: process.env.NODE_ENV || 'production',
      port: PORT,
      host: HOST,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });

    // Log critical environment variables (without sensitive values)
    logger.info('Environment Variables Status:', {
      hasDbConfig: !!(process.env.DB_CONNECTION_URL || process.env.DB_HOST),
      hasRedisConfig: !!process.env.REDIS_URL,
      hasWhatsAppConfig: !!(process.env.BOT_ACCESS_TOKEN && process.env.BOT_PHONE_NUMBER_ID),
      hasJwtSecret: !!process.env.APP_SECRET,
      hasBankConfig: !!(process.env.BANK_CONSUMER_KEY && process.env.BANK_CONSUMER_SECRET),
      hasAiConfig: !!process.env.AI_API_KEY,
      logLevel: process.env.LOG_LEVEL || 'info'
    });
    
    // Start server first, then establish connections
    server = app.listen(PORT, HOST, (error) => {
      if (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
      }
      
      logger.info(`✅ MiiMii Fintech Platform server started successfully on ${HOST}:${PORT}`);
      logger.info('📡 Server is ready to accept connections');
      logger.info('🏥 Health check available at: /healthz');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

      // Handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          logger.error('Server error:', error);
          process.exit(1);
      }
    });

    // Test SSL connections asynchronously after server starts
    testSSLConnections();

    // Initialize database connection asynchronously after server starts
    initializeDatabaseConnection();
    
    // Initialize Redis connection asynchronously after server starts
    initializeRedisConnection();

  } catch (error) {
      logger.error('❌ Unable to start server on Digital Ocean App Platform:', {
      error: error.message,
      stack: error.stack,
      port: PORT,
      host: HOST,
        environment: process.env.NODE_ENV || 'production',
      platform: 'DigitalOcean App Platform',
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

// Separate function to initialize database connection
async function initializeDatabaseConnection() {
  try {
    // Check for Supabase configuration (new simple approach)
    const hasSupabaseConfig = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
                              process.env.SUPABASE_DB_URL ||
                              (process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD);
    
    if (!hasSupabaseConfig) {
      logger.warn('⚠️ Supabase database configuration missing', {
        availableEnvVars: {
          hasSupabaseUrl: !!process.env.SUPABASE_URL,
          hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasSupabaseDbUrl: !!process.env.SUPABASE_DB_URL,
          hasSupabaseDbHost: !!process.env.SUPABASE_DB_HOST,
          hasSupabaseDbPassword: !!process.env.SUPABASE_DB_PASSWORD
        },
        message: 'Running without database connectivity. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_DB_URL) environment variables.'
      });
      return;
    }

    // Check if sequelize is properly initialized
    if (!sequelize) {
      logger.error('❌ Database connection not properly initialized', {
        suggestion: 'Please set SUPABASE_DB_URL environment variable.'
      });
      return;
    }
    
    // Check if it's a disabled instance (no config means no connection string was provided)
    if (!sequelize.config || !sequelize.config.host) {
      logger.error('❌ Database connection string not configured', {
        hasSupabaseDbUrl: !!process.env.SUPABASE_DB_URL,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        suggestion: 'Please set SUPABASE_DB_URL environment variable with your connection string.'
      });
      return;
    }

    logger.info('Attempting to connect to Supabase database...');
    try {
      // Test connection (like your other app)
      const { testConnection } = require('./database/supabaseConnection');
      await testConnection();
      logger.info('✅ Supabase database connection established successfully');
    } catch (error) {
      // Check if it's a configuration error (missing host/database)
      if (error.message && (
        error.message.includes('dialect was not supplied') ||
        error.message.includes('host parameter is not valid') ||
        error.message.includes('database parameter is not valid')
      )) {
        logger.error('❌ Database configuration incomplete:', {
          error: error.message,
          suggestion: 'Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_DB_URL) environment variables.'
        });
      } else {
        logger.error('❌ Failed to connect to Supabase database:', {
          error: error.message,
          code: error.code,
          host: sequelize.config?.host || 'unknown',
          database: sequelize.config?.database || 'unknown',
          suggestion: 'Please verify your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_DB_URL) environment variables are correct.'
        });
      }
      // Don't throw - allow app to continue without database (with limited functionality)
      logger.warn('⚠️ Application will continue without database connectivity');
      return;
    }

    // Sync database models only after successful connection
    try {
      await sequelize.sync({ force: false, alter: false });
      logger.info('✅ Database models synchronized');
    } catch (error) {
      logger.error('❌ Failed to sync database models:', { error: error.message });
      return; // Exit early if sync fails
    }
    
    // Initialize data plans system
    try {
      await initializeDataPlans();
    } catch (error) {
      logger.error('❌ Failed to initialize data plans system:', { error: error.message });
    }
    
    // Initialize mobile app database structures (self-healing)
    // Run each script independently so one failure doesn't stop the others
    const selfHealingScripts = [
      { name: 'Mobile Auth Columns', fn: ensureMobileAuthColumns },
      { name: 'Chat Messages Table', fn: ensureChatMessagesTable },
      { name: 'Notifications Table', fn: ensureNotificationsTable },
      { name: 'Onboarding Step Enum', fn: ensureOnboardingStepEnum },
      { name: 'Registration Source Enum', fn: ensureRegistrationSourceEnum },
      { name: 'Activity Log Enum', fn: ensureActivityLogEnum },
      { name: 'Account Linking OTP Columns', fn: ensureAccountLinkingOTPColumns }
    ];

    for (const script of selfHealingScripts) {
      try {
        await script.fn();
        logger.info(`✅ ${script.name} check completed`);
      } catch (error) {
        logger.error(`❌ Failed to initialize ${script.name}:`, { error: error?.message || 'Unknown error' });
        // Continue with other scripts even if one fails
      }
    }
    
    // Self-healing: attempt to add missing columns if they don't exist (async, non-blocking)
    setTimeout(async () => {
      try {
        const { attemptColumnAddition } = require('../fix_missing_column');
        await attemptColumnAddition();
      } catch (error) {
        logger.warn('Self-healing column addition failed (non-critical):', error.message);
      }
    }, 5000); // Wait 5 seconds after startup to avoid blocking

    // Note: Using existing virtual account columns for Rubies wallet integration
    // No additional migration needed
    
  } catch (error) {
    logger.warn('⚠️ Database connection failed - continuing without database features:', {
      error: error.message,
      message: 'Application will run with limited functionality'
    });
  }
}

// Separate function to initialize Redis connection
async function initializeRedisConnection() {
  try {
    const redisConnected = await redisClient.connect();
    if (redisConnected) {
      logger.info('✅ Redis connection established successfully');
    } else {
      logger.info('ℹ️ Redis not configured - running without Redis features');
    }
  } catch (error) {
    logger.warn('⚠️ Redis connection failed - continuing without Redis features:', {
      error: error.message,
      message: 'Application will run with limited caching functionality'
    });
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  
  try {
    // Close HTTP server first
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      logger.info('✅ HTTP server closed');
    }

    // Close database connections
    await databaseManager.gracefulShutdown();

    // Close Redis connection
    if (redisClient && typeof redisClient.disconnect === 'function') {
      await redisClient.disconnect();
      logger.info('✅ Redis connection closed');
    }

    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = app;

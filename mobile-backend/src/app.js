const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const { supabase, databaseManager } = require('./database/supabaseConnection');
const redisClient = require('./utils/redis');
const errorHandler = require('./middleware/errorHandler');

// Import models to ensure they are registered
require('./models');

// Route imports - only mobile routes
const mobileRoutes = require('./routes/mobile');

const app = express();

// Get server configuration
const serverConfig = config.getServerConfig();

// Server configuration
let PORT = parseInt(process.env.MOBILE_PORT) || parseInt(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Validate port configuration
if (isNaN(PORT) || PORT <= 0 || PORT > 65535) {
  logger.error(`Invalid port configuration: ${process.env.MOBILE_PORT || process.env.PORT}. Using default port 3001.`);
  PORT = 3001;
}

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration - allow mobile app origins
const defaultProdOrigins = [
  'https://app.miimii.com',
  'https://miimii.app'
];

const corsEnv = process.env.MOBILE_CORS_ORIGINS || process.env.CORS_ALLOWED_ORIGINS;
const prodOrigins = corsEnv
  ? corsEnv.split(',').map(s => s.trim()).filter(Boolean)
  : defaultProdOrigins;

const devOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://localhost:19006'];

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS === 'true';
const allowedOrigins = (process.env.NODE_ENV === 'production') ? prodOrigins : devOrigins;

const isAllowedOrigin = (origin) => {
  if (allowAllOrigins) return true;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return false;
};

const buildCorsOptions = (req, callback) => {
  const origin = req.header('Origin');
  if (!isAllowedOrigin(origin)) {
    logger.warn('CORS blocked request', { origin, allowedOrigins, allowAllOrigins });
    return callback(new Error('Not allowed by CORS'));
  }

  callback(null, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: [],
    preflightContinue: false
  });
};

app.use(cors(buildCorsOptions));
app.options('*', cors(buildCorsOptions));

// Rate limiting
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

// Logging
const nodeEnv = serverConfig.nodeEnv;
if (nodeEnv !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: '🎉 MiiMii Mobile Backend API is running!',
    service: 'MiiMii Mobile Backend',
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'production',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      healthz: '/healthz',
      api: '/api/mobile'
    },
    status: 'operational'
  });
});

// Simple health check
app.get('/healthz', (req, res) => {
  try {
    const healthResponse = {
      status: 'OK',
      service: 'MiiMii Mobile Backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'production',
      port: PORT,
      host: HOST,
      version: require('../package.json').version,
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

// Comprehensive health check
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
    if (supabase) {
      const { error } = await supabase.from('users').select('count').limit(1);
      health.services.database = {
        status: error ? 'unhealthy' : 'healthy',
        responseTime: Date.now() - dbStart
      };
    } else {
      health.services.database = {
        status: 'unavailable',
        responseTime: 0
      };
    }
    logger.debug('Database health check passed');
  } catch (error) {
    logger.debug('Database health check failed:', error.message);
    health.services.database = {
      status: 'disconnected',
      error: 'Database not connected yet or configuration missing'
    };
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

  health.performance.checkDuration = Date.now() - startTime;
  const statusCode = health.status === 'OK' ? 200 : 200;
  res.status(statusCode).json(health);
  
  logger.debug(`Health check completed with status: ${health.status}`, {
    duration: health.performance.checkDuration,
    dbStatus: health.services.database.status,
    redisStatus: health.services.redis.status
  });
});

// API Routes - Mobile only
app.use('/api/mobile', mobileRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Database connection and server startup
let server;

async function startServer() {
  try {
    logger.info('🚀 Starting MiiMii Mobile Backend...');
    
    logger.info('Environment Configuration:', {
      nodeEnv: process.env.NODE_ENV || 'production',
      port: PORT,
      host: HOST,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    });

    // Start server first
    server = app.listen(PORT, HOST, (error) => {
      if (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
      }
      
      logger.info(`✅ MiiMii Mobile Backend server started successfully on ${HOST}:${PORT}`);
      logger.info('📡 Server is ready to accept connections');
      logger.info('🏥 Health check available at: /healthz');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

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

    // Initialize database connection
    initializeDatabaseConnection();
    
    // Initialize Redis connection
    initializeRedisConnection();

  } catch (error) {
    logger.error('❌ Unable to start server:', {
      error: error.message,
      stack: error.stack,
      port: PORT,
      host: HOST
    });
    process.exit(1);
  }
}

async function initializeDatabaseConnection() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      logger.warn('⚠️ Supabase configuration missing', {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      });
      return;
    }

    if (!supabase) {
      logger.error('❌ Supabase client not initialized');
      return;
    }

    logger.info('Attempting to connect to Supabase database...');
    try {
      const { testConnection } = require('./database/supabaseConnection');
      await testConnection();
      logger.info('✅ Supabase database connection established successfully');
    } catch (error) {
      logger.error('❌ Failed to connect to Supabase database:', {
        error: error.message
      });
      logger.warn('⚠️ Application will continue without database connectivity');
      return;
    }

    logger.info('✅ Using Supabase client - schema managed via Supabase migrations');
    
  } catch (error) {
    logger.warn('⚠️ Database connection failed - continuing without database features:', {
      error: error.message
    });
  }
}

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
      error: error.message
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
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      logger.info('✅ HTTP server closed');
    }

    await databaseManager.gracefulShutdown();

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


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
const { sequelize } = require('./database/connection');
const redisClient = require('./utils/redis');
const errorHandler = require('./middleware/errorHandler');

// Import models to ensure they are registered with Sequelize
require('./models');

// Route imports
const whatsappRoutes = require('./routes/whatsapp');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const kycRoutes = require('./routes/kyc');
const webhookRoutes = require('./routes/webhook');
const dataRoutes = require('./routes/data');
const airtimeRoutes = require('./routes/airtime');
const utilityRoutes = require('./routes/utility');
const userRoutes = require('./routes/user');
const bankTransferRoutes = require('./routes/bankTransfer');
const virtualCardRoutes = require('./routes/virtualCard');
const testRoutes = require('./routes/test');

const app = express();

// Get server configuration early
const serverConfig = config.getServerConfig();

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
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://api.chatmiimii.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

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
    }
  };

  // Check database
  try {
    const dbStart = Date.now();
    await sequelize.authenticate();
    health.services.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart
    };
    logger.debug('Database health check passed');
  } catch (error) {
    logger.error('Database health check failed:', error.message);
    health.services.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'DEGRADED';
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    const redisHealthy = await redisClient.healthCheck();
    health.services.redis = {
      status: redisHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - redisStart
    };
    if (!redisHealthy) {
      health.status = 'DEGRADED';
      logger.warn('Redis health check failed');
    } else {
      logger.debug('Redis health check passed');
    }
  } catch (error) {
    logger.error('Redis health check error:', error.message);
    health.services.redis = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'DEGRADED';
  }

  // Calculate total check duration
  health.performance.checkDuration = Date.now() - startTime;

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
  
  logger.info(`Health check completed with status: ${health.status}`, {
    duration: health.performance.checkDuration,
    dbStatus: health.services.database.status,
    redisStatus: health.services.redis.status
  });
});

// API Routes
app.use('/webhook', webhookRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/airtime', airtimeRoutes);
app.use('/api/utility', utilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bank-transfer', bankTransferRoutes);
app.use('/api/virtual-cards', virtualCardRoutes);
app.use('/api/test', testRoutes);

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
    // Test database connection with retry logic for Digital Ocean
    let dbRetries = 3;
    let dbConnected = false;
    
    while (dbRetries > 0 && !dbConnected) {
      try {
        await sequelize.authenticate();
        logger.info('✅ Database connection established successfully');
        dbConnected = true;
      } catch (dbError) {
        dbRetries--;
        logger.warn(`Database connection attempt failed (${3 - dbRetries}/3):`, dbError.message);
        if (dbRetries > 0) {
          logger.info('Retrying database connection in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          logger.error('❌ All database connection attempts failed - this will likely cause issues');
          // Continue anyway for Digital Ocean health checks
        }
      }
    }

    // Initialize Redis connection (non-blocking, optional for Digital Ocean)
    try {
      const redisConnected = await Promise.race([
        redisClient.connect(),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)) // 5 second timeout
      ]);
      
      if (redisConnected) {
        logger.info('✅ Redis connection established successfully');
      } else {
        logger.warn('⚠️ Redis connection failed or timed out - continuing without Redis features');
      }
    } catch (error) {
      logger.warn('⚠️ Redis connection error - continuing without Redis features:', error.message);
    }

    // Sync database models (ensure tables exist) - only if database is connected
    if (dbConnected) {
      try {
        await sequelize.sync({ force: false, alter: false });
        logger.info('✅ Database models synchronized');
      } catch (error) {
        logger.warn('⚠️ Database sync failed, retrying with alter:', error.message);
        try {
          await sequelize.sync({ force: false, alter: true });
          logger.info('✅ Database models synchronized with alter');
        } catch (retryError) {
          logger.error('❌ Database sync failed completely:', retryError.message);
          logger.warn('Continuing anyway - some features may not work properly');
          // Don't throw error to allow server to start for health checks
        }
      }
    } else {
      logger.warn('⚠️ Skipping database sync due to connection failure');
    }

    // Start server - ensure binding to correct host and port for Digital Ocean App Platform
    server = app.listen(PORT, HOST, (error) => {
      if (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
      }
      
      logger.info(`🚀 MiiMii Fintech Platform successfully started on Digital Ocean!`, {
        message: `Server listening on ${HOST}:${PORT}`,
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV || 'production',
        nodeVersion: process.version,
        platform: 'DigitalOcean App Platform',
        timestamp: new Date().toISOString(),
        healthEndpoints: {
          simple: '/healthz',
          detailed: '/health',
          root: '/'
        }
      });
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
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

if (require.main === module) {
  startServer();
}

module.exports = app;

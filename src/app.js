const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');

// Environment variables are loaded from Digital Ocean App Platform
// No local .env file needed

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

// Simple health check for Digital Ocean (no database checks)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: 'unknown',
      redis: 'unknown'
    }
  };

  // Check database
  try {
    await sequelize.authenticate();
    health.services.database = 'healthy';
  } catch (error) {
    logger.error('Database health check failed:', error.message);
    health.services.database = 'unhealthy';
    health.status = 'DEGRADED';
  }

  // Check Redis
  try {
    const redisHealthy = await redisClient.healthCheck();
    health.services.redis = redisHealthy ? 'healthy' : 'unhealthy';
    if (!redisHealthy) health.status = 'DEGRADED';
  } catch (error) {
    health.services.redis = 'unhealthy';
    health.status = 'DEGRADED';
  }

  res.status(health.status === 'OK' ? 200 : 503).json(health);
});

// API Routes
app.use('/api/webhook', webhookRoutes);
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
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Initialize Redis connection (non-blocking)
    try {
      const redisConnected = await Promise.race([
        redisClient.connect(),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)) // 5 second timeout
      ]);
      
      if (redisConnected) {
        logger.info('Redis connection established successfully');
      } else {
        logger.warn('Redis connection failed or timed out - continuing without Redis features');
      }
    } catch (error) {
      logger.warn('Redis connection error - continuing without Redis features:', error.message);
    }

    // Sync database models (ensure tables exist)
    try {
      await sequelize.sync({ force: false, alter: false });
      logger.info('Database models synchronized');
    } catch (error) {
      logger.warn('Database sync failed, retrying with alter:', error.message);
      try {
        await sequelize.sync({ force: false, alter: true });
        logger.info('Database models synchronized with alter');
      } catch (retryError) {
        logger.error('Database sync failed completely:', retryError.message);
        throw retryError;
      }
    }

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server is running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        nodeVersion: process.version
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
    logger.error('Unable to start server:', error);
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
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

if (require.main === module) {
  startServer();
}

module.exports = app;

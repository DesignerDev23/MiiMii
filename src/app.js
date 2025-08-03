const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('dotenv').config();

const logger = require('./utils/logger');
const { sequelize } = require('./database/connection');
const redisClient = require('./utils/redis');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const whatsappRoutes = require('./routes/whatsapp');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transaction');
const kycRoutes = require('./routes/kyc');
const webhookRoutes = require('./routes/webhook');

const app = express();

// Trust proxy for DigitalOcean App Platform
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-admin-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

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
app.use('/webhook', webhookRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/kyc', kycRoutes);

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

    // Initialize Redis connection
    const redisConnected = await redisClient.connect();
    if (redisConnected) {
      logger.info('Redis connection established successfully');
    } else {
      logger.warn('Redis connection failed - continuing without Redis features');
    }

    // Sync database models (use { force: true } only in development to recreate tables)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`MiiMii server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
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
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await sequelize.close();
  await redisClient.disconnect();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = app;
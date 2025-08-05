const redis = require('redis');
const logger = require('./logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL;
      
      if (!redisUrl || typeof redisUrl !== 'string') {
        logger.info('Redis URL not provided - Redis features will be disabled');
        this.isConnected = false;
        return false;
      }

      // For production, check if it's a proper external Redis URL
      if (process.env.NODE_ENV === 'production' && redisUrl.includes('localhost')) {
        logger.warn('Redis URL points to localhost in production - Redis features will be disabled');
        this.isConnected = false;
        return false;
      }

      // Create Redis client with connection options
      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectDelay: 5000,
          timeout: 3000,
          connectTimeout: 3000,
        },
        retryStrategy: (times) => {
          if (times > this.maxReconnectAttempts) {
            logger.info('Redis max reconnection attempts reached - disabling Redis');
            this.isConnected = false;
            return null;
          }
          return Math.min(times * 1000, 5000);
        },
        lazyConnect: true
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('error', (err) => {
        logger.info('Redis client error (Redis features disabled):', err.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info(`Redis client reconnecting... Attempt ${this.reconnectAttempts}`);
      });

      // Connect to Redis
      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      logger.info('Redis connection established successfully');
      
      return true;
    } catch (error) {
      logger.info('Failed to connect to Redis (Redis features disabled):', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis client disconnected gracefully');
      } catch (error) {
        logger.error('Error disconnecting from Redis:', error);
      }
    }
  }

  // Session Management
  async setSession(sessionId, sessionData, ttl = 3600) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(sessionData));
      return true;
    } catch (error) {
      logger.error('Error setting session:', error);
      return false;
    }
  }

  async getSession(sessionId) {
    if (!this.isConnected) return null;
    
    try {
      const sessionData = await this.client.get(`session:${sessionId}`);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      logger.error('Error getting session:', error);
      return null;
    }
  }

  async deleteSession(sessionId) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting session:', error);
      return false;
    }
  }

  // Caching
  async set(key, value, ttl = null) {
    if (!this.isConnected) return false;
    
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client.setEx(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  async get(key) {
    if (!this.isConnected) return null;
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  async del(key) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  // Rate Limiting
  async checkRateLimit(identifier, limit, window) {
    if (!this.isConnected) return { allowed: true, remaining: limit };
    
    try {
      const key = `rate_limit:${identifier}`;
      const current = await this.client.incr(key);
      
      if (current === 1) {
        await this.client.expire(key, window);
      }
      
      const remaining = Math.max(0, limit - current);
      return {
        allowed: current <= limit,
        remaining,
        total: limit,
        resetTime: Date.now() + (window * 1000)
      };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      return { allowed: true, remaining: limit };
    }
  }

  // Queue Operations (for background jobs)
  async pushToQueue(queueName, data) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.rPush(`queue:${queueName}`, JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error(`Error pushing to queue ${queueName}:`, error);
      return false;
    }
  }

  async popFromQueue(queueName, timeout = 0) {
    if (!this.isConnected) return null;
    
    try {
      const result = await this.client.blPop(
        { key: `queue:${queueName}`, timeout }
      );
      return result ? JSON.parse(result.element) : null;
    } catch (error) {
      logger.error(`Error popping from queue ${queueName}:`, error);
      return null;
    }
  }

  // Transaction Caching
  async cacheUserBalance(userId, balance, ttl = 300) {
    return await this.set(`balance:${userId}`, balance, ttl);
  }

  async getCachedUserBalance(userId) {
    return await this.get(`balance:${userId}`);
  }

  async invalidateUserCache(userId) {
    const keys = [
      `balance:${userId}`,
      `transactions:${userId}`,
      `profile:${userId}`
    ];
    
    for (const key of keys) {
      await this.del(key);
    }
  }

  // WhatsApp Session Management
  async setWhatsAppSession(phoneNumber, conversationState, ttl = 1800) {
    return await this.setSession(`whatsapp:${phoneNumber}`, {
      phoneNumber,
      conversationState,
      lastActivity: Date.now()
    }, ttl);
  }

  async getWhatsAppSession(phoneNumber) {
    return await this.getSession(`whatsapp:${phoneNumber}`);
  }

  async clearWhatsAppSession(phoneNumber) {
    return await this.deleteSession(`whatsapp:${phoneNumber}`);
  }

  // OTP Management
  async setOTP(phoneNumber, otp, ttl = 300) {
    return await this.set(`otp:${phoneNumber}`, otp, ttl);
  }

  async getOTP(phoneNumber) {
    return await this.get(`otp:${phoneNumber}`);
  }

  async verifyAndDeleteOTP(phoneNumber, otp) {
    const storedOTP = await this.getOTP(phoneNumber);
    if (storedOTP && storedOTP === otp) {
      await this.del(`otp:${phoneNumber}`);
      return true;
    }
    return false;
  }

  // Health Check
  async healthCheck() {
    if (!this.isConnected) return false;
    
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Get client for advanced operations
  getClient() {
    return this.client;
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
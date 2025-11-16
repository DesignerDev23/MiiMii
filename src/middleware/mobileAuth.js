const jwt = require('jsonwebtoken');
const userService = require('../services/user');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate mobile app requests using JWT tokens.
 * Expects Authorization: Bearer <token> header.
 */
module.exports = async function mobileAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    if (!process.env.MOBILE_JWT_SECRET) {
      logger.error('MOBILE_JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Mobile auth is not configured' });
    }

    const payload = jwt.verify(token, process.env.MOBILE_JWT_SECRET);
    const user = await userService.getUserById(payload.userId);

    if (!user || !user.isActive || user.isBanned) {
      return res.status(401).json({ error: 'User not authorized' });
    }

    req.authContext = {
      tokenId: payload.jti || null,
      issuedAt: payload.iat,
      expiresAt: payload.exp
    };
    req.user = user;

    return next();
  } catch (error) {
    logger.warn('Mobile authentication failed', {
      error: error.message,
      path: req.originalUrl
    });

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return res.status(500).json({ error: 'Authentication failed' });
  }
};


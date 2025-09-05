const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Simple admin auth middleware using JWT
// Configure via env:
// ADMIN_JWT_SECRET (required)
// Token expected in Authorization: Bearer <token>

function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      logger.error('ADMIN_JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Admin auth not configured' });
    }

    const payload = jwt.verify(token, secret);
    req.admin = { id: payload.id, email: payload.email, role: payload.role || 'admin' };
    next();
  } catch (error) {
    logger.warn('Admin auth failed', { error: error.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = adminAuth;



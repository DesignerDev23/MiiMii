const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/admin/auth/login
router.post('/login',
  body('email').isEmail(),
  body('password').isString().isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword) {
        logger.error('Admin credentials not configured');
        return res.status(500).json({ error: 'Admin auth not configured' });
      }

      if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: 'admin', email, role: 'admin' }, process.env.ADMIN_JWT_SECRET, {
        expiresIn: '12h'
      });

      res.json({ success: true, token });
    } catch (error) {
      logger.error('Admin login failed', { error: error.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

module.exports = router;



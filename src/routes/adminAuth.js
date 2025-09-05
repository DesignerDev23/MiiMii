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

      const adminEmail = (process.env.ADMIN_EMAIL || '').toString().trim().toLowerCase();
      const adminPassword = (process.env.ADMIN_PASSWORD || '').toString().trim();
      if (!adminEmail || !adminPassword) {
        logger.error('Admin credentials not configured');
        return res.status(500).json({ error: 'Admin auth not configured' });
      }

      const inputEmail = (email || '').toString().trim().toLowerCase();
      const inputPassword = (password || '').toString().trim();

      if (!process.env.ADMIN_JWT_SECRET) {
        logger.error('ADMIN_JWT_SECRET is not configured');
        return res.status(500).json({ error: 'Admin auth not configured' });
      }

      // Debug (safe): log lengths and masked previews without exposing secrets
      const mask = (v) => {
        if (!v) return 'NOT_SET';
        const s = v.toString();
        if (s.length <= 4) return `${s[0]}***`;
        return `${s.slice(0, 2)}***${s.slice(-2)}`;
      };
      logger.info('Admin login attempt', {
        inputEmailPreview: mask(inputEmail),
        adminEmailPreview: mask(adminEmail),
        inputPasswordLength: inputPassword.length,
        adminPasswordLength: adminPassword.length,
        emailMatch: inputEmail === adminEmail,
        passwordMatch: inputPassword === adminPassword
      });

      if (inputEmail !== adminEmail || inputPassword !== adminPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: 'admin', email: adminEmail, role: 'admin' }, process.env.ADMIN_JWT_SECRET, {
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



const express = require('express');
const { body, validationResult } = require('express-validator');
const { SupportTicket, User } = require('../models');
const userService = require('../services/user');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to validate request
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Create Support Ticket (Public Website Endpoint)
// This endpoint allows anyone to create a ticket, even without an account
router.post('/support/tickets',
  [
    body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email format'),
    body('phoneNumber').optional().isMobilePhone('any').withMessage('Invalid phone number format'),
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('type').isIn(['dispute', 'complaint', 'inquiry', 'technical', 'refund']).withMessage('Valid ticket type is required'),
    body('subject').isString().trim().notEmpty().isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5 and 200 characters'),
    body('description').isString().trim().notEmpty().isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level'),
    body('transactionId').optional().isUUID().withMessage('Invalid transaction ID format')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { email, phoneNumber, name, type, subject, description, priority = 'medium', transactionId } = req.body;
      
      // Require at least email or phone number for contact
      if (!email && !phoneNumber) {
        return res.status(400).json({ 
          error: 'Either email or phone number is required for contact' 
        });
      }

      let userId = null;
      let user = null;

      // Try to find user by phone number or email if provided
      if (phoneNumber) {
        try {
          user = await userService.getUserByPhoneNumber(phoneNumber);
          if (user) {
            userId = user.id;
          }
        } catch (error) {
          // User not found by phone, will create guest ticket
          logger.info('User not found by phone number, creating guest ticket', { phoneNumber });
        }
      }

      // If no user found by phone, try email
      if (!user && email) {
        try {
          user = await userService.findByAppEmail(email.toLowerCase());
          if (user) {
            userId = user.id;
          }
        } catch (error) {
          // User not found by email, will create guest ticket
          logger.info('User not found by email, creating guest ticket', { email });
        }
      }

      // If no user found, create a guest user for the ticket
      // This ensures we can link the ticket to a user record
      if (!user) {
        try {
          const guestName = name || 'Guest User';
          
          // Use phone number if available, otherwise create a temporary phone from email
          if (phoneNumber) {
            user = await userService.getOrCreateUser(phoneNumber, guestName);
            userId = user.id;
          } else if (email) {
            // Create a temporary phone number format from email for guest users
            // Format: +2349000000000 + hash of email (last 6 digits)
            const emailHash = require('crypto').createHash('md5').update(email).digest('hex').substring(0, 6);
            const tempPhone = `+234900000${emailHash}`;
            user = await userService.getOrCreateUser(tempPhone, guestName);
            
            // Update user with email if available
            if (email && !user.appEmail) {
              await userService.updateUser(user.id, { appEmail: email.toLowerCase() });
            }
            
            userId = user.id;
            logger.info('Created guest user from email for ticket', { 
              userId: user.id,
              email,
              tempPhone
            });
          }
        } catch (createError) {
          logger.error('Failed to create guest user for ticket', { 
            error: createError.message,
            email,
            phoneNumber
          });
          return res.status(500).json({ 
            error: 'Failed to process ticket request. Please try again or contact support directly.' 
          });
        }
      }

      // Generate unique ticket number
      const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // Create support ticket (can be created without userId for guest users)
      const ticket = await SupportTicket.create({
        ticketNumber,
        userId: userId, // null if guest user
        transactionId: transactionId || null,
        type,
        priority,
        status: 'open',
        subject: subject.trim(),
        description: description.trim(),
        metadata: {
          source: 'website',
          isGuest: !userId,
          contactInfo: {
            email: email || null,
            phoneNumber: phoneNumber || null,
            name: name || null
          },
          createdAt: new Date().toISOString(),
          ipAddress: req.ip || req.connection.remoteAddress
        }
      });

      logger.info('Support ticket created via website', { 
        ticketId: ticket.id, 
        ticketNumber: ticket.ticketNumber,
        userId: userId || 'guest',
        hasEmail: !!email,
        hasPhone: !!phoneNumber
      });

      // If user exists and has WhatsApp number, send confirmation
      if (user && user.whatsappNumber) {
        try {
          const whatsappService = require('../services/whatsapp');
          await whatsappService.sendTextMessage(
            user.whatsappNumber,
            `🎫 *Support Ticket Created*\n\n` +
            `Subject: ${subject}\n` +
            `Priority: ${priority.toUpperCase()}\n` +
            `Ticket Number: ${ticketNumber}\n\n` +
            `We've received your support request and will get back to you within 24 hours.\n\n` +
            `_MiiMii Support Team_`
          );
        } catch (whatsappError) {
          logger.warn('Failed to send WhatsApp confirmation', { 
            error: whatsappError.message,
            ticketId: ticket.id 
          });
          // Don't fail the request if WhatsApp fails
        }
      }
      
      res.json({
        success: true,
        message: 'Support ticket created successfully',
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          type: ticket.type,
          priority: ticket.priority,
          status: ticket.status,
          subject: ticket.subject,
          createdAt: ticket.createdAt
        },
        // Include contact info if guest user
        ...(userId ? {} : {
          note: 'We will contact you via the provided email or phone number'
        })
      });
    } catch (error) {
      logger.error('Failed to create support ticket via website', { 
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({ 
        error: 'Failed to create support ticket',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get Support Ticket Status (Public - by ticket number)
router.get('/support/tickets/:ticketNumber',
  async (req, res) => {
    try {
      const { ticketNumber } = req.params;
      
      if (!ticketNumber || ticketNumber.trim().length === 0) {
        return res.status(400).json({ error: 'Ticket number is required' });
      }
      
      const ticket = await SupportTicket.findOne({
        where: { ticketNumber },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'whatsappNumber'],
            required: false
          }
        ]
      });

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Return limited information for public access
      return res.json({
        success: true,
        ticket: {
          ticketNumber: ticket.ticketNumber,
          type: ticket.type,
          priority: ticket.priority,
          status: ticket.status,
          subject: ticket.subject,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          // Only show resolution if ticket is resolved
          ...(ticket.status === 'resolved' || ticket.status === 'closed' ? {
            resolution: ticket.resolution,
            resolvedAt: ticket.resolvedAt
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to get support ticket status', { 
        error: error.message,
        ticketNumber: req.params.ticketNumber
      });
      return res.status(500).json({ error: 'Failed to get ticket status' });
    }
  }
);

module.exports = router;


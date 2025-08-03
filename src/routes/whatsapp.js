const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');
const { body, param, validationResult } = require('express-validator');

// Middleware for validation error handling
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// Webhook endpoint for incoming WhatsApp messages
router.post('/webhook', async (req, res) => {
    try {
        logger.info('WhatsApp webhook received:', req.body);
        
        const result = await whatsappService.handleWebhook(req.body);
        
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully',
            result
        });
    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process webhook',
            message: error.message
        });
    }
});

// Webhook verification endpoint (for Gupshup setup)
router.get('/webhook', (req, res) => {
    const challenge = req.query['hub.challenge'];
    const verify_token = req.query['hub.verify_token'];
    
    if (verify_token === process.env.GUPSHUP_WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Verification failed');
    }
});

// Opt-in user endpoint
router.post('/opt-in', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        const result = await whatsappService.optInUser(phoneNumber);
        
        res.status(200).json({
            success: true,
            message: 'User opted in successfully',
            result
        });
    } catch (error) {
        logger.error('Opt-in error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to opt-in user',
            message: error.message
        });
    }
});

// Send text message endpoint
router.post('/send/text', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('message').notEmpty().withMessage('Message is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        const result = await whatsappService.sendTextMessage(phoneNumber, message);
        
        res.status(200).json({
            success: true,
            message: 'Text message sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send text message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send text message',
            message: error.message
        });
    }
});

// Send button message endpoint
router.post('/send/buttons', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('text').notEmpty().withMessage('Message text is required'),
    body('buttons').isArray({ min: 1, max: 3 }).withMessage('1-3 buttons are required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, text, buttons } = req.body;
        
        const result = await whatsappService.sendButtonMessage(phoneNumber, text, buttons);
        
        res.status(200).json({
            success: true,
            message: 'Button message sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send button message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send button message',
            message: error.message
        });
    }
});

// Send list message endpoint
router.post('/send/list', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('text').notEmpty().withMessage('Message text is required'),
    body('buttonText').notEmpty().withMessage('Button text is required'),
    body('sections').isArray({ min: 1 }).withMessage('At least one section is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, text, buttonText, sections } = req.body;
        
        const result = await whatsappService.sendListMessage(phoneNumber, text, buttonText, sections);
        
        res.status(200).json({
            success: true,
            message: 'List message sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send list message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send list message',
            message: error.message
        });
    }
});

// Send welcome message endpoint
router.post('/send/welcome', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('userName').optional().isString().withMessage('User name must be a string'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, userName = 'User' } = req.body;
        
        const result = await whatsappService.sendWelcomeMessage(phoneNumber, userName);
        
        res.status(200).json({
            success: true,
            message: 'Welcome message sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send welcome message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send welcome message',
            message: error.message
        });
    }
});

// Send services menu endpoint
router.post('/send/services-menu', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        const result = await whatsappService.sendServicesMenu(phoneNumber);
        
        res.status(200).json({
            success: true,
            message: 'Services menu sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send services menu error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send services menu',
            message: error.message
        });
    }
});

// Send onboarding flow endpoint
router.post('/send/onboarding-flow', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('userType').optional().isIn(['individual', 'business']).withMessage('User type must be individual or business'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, userType = 'individual' } = req.body;
        
        const result = await whatsappService.sendOnboardingFlow(phoneNumber, userType);
        
        res.status(200).json({
            success: true,
            message: 'Onboarding flow sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send onboarding flow error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send onboarding flow',
            message: error.message
        });
    }
});

// Send KYC flow endpoint
router.post('/send/kyc-flow', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('userId').notEmpty().withMessage('User ID is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, userId } = req.body;
        
        const result = await whatsappService.sendKYCFlow(phoneNumber, userId);
        
        res.status(200).json({
            success: true,
            message: 'KYC flow sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send KYC flow error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send KYC flow',
            message: error.message
        });
    }
});

// Send transaction flow endpoint
router.post('/send/transaction-flow', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('transactionData').isObject().withMessage('Transaction data is required'),
    body('transactionData.id').notEmpty().withMessage('Transaction ID is required'),
    body('transactionData.amount').isNumeric().withMessage('Transaction amount is required'),
    body('transactionData.currency').notEmpty().withMessage('Currency is required'),
    body('transactionData.type').notEmpty().withMessage('Transaction type is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, transactionData } = req.body;
        
        const result = await whatsappService.sendTransactionFlow(phoneNumber, transactionData);
        
        res.status(200).json({
            success: true,
            message: 'Transaction flow sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send transaction flow error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send transaction flow',
            message: error.message
        });
    }
});

// Send template message endpoint
router.post('/send/template', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('templateId').notEmpty().withMessage('Template ID is required'),
    body('templateParams').optional().isArray().withMessage('Template params must be an array'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, templateId, templateParams = [] } = req.body;
        
        const result = await whatsappService.sendTemplateMessage(phoneNumber, templateId, templateParams);
        
        res.status(200).json({
            success: true,
            message: 'Template message sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send template message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send template message',
            message: error.message
        });
    }
});

// Send verification code endpoint
router.post('/send/verification-code', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('code').isLength({ min: 4, max: 8 }).withMessage('Verification code must be 4-8 characters'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        
        const result = await whatsappService.sendVerificationCode(phoneNumber, code);
        
        res.status(200).json({
            success: true,
            message: 'Verification code sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send verification code error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send verification code',
            message: error.message
        });
    }
});

// Send transaction notification endpoint
router.post('/send/transaction-notification', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('transaction').isObject().withMessage('Transaction data is required'),
    body('transaction.type').isIn(['credit', 'debit']).withMessage('Transaction type must be credit or debit'),
    body('transaction.amount').isNumeric().withMessage('Transaction amount is required'),
    body('transaction.currency').notEmpty().withMessage('Currency is required'),
    body('transaction.counterparty').notEmpty().withMessage('Counterparty is required'),
    body('transaction.reference').notEmpty().withMessage('Reference is required'),
    body('transaction.balance').isNumeric().withMessage('Balance is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, transaction } = req.body;
        transaction.timestamp = transaction.timestamp || new Date().toISOString();
        
        const result = await whatsappService.sendTransactionNotification(phoneNumber, transaction);
        
        res.status(200).json({
            success: true,
            message: 'Transaction notification sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send transaction notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send transaction notification',
            message: error.message
        });
    }
});

// Send payment reminder endpoint
router.post('/send/payment-reminder', [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    body('billData').isObject().withMessage('Bill data is required'),
    body('billData.id').notEmpty().withMessage('Bill ID is required'),
    body('billData.service').notEmpty().withMessage('Service name is required'),
    body('billData.amount').isNumeric().withMessage('Bill amount is required'),
    body('billData.currency').notEmpty().withMessage('Currency is required'),
    body('billData.dueDate').isISO8601().withMessage('Due date must be a valid date'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber, billData } = req.body;
        
        const result = await whatsappService.sendPaymentReminder(phoneNumber, billData);
        
        res.status(200).json({
            success: true,
            message: 'Payment reminder sent successfully',
            result
        });
    } catch (error) {
        logger.error('Send payment reminder error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send payment reminder',
            message: error.message
        });
    }
});

// Get user chat history endpoint
router.get('/chat-history/:phoneNumber', [
    param('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        
        // TODO: Implement chat history retrieval from database
        const chatHistory = [];
        
        res.status(200).json({
            success: true,
            message: 'Chat history retrieved successfully',
            data: {
                phoneNumber,
                chatHistory
            }
        });
    } catch (error) {
        logger.error('Get chat history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve chat history',
            message: error.message
        });
    }
});

// WhatsApp status endpoint
router.get('/status', async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            message: 'WhatsApp service is running',
            data: {
                service: 'WhatsApp Business API',
                provider: 'Gupshup',
                status: 'active',
                timestamp: new Date().toISOString(),
                features: [
                    'Text Messages',
                    'Interactive Messages',
                    'Flow Messages',
                    'Template Messages',
                    'Webhook Processing',
                    'User Onboarding',
                    'KYC Flows',
                    'Transaction Flows'
                ]
            }
        });
    } catch (error) {
        logger.error('WhatsApp status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get WhatsApp status',
            message: error.message
        });
    }
});

module.exports = router;
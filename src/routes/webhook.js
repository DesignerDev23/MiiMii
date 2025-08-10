const express = require('express');
const crypto = require('crypto');
const { WebhookLog } = require('../models');
const whatsappService = require('../services/whatsapp');
const messageProcessor = require('../services/messageProcessor');
const logger = require('../utils/logger');
const databaseService = require('../services/database');
const userService = require('../services/user');

const router = express.Router();

// Middleware to verify webhook signatures
const verifyWebhookSignature = (provider) => (req, res, next) => {
  if (provider === 'whatsapp') {
    // WhatsApp webhook verification
    if (req.query['hub.mode']) {
      return next();
    }
    
    // For actual webhooks, verify WhatsApp signature if provided
    const signature = req.headers['x-hub-signature-256'];
    const webhookSecret = process.env.WEBHOOK_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET;
    if (signature && webhookSecret) {
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
      
      if (`sha256=${expectedSignature}` !== signature) {
        logger.warn('Invalid WhatsApp webhook signature', { 
          provided: signature, 
          expected: `sha256=${expectedSignature}` 
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    return next();
  }

  if (provider === 'bellbank') {
    const signature = req.headers['x-bellbank-signature'] || req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);
    const secret = process.env.BELLBANK_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    
    if (signature && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
        logger.warn('Invalid BellBank webhook signature', { 
          provider, 
          provided: signature, 
          expected: expectedSignature 
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.warn('BellBank webhook signature verification skipped - no signature or secret provided');
    }
  }

  if (provider === 'bilal') {
    const signature = req.headers['x-bilal-signature'] || req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);
    const secret = process.env.BILAL_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    
    if (signature && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
        logger.warn('Invalid Bilal webhook signature', { 
          provider, 
          provided: signature, 
          expected: expectedSignature 
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.warn('Bilal webhook signature verification skipped - no signature or secret provided');
    }
  }

  if (provider === 'fincra') {
    const signature = req.headers['x-fincra-signature'] || req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);
    const secret = process.env.FINCRA_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    
    if (signature && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
        logger.warn('Invalid Fincra webhook signature', { 
          provider, 
          provided: signature, 
          expected: expectedSignature 
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
  }

  next();
};

// Log all webhook events
const logWebhook = (provider) => async (req, res, next) => {
  try {
    // Only log if database is healthy
    if (databaseService.isConnectionHealthy()) {
      const webhookLog = await databaseService.create(WebhookLog, {
        provider,
        event: req.body.type || req.body.event || 'unknown',
        headers: req.headers,
        payload: req.body,
        signature: req.headers['x-webhook-signature'] || req.headers['x-signature'],
        verified: true // Will be false if signature verification fails
      });
      
      req.webhookLogId = webhookLog?.id || null;
    } else {
      logger.warn('Skipping webhook logging - database connection unhealthy');
      req.webhookLogId = null;
    }
  } catch (error) {
    logger.warn('Failed to log webhook - continuing without logging', {
      error: error.message,
      provider
    });
    req.webhookLogId = null;
  }
  
  next();
};

// WhatsApp webhook endpoints
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = whatsappService.verifyWebhook(mode, token, challenge);
  
  if (result) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// WhatsApp webhook endpoint
router.post('/whatsapp', logWebhook('whatsapp'), async (req, res) => {
  try {
    logger.info('Received WhatsApp webhook', {
      bodyKeys: Object.keys(req.body),
      headers: Object.keys(req.headers)
    });

    // Parse the webhook message
      const parsedMessage = whatsappService.parseWebhookMessage(req.body);
      
    if (!parsedMessage) {
      logger.warn('Failed to parse webhook message', {
        bodyKeys: Object.keys(req.body),
        body: JSON.stringify(req.body).substring(0, 500)
      });
      return res.status(200).json({ status: 'ok', message: 'Message parsed as null' });
    }

    logger.info('Successfully parsed webhook message', {
      type: parsedMessage.type,
              messageId: parsedMessage.messageId,
      from: parsedMessage.from
    });

    // Handle verification requests
    if (parsedMessage.type === 'verification') {
      const verificationResult = whatsappService.verifyWebhook(
        parsedMessage.mode,
        parsedMessage.token,
        parsedMessage.challenge
      );
      
      if (verificationResult) {
        logger.info('Webhook verification successful');
        return res.status(200).send(verificationResult);
      } else {
        logger.warn('Webhook verification failed');
        return res.status(403).json({ error: 'Verification failed' });
      }
    }

    // Handle status updates
    if (parsedMessage.type === 'status') {
      logger.info('Processing status update', {
        status: parsedMessage.statuses?.status,
        messageId: parsedMessage.statuses?.id
      });
      return res.status(200).json({ status: 'ok', message: 'Status processed' });
    }

    // Handle flow completion
    if (parsedMessage.type === 'flow_completion') {
      logger.info('Processing flow completion', {
        flowToken: parsedMessage.flowToken,
        screen: parsedMessage.screen
      });
      
      // Process flow completion data
      try {
        await messageProcessor.processFlowCompletion(parsedMessage);
        return res.status(200).json({ status: 'ok', message: 'Flow completion processed' });
      } catch (error) {
        logger.error('Error processing flow completion', { error: error.message });
        return res.status(200).json({ status: 'ok', message: 'Flow completion error logged' });
      }
    }

    // Handle regular messages
    if (parsedMessage.type === 'message') {
      logger.info('Processing incoming message', {
        messageId: parsedMessage.messageId,
        from: parsedMessage.from,
        messageType: parsedMessage.messageType
      });

      // Process the message asynchronously
      messageProcessor.processIncomingMessage(parsedMessage)
        .then(() => {
          logger.info('Message processed successfully', {
            messageId: parsedMessage.messageId,
            from: parsedMessage.from
          });
        })
        .catch((error) => {
          logger.error('Error processing message', {
            messageId: parsedMessage.messageId,
            from: parsedMessage.from,
              error: error.message, 
            stack: error.stack
          });
        });

      return res.status(200).json({ status: 'ok', message: 'Message received' });
    }

    // Handle other webhook types
    logger.info('Processing other webhook type', {
      type: parsedMessage.type,
      valueKeys: parsedMessage.value ? Object.keys(parsedMessage.value) : 'null'
    });
    
    return res.status(200).json({ status: 'ok', message: 'Webhook processed' });

    } catch (error) {
    logger.error('Error processing WhatsApp webhook', {
        error: error.message,
        stack: error.stack,
      bodyKeys: Object.keys(req.body)
    });
    
    // Always return 200 to WhatsApp to prevent retries
    return res.status(200).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

// BellBank webhook endpoints
router.post('/bellbank',
  verifyWebhookSignature('bellbank'),
  logWebhook('bellbank'),
  async (req, res) => {
    try {
      const { type, data } = req.body;

      switch (type) {
        case 'virtual_account.credit':
          await handleVirtualAccountCredit(data);
          break;
        case 'transfer.completed':
          await handleTransferCompleted(data);
          break;
        case 'transfer.failed':
          await handleTransferFailed(data);
          break;
        default:
          logger.info('Unhandled BellBank webhook event', { type, data });
      }

      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: true, processedAt: new Date(), responseCode: 200 },
            { where: { id: req.webhookLogId } }
          );
        } catch (error) {
          logger.warn('Failed to update webhook log status', { 
            error: error.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('BellBank webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: false, errorMessage: error.message, responseCode: 500 },
            { where: { id: req.webhookLogId } }
          );
        } catch (dbError) {
          logger.warn('Failed to update webhook log with error status', { 
            error: dbError.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// BellBank incoming transfer webhook
router.post('/bellbank/incoming', async (req, res) => {
  try {
    logger.info('BellBank incoming transfer webhook received', {
      body: req.body,
      headers: req.headers
    });

    // Validate webhook signature (if BellBank provides one)
    // You should implement signature validation based on BellBank's documentation
    const isValidSignature = await validateBellBankWebhookSignature(req);
    if (!isValidSignature) {
      logger.warn('Invalid BellBank webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const bellbankService = require('../services/bellbank');
    
    // Process the incoming transfer webhook
    const result = await bellbankService.handleIncomingTransferWebhook(req.body);
    
    logger.info('BellBank incoming transfer webhook processed successfully', {
      result
    });

    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      result 
    });

  } catch (error) {
    logger.error('BellBank incoming transfer webhook failed', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({ 
      success: false, 
      error: 'Webhook processing failed',
      message: error.message 
    });
  }
});

// Bilal webhook endpoints
router.post('/bilal',
  verifyWebhookSignature('bilal'),
  logWebhook('bilal'),
  async (req, res) => {
    try {
      // Bilal webhook format: { status, request-id, response }
      const webhookData = req.body;
      
      if (webhookData.status && webhookData['request-id']) {
        await handleBilalCallback(webhookData);
      } else {
        logger.warn('Invalid Bilal webhook format', { webhookData });
      }

      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: true, processedAt: new Date(), responseCode: 200 },
            { where: { id: req.webhookLogId } }
          );
        } catch (error) {
          logger.warn('Failed to update webhook log status', { 
            error: error.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Bilal webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: false, errorMessage: error.message, responseCode: 500 },
            { where: { id: req.webhookLogId } }
          );
        } catch (dbError) {
          logger.warn('Failed to update webhook log with error status', { 
            error: dbError.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Fincra webhook endpoints (for BVN verification updates)
router.post('/fincra',
  verifyWebhookSignature('fincra'),
  logWebhook('fincra'),
  async (req, res) => {
    try {
      const { event, data } = req.body;

      switch (event) {
        case 'bvn.verified':
          await handleBvnVerified(data);
          break;
        case 'bvn.rejected':
          await handleBvnRejected(data);
          break;
        default:
          logger.info('Unhandled Fincra webhook event', { event, data });
      }

      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: true, processedAt: new Date(), responseCode: 200 },
            { where: { id: req.webhookLogId } }
          );
        } catch (error) {
          logger.warn('Failed to update webhook log status', { 
            error: error.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Fincra webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: false, errorMessage: error.message, responseCode: 500 },
            { where: { id: req.webhookLogId } }
          );
        } catch (dbError) {
          logger.warn('Failed to update webhook log with error status', { 
            error: dbError.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Dojah webhook endpoints (for KYC status updates) - keeping for backward compatibility
router.post('/dojah',
  verifyWebhookSignature('dojah'),
  logWebhook('dojah'),
  async (req, res) => {
    try {
      const { event, data } = req.body;

      switch (event) {
        case 'kyc.verified':
          await handleKycVerified(data);
          break;
        case 'kyc.rejected':
          await handleKycRejected(data);
          break;
        default:
          logger.info('Unhandled Dojah webhook event', { event, data });
      }

      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: true, processedAt: new Date(), responseCode: 200 },
            { where: { id: req.webhookLogId } }
          );
        } catch (error) {
          logger.warn('Failed to update webhook log status', { 
            error: error.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Dojah webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        try {
          await databaseService.update(WebhookLog,
            { processed: false, errorMessage: error.message, responseCode: 500 },
            { where: { id: req.webhookLogId } }
          );
        } catch (dbError) {
          logger.warn('Failed to update webhook log with error status', { 
            error: dbError.message, 
            webhookLogId: req.webhookLogId 
          });
        }
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Webhook handler functions
async function handleVirtualAccountCredit(data) {
  // Handle BellBank webhook notification format
  const bellbankService = require('../services/bellbank');
  const processedData = bellbankService.handleWebhookNotification(data);

  const walletService = require('../services/wallet');
  await walletService.creditWalletFromVirtualAccount(processedData);
}

async function handleTransferCompleted(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBellBankTransferComplete(data);
}

async function handleTransferFailed(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBellBankTransferFailed(data);
}

async function handleBilalCallback(data) {
  const bilalService = require('../services/bilal');
  await bilalService.handleBilalCallback(data);
}

async function handleKycVerified(data) {
  const kycService = require('../services/kyc');
  await kycService.handleKycVerified(data);
}

async function handleKycRejected(data) {
  const kycService = require('../services/kyc');
  await kycService.handleKycRejected(data);
}

async function handleBvnVerified(data) {
  const fincraService = require('../services/fincra');
  await fincraService.handleBvnVerified(data);
}

async function handleBvnRejected(data) {
  const fincraService = require('../services/fincra');
  await fincraService.handleBvnRejected(data);
}

// Validate BellBank webhook signature
async function validateBellBankWebhookSignature(req) {
  try {
    // This should be implemented based on BellBank's webhook signature validation
    // For now, we'll return true, but you should implement proper validation
    
    // Example implementation:
    // const signature = req.headers['x-bellbank-signature'];
    // const payload = JSON.stringify(req.body);
    // const expectedSignature = crypto
    //   .createHmac('sha256', process.env.BELLBANK_WEBHOOK_SECRET)
    //   .update(payload)
    //   .digest('hex');
    // return signature === expectedSignature;
    
    return true; // Placeholder - implement proper validation
  } catch (error) {
    logger.error('Failed to validate BellBank webhook signature', {
      error: error.message
    });
    return false;
  }
}

module.exports = router;
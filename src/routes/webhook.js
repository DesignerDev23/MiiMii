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
    if (signature && process.env.WHATSAPP_WEBHOOK_SECRET) {
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET)
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
  const webhookLog = await databaseService.safeExecute(async () => {
    return await databaseService.createWithRetry(WebhookLog, {
      provider,
      event: req.body.type || req.body.event || 'unknown',
      headers: req.headers,
      payload: req.body,
      signature: req.headers['x-webhook-signature'] || req.headers['x-signature'],
      verified: true // Will be false if signature verification fails
    }, {}, { operationName: 'log webhook' });
  }, {
    operationName: 'webhook logging',
    fallbackValue: null,
    logWarning: true
  });

  req.webhookLogId = webhookLog?.id || null;
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

router.post('/whatsapp',
  verifyWebhookSignature('whatsapp'),
  logWebhook('whatsapp'),
  async (req, res) => {
    try {
      const parsedMessage = whatsappService.parseWebhookMessage(req.body);
      
      if (parsedMessage) {
        // Handle webhook verification requests
        if (parsedMessage.type === 'verification') {
          logger.info('Handling webhook verification request');
          const challenge = parsedMessage.challenge;
          res.status(200).send(challenge);
          return;
        }

        if (parsedMessage.type === 'message') {
          // Mark message as read
          await whatsappService.markMessageAsRead(parsedMessage.messageId);
          
          // Check if this is a Flow webhook
          if (parsedMessage.flowData) {
            logger.info('Processing Flow webhook data', {
              messageId: parsedMessage.messageId,
              flowToken: parsedMessage.flowData.flow_token,
              screen: parsedMessage.flowData.screen
            });
            
            const whatsappFlowService = require('../services/whatsappFlowService');
            const flowResult = await whatsappFlowService.handleFlowWebhook(parsedMessage.flowData);
            
            if (flowResult.success) {
              // Send appropriate response based on flow result
              const user = await userService.getUserById(flowResult.userId);
              if (user && flowResult.result.message) {
                await whatsappService.sendTextMessage(user.whatsappNumber, flowResult.result.message);
              }
            }
          } else {
            // Process the message with AI/NLP
            await messageProcessor.processIncomingMessage(parsedMessage);
          }
        } else if (parsedMessage.type === 'status') {
          // Handle message status updates
          logger.info('WhatsApp message status update', parsedMessage.statuses);
        } else if (parsedMessage.type === 'flow_completion') {
          // Handle Flow completion webhooks
          logger.info('Processing Flow completion webhook', {
            flowToken: parsedMessage.flowData.flow_token,
            screen: parsedMessage.flowData.screen
          });
          
          const whatsappFlowService = require('../services/whatsappFlowService');
          const flowResult = await whatsappFlowService.handleFlowWebhook(parsedMessage.flowData);
          
          if (flowResult.success) {
            const user = await userService.getUserById(flowResult.userId);
            if (user && flowResult.result.message) {
              await whatsappService.sendTextMessage(user.whatsappNumber, flowResult.result.message);
            }
          }
        }

        // Update webhook log as processed
        if (req.webhookLogId) {
          try {
            await WebhookLog.update(
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
      } else {
        logger.warn('No valid message parsed from webhook', {
          bodyKeys: Object.keys(req.body),
          hasEntry: !!req.body.entry,
          hasChanges: !!req.body.entry?.[0]?.changes
        });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('WhatsApp webhook processing failed', { 
        error: error.message,
        stack: error.stack,
        bodyKeys: Object.keys(req.body || {})
      });
      
      // Update webhook log with error
      if (req.webhookLogId) {
        try {
          await WebhookLog.update(
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
      
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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
          await WebhookLog.update(
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

module.exports = router;
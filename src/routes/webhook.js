const express = require('express');
const crypto = require('crypto');
const { WebhookLog } = require('../models');
const whatsappService = require('../services/whatsapp');
const messageProcessor = require('../services/messageProcessor');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to verify webhook signatures
const verifyWebhookSignature = (provider) => (req, res, next) => {
  if (provider === 'whatsapp') {
    // WhatsApp doesn't require signature verification for webhook verification
    if (req.query['hub.mode']) {
      return next();
    }
    // For actual webhooks, Meta doesn't send signature for WhatsApp Business API
    return next();
  }

  if (provider === 'bellbank' || provider === 'bilal') {
    const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn(`Invalid webhook signature from ${provider}`, { signature, expectedSignature });
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  next();
};

// Log all webhook events
const logWebhook = (provider) => async (req, res, next) => {
  try {
    const webhookLog = await WebhookLog.create({
      provider,
      event: req.body.type || req.body.event || 'unknown',
      headers: req.headers,
      payload: req.body,
      signature: req.headers['x-webhook-signature'] || req.headers['x-signature'],
      verified: true // Will be false if signature verification fails
    });

    req.webhookLogId = webhookLog.id;
    next();
  } catch (error) {
    logger.error('Failed to log webhook', { error: error.message, provider });
    next();
  }
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
        if (parsedMessage.type === 'message') {
          // Mark message as read
          await whatsappService.markMessageAsRead(parsedMessage.messageId);
          
          // Process the message with AI/NLP
          await messageProcessor.processIncomingMessage(parsedMessage);
        } else if (parsedMessage.type === 'status') {
          // Handle message status updates
          logger.info('WhatsApp message status update', parsedMessage.statuses);
        }

        // Update webhook log as processed
        if (req.webhookLogId) {
          await WebhookLog.update(
            { processed: true, processedAt: new Date(), responseCode: 200 },
            { where: { id: req.webhookLogId } }
          );
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('WhatsApp webhook processing failed', { error: error.message });
      
      // Update webhook log with error
      if (req.webhookLogId) {
        await WebhookLog.update(
          { processed: false, errorMessage: error.message, responseCode: 500 },
          { where: { id: req.webhookLogId } }
        );
      }

      res.status(500).json({ error: 'Internal server error' });
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
        await WebhookLog.update(
          { processed: true, processedAt: new Date(), responseCode: 200 },
          { where: { id: req.webhookLogId } }
        );
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('BellBank webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        await WebhookLog.update(
          { processed: false, errorMessage: error.message, responseCode: 500 },
          { where: { id: req.webhookLogId } }
        );
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
      const { event, data } = req.body;

      switch (event) {
        case 'airtime.successful':
          await handleAirtimeSuccess(data);
          break;
        case 'airtime.failed':
          await handleAirtimeFailed(data);
          break;
        case 'data.successful':
          await handleDataSuccess(data);
          break;
        case 'data.failed':
          await handleDataFailed(data);
          break;
        case 'utility.successful':
          await handleUtilitySuccess(data);
          break;
        case 'utility.failed':
          await handleUtilityFailed(data);
          break;
        default:
          logger.info('Unhandled Bilal webhook event', { event, data });
      }

      if (req.webhookLogId) {
        await WebhookLog.update(
          { processed: true, processedAt: new Date(), responseCode: 200 },
          { where: { id: req.webhookLogId } }
        );
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Bilal webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        await WebhookLog.update(
          { processed: false, errorMessage: error.message, responseCode: 500 },
          { where: { id: req.webhookLogId } }
        );
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Dojah webhook endpoints (for KYC status updates)
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
        await WebhookLog.update(
          { processed: true, processedAt: new Date(), responseCode: 200 },
          { where: { id: req.webhookLogId } }
        );
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Dojah webhook processing failed', { error: error.message });
      
      if (req.webhookLogId) {
        await WebhookLog.update(
          { processed: false, errorMessage: error.message, responseCode: 500 },
          { where: { id: req.webhookLogId } }
        );
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

async function handleAirtimeSuccess(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalSuccess(data, 'airtime');
}

async function handleAirtimeFailed(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalFailed(data, 'airtime');
}

async function handleDataSuccess(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalSuccess(data, 'data');
}

async function handleDataFailed(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalFailed(data, 'data');
}

async function handleUtilitySuccess(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalSuccess(data, 'utility');
}

async function handleUtilityFailed(data) {
  const transactionService = require('../services/transaction');
  await transactionService.handleBilalFailed(data, 'utility');
}

async function handleKycVerified(data) {
  const kycService = require('../services/kyc');
  await kycService.handleKycVerified(data);
}

async function handleKycRejected(data) {
  const kycService = require('../services/kyc');
  await kycService.handleKycRejected(data);
}

module.exports = router;
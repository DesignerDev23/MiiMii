const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const userService = require('../services/user');
const onboardingService = require('../services/onboarding');
const kycService = require('../services/kyc');
const whatsappFlowService = require('../services/whatsappFlowService');

const router = express.Router();

// Configuration for Flow endpoint
const FLOW_CONFIG = {
  version: '3.0',
  privateKey: process.env.FLOW_PRIVATE_KEY,
  passphrase: process.env.FLOW_PASSPHRASE,
  endpointUrl: process.env.FLOW_ENDPOINT_URL || 'https://api.chatmiimii.com/api/flow/endpoint'
};

/**
 * Main Flow endpoint that handles all Flow requests
 * This implements the official WhatsApp Flow endpoint specification
 */
router.post('/endpoint', async (req, res) => {
  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

    logger.info('Flow endpoint request received', {
      hasEncryptedData: !!encrypted_flow_data,
      hasAesKey: !!encrypted_aes_key,
      hasInitialVector: !!initial_vector,
      bodyKeys: Object.keys(req.body),
      contentType: req.get('Content-Type')
    });

    // Handle unencrypted health check requests from WhatsApp (fallback for non-Flow requests)
    if (!encrypted_flow_data && !encrypted_aes_key && !initial_vector) {
      logger.info('Unencrypted health check request detected');
      
      // Check if this is a ping action
      if (req.body.action === 'ping') {
        logger.info('Processing ping action - unencrypted');
        
        const pingResponse = {
          data: {
            status: 'active'
          }
        };
        
        // Return as plain JSON for unencrypted requests
        return res.status(200).json(pingResponse);
      }
      
      // For other unencrypted requests, return basic health status
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: FLOW_CONFIG.version
      });
    }

    // Check if encryption is configured for actual Flow requests
    if (!FLOW_CONFIG.privateKey) {
      logger.error('Flow endpoint called but private key not configured');
      
      // Create error response
      const errorResponse = {
        version: FLOW_CONFIG.version,
        screen: 'ERROR_SCREEN',
        data: {
          error: 'Flow encryption not configured. Please contact support.',
          code: 'ENCRYPTION_NOT_CONFIGURED'
        }
      };
      
      // Return as Base64 encoded string
      const errorBase64 = Buffer.from(JSON.stringify(errorResponse)).toString('base64');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(errorBase64);
    }

    // Validate required fields for encrypted requests
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      logger.warn('Missing required Flow endpoint fields', {
        hasEncryptedData: !!encrypted_flow_data,
        hasAesKey: !!encrypted_aes_key,
        hasInitialVector: !!initial_vector
      });
      return res.status(421).json({
        error: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'This endpoint requires encrypted data for Flow requests.'
      });
    }

    // Decrypt the request
    const decryptedData = await decryptFlowRequest(
      encrypted_flow_data,
      encrypted_aes_key,
      initial_vector
    );

    if (!decryptedData.success) {
      logger.error('Failed to decrypt Flow request', {
        error: decryptedData.error
      });
      
      // Create error response and encrypt it
      const errorResponse = {
        version: FLOW_CONFIG.version,
        screen: 'ERROR_SCREEN',
        data: {
          error: 'Unable to process your request. Please try again or contact support.',
          code: 'DECRYPTION_FAILED'
        }
      };
      
      // For decryption errors, we can't encrypt the response, so return a basic error
      const basicErrorBase64 = Buffer.from(JSON.stringify(errorResponse)).toString('base64');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(basicErrorBase64);
    }

    // Process the decrypted request
    const response = await processFlowRequest(decryptedData.data);

    // Encrypt the response (mirror IV handling and algorithm)
    const encryptedResponse = await encryptFlowResponse(
      response,
      decryptedData.aesKey,
      decryptedData.initialVector,
      { usedFlippedIV: decryptedData.usedFlippedIV, aesAlgo: decryptedData.aesAlgo }
    );

    if (!encryptedResponse.success) {
      logger.error('Failed to encrypt Flow response', {
        error: encryptedResponse.error
      });
      
      // Create error response
      const errorResponse = {
        version: FLOW_CONFIG.version,
        screen: 'ERROR_SCREEN',
        data: {
          error: 'Unable to process your request. Please try again.',
          code: 'ENCRYPTION_FAILED'
        }
      };
      
      // Return as Base64 encoded string
      const errorBase64 = Buffer.from(JSON.stringify(errorResponse)).toString('base64');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(errorBase64);
    }

    // Return encrypted response as plain text (as per WhatsApp spec)
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(encryptedResponse.data);

  } catch (error) {
    logger.error('Flow endpoint error', {
      error: error.message,
      stack: error.stack
    });
    
    // Create error response
    const errorResponse = {
      version: FLOW_CONFIG.version,
      screen: 'ERROR_SCREEN',
      data: {
        error: 'Service temporarily unavailable. Please try again later.',
        code: 'INTERNAL_ERROR'
      }
    };
    
    // Return as Base64 encoded string
    const errorBase64 = Buffer.from(JSON.stringify(errorResponse)).toString('base64');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(errorBase64);
  }
});

/**
 * Health check endpoint for Flow
 */
router.get('/health', async (req, res) => {
  try {
    // Check if private key is configured
    const hasPrivateKey = !!FLOW_CONFIG.privateKey;
    
    const healthStatus = {
      status: hasPrivateKey ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: FLOW_CONFIG.version,
      endpoint: FLOW_CONFIG.endpointUrl,
      encryption: {
        enabled: hasPrivateKey,
        configured: hasPrivateKey,
        message: hasPrivateKey ? 'Encryption properly configured' : 'Private key not configured'
      },
      services: {
        database: 'connected',
        userService: 'available',
        onboardingService: 'available'
      }
    };

    // Return 200 for health check even if encryption is not configured
    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * WhatsApp Business Manager specific health check endpoint
 * This endpoint is specifically for WhatsApp Business Manager health checks
 */
router.get('/whatsapp-health', async (req, res) => {
  try {
    logger.info('WhatsApp Business Manager health check received');
    
    // Simple health check response as expected by WhatsApp Business Manager
    res.status(200).json({
      status: 'ok',
      message: 'Flow endpoint is healthy and ready for WhatsApp Business Manager',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('WhatsApp health check failed', { error: error.message });
    res.status(200).json({
      status: 'error',
      message: 'Flow endpoint health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Simple ping endpoint for Flow (no encryption required)
 */
router.get('/ping', async (req, res) => {
  try {
    res.json({
      status: 'pong',
      timestamp: new Date().toISOString(),
      version: FLOW_CONFIG.version,
      message: 'Flow endpoint is reachable'
    });
  } catch (error) {
    logger.error('Ping failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET endpoint for Flow (handles WhatsApp Business Manager health checks)
 */
router.get('/endpoint', async (req, res) => {
  try {
    logger.info('WhatsApp Business Manager GET health check received');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: FLOW_CONFIG.version,
      encryption: {
        enabled: !!FLOW_CONFIG.privateKey,
        configured: !!FLOW_CONFIG.privateKey
      },
      message: 'Flow endpoint is available for WhatsApp Business Manager'
    });
  } catch (error) {
    logger.error('Flow GET endpoint failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test endpoint for Flow (no encryption required)
 */
router.get('/test', async (req, res) => {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: FLOW_CONFIG.version,
      message: 'Flow test endpoint is working',
      endpoints: {
        health: '/api/flow/health',
        ping: '/api/flow/ping',
        endpoint: '/api/flow/endpoint (requires encryption)'
      }
    });
  } catch (error) {
    logger.error('Test failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Decrypt Flow request using RSA and AES
 */
async function decryptFlowRequest(encryptedFlowData, encryptedAesKey, initialVector) {
  try {
    if (!FLOW_CONFIG.privateKey) {
      throw new Error('Private key not configured');
    }

    // Validate inputs
    if (!encryptedFlowData || !encryptedAesKey || !initialVector) {
      throw new Error('Missing encryption parameters');
    }

    // Normalize private key newlines/format (env vars may contain escaped \n)
    const normalizePrivateKey = (raw) => {
      if (!raw) return raw;
      let k = String(raw).trim();
      // Replace escaped newline sequences with real newlines
      k = k.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
      // Ensure header/footer have proper newlines around
      if (k.includes('BEGIN') && !k.includes('\n')) {
        // If it is all on one line, force newlines around headers
        k = k.replace('-----BEGIN', '\n-----BEGIN');
        k = k.replace('KEY-----', 'KEY-----\n');
      }
      return k;
    };

    const normalizedPem = normalizePrivateKey(FLOW_CONFIG.privateKey);

    // Prepare private key for decryption using KeyObject (handles formats/openssl3)
    let keyObject;
    try {
      keyObject = crypto.createPrivateKey({
        key: normalizedPem,
        format: 'pem',
        passphrase: FLOW_CONFIG.passphrase || undefined
      });
    } catch (pemErr) {
      // Fallback: treat as base64 DER PKCS#8 (starts with MII...)
      try {
        const compact = (FLOW_CONFIG.privateKey || '').replace(/\s+/g, '');
        if (/^MII[A-Za-z0-9+/=]+$/.test(compact)) {
          const der = Buffer.from(compact, 'base64');
          keyObject = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8', passphrase: FLOW_CONFIG.passphrase || undefined });
        } else {
          throw pemErr;
        }
      } catch (derErr) {
        throw new Error(`Invalid private key: ${derErr.message}`);
      }
    }

    // Decrypt the AES key using RSA-OAEP with SHA-256
    const aesKeyBytes = crypto.privateDecrypt(
      {
        key: keyObject,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(encryptedAesKey, 'base64')
    );

    // Select AES-GCM algorithm based on key length (16/24/32 => 128/192/256)
    const keyLen = aesKeyBytes.length;
    let aesAlgo;
    if (keyLen === 16) {
      aesAlgo = 'aes-128-gcm';
    } else if (keyLen === 24) {
      aesAlgo = 'aes-192-gcm';
    } else if (keyLen === 32) {
      aesAlgo = 'aes-256-gcm';
    } else {
      logger.warn('Decrypted AES key length unexpected', { length: keyLen });
      // Try best-effort: default to aes-256-gcm, but will likely fail
      aesAlgo = 'aes-256-gcm';
    }

    // Decrypt the Flow data using AES-GCM
    const initialVectorBytes = Buffer.from(initialVector, 'base64');
    const flowDataBytes = Buffer.from(encryptedFlowData, 'base64');

    const ciphertext = flowDataBytes.slice(0, -16);
    const authTag = flowDataBytes.slice(-16);

    const tryDecrypt = (ivBuf) => {
      const decipher = crypto.createDecipheriv(aesAlgo, aesKeyBytes, ivBuf);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    };

    let decryptedData;
    let usedFlippedIV = false;
    try {
      // Try without IV flip first
      decryptedData = tryDecrypt(initialVectorBytes);
    } catch (e1) {
      // Fallback: try with IV bits flipped (XOR 0xFF)
      const flippedIV = Buffer.from(initialVectorBytes);
      for (let i = 0; i < flippedIV.length; i++) {
        flippedIV[i] = flippedIV[i] ^ 0xff;
      }
      decryptedData = tryDecrypt(flippedIV);
      usedFlippedIV = true;
    }

    const decryptedJson = JSON.parse(decryptedData.toString('utf8'));

    logger.info('Flow request decrypted successfully', {
      action: decryptedJson.action,
      screen: decryptedJson.screen,
      hasData: !!decryptedJson.data
    });

    return {
      success: true,
      data: decryptedJson,
      aesKey: aesKeyBytes,
      initialVector: initialVectorBytes,
      usedFlippedIV,
      aesAlgo
    };

  } catch (error) {
    logger.error('Flow request decryption failed', { 
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Handle specific crypto errors
    if (error.message.includes('interrupted or cancelled')) {
      return {
        success: false,
        error: 'Decryption interrupted - private key may be invalid or missing passphrase'
      };
    }
    
    return {
      success: false,
      error: `Decryption failed: ${error.message}`
    };
  }
}

/**
 * Encrypt Flow response using AES-GCM
 */
async function encryptFlowResponse(response, aesKey, initialVector, opts = {}) {
  try {
    // Convert response to JSON
    const responseJson = JSON.stringify(response);

    const usedFlippedIV = opts.usedFlippedIV === true;
    const aesAlgo = opts.aesAlgo || 'aes-256-gcm';

    // For response encryption, we should ALWAYS flip the IV (as per WhatsApp Flow spec)
    // This is different from request decryption where we try both normal and flipped IV
    const ivForResponse = Buffer.from(initialVector);
    for (let i = 0; i < ivForResponse.length; i++) {
      ivForResponse[i] = ivForResponse[i] ^ 0xff;
    }

    // AES-GCM encrypt with matching algorithm
    const cipher = crypto.createCipheriv(aesAlgo, aesKey, ivForResponse);
    // If Meta sets AAD, set it here. We assume none.

    const encryptedData = Buffer.concat([
      cipher.update(responseJson, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    const finalEncryptedData = Buffer.concat([encryptedData, authTag]);

    // Return as base64 string
    const encryptedBase64 = finalEncryptedData.toString('base64');

    logger.info('Flow response encrypted successfully', {
      responseLength: responseJson.length,
      encryptedLength: encryptedBase64.length,
      usedFlippedIV: usedFlippedIV,
      aesAlgo: aesAlgo,
      originalIVLength: initialVector.length,
      flippedIVLength: ivForResponse.length
    });

    return {
      success: true,
      data: encryptedBase64
    };

  } catch (error) {
    logger.error('Flow response encryption failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process Flow request based on action type
 */
async function processFlowRequest(requestData) {
  const { action, screen, data, flow_token } = requestData;

  logger.info('Processing Flow request', {
    action,
    screen,
    hasData: !!data,
    hasFlowToken: !!flow_token
  });

  try {
    // For ping actions, skip token verification as they don't include a flow_token
    // Note: According to WhatsApp Flow specification, ping requests should be encrypted
    if (action === 'ping') {
      logger.info('Processing ping action - skipping token verification');
      return {
        data: {
          status: 'active'
        }
      };
    }

    // Verify flow token for other actions
    if (!flow_token) {
      logger.warn('Missing flow token for non-ping action', { action });
      return {
        screen: 'ERROR_SCREEN',
        data: {
          error: 'Invalid session. Please start over.',
          code: 'MISSING_TOKEN'
        }
      };
    }

    logger.info('Verifying flow token', { 
      tokenLength: flow_token.length,
      tokenPrefix: flow_token.substring(0, 10) + '...',
      fullToken: flow_token
    });
    
    const tokenData = whatsappFlowService.verifyFlowToken(flow_token);
    if (!tokenData.valid) {
      logger.warn('Invalid flow token', { reason: tokenData.reason });
      return {
        screen: 'ERROR_SCREEN',
        data: {
          error: 'Invalid session. Please start over.',
          code: 'INVALID_TOKEN'
        }
      };
    }
    
    logger.info('Flow token verified successfully', { 
      source: tokenData.source,
      tokenLength: tokenData.token?.length
    });

    // Process based on action
    switch (action) {
      case 'data_exchange':
        return handleDataExchange(screen, data, tokenData, flow_token);

      case 'complete':
        return handleCompleteAction(screen, data, tokenData, flow_token);

      default:
        logger.warn('Unknown Flow action', { action });
        return {
          screen: 'ERROR_SCREEN',
          data: {
            error: 'Unknown action',
            code: 'UNKNOWN_ACTION'
          }
        };
    }

  } catch (error) {
    logger.error('Flow request processing failed', { error: error.message });
    return {
      screen: 'ERROR_SCREEN',
      data: {
        error: 'Processing failed',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle complete action requests
 */
async function handleCompleteAction(screen, data, tokenData, flowToken = null) {
  try {
    logger.info('Handling complete action', {
      screen,
      dataKeys: Object.keys(data || {}),
      flowToken: flowToken ? flowToken.substring(0, 20) + '...' : 'none'
    });

    // Handle transfer PIN verification
    if (screen === 'PIN_VERIFICATION_SCREEN') {
      logger.info('PIN_VERIFICATION_SCREEN complete action received', {
        dataKeys: Object.keys(data || {}),
        hasNetwork: !!data.network,
        hasPhoneNumber: !!data.phoneNumber,
        hasDataPlan: !!data.dataPlan,
        hasPin: !!data.pin,
        sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
        hasTransferData: !!(tokenData.sessionData && tokenData.sessionData.transferData),
        flowToken: flowToken
      });
      
      // Validate data purchase flow data before processing
      if (data.network && data.phoneNumber && data.dataPlan) {
        logger.info('Detected data purchase flow in complete action');
        
        // Validate network
        if (!['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(data.network)) {
          return {
            screen: 'PIN_VERIFICATION_SCREEN',
            data: {
              error: 'Invalid network selected. Please try again.',
              message: 'Please select a valid network'
            }
          };
        }
        
        // Validate phone number
        if (!data.phoneNumber || !/^0[789][01][0-9]{8}$/.test(data.phoneNumber)) {
          return {
            screen: 'PIN_VERIFICATION_SCREEN',
            data: {
              error: 'Invalid phone number format. Please try again.',
              message: 'Phone number must be 11 digits starting with 070, 071, 080, 081, 090, or 091'
            }
          };
        }
        
        // Validate data plan
        if (!data.dataPlan || !/^\d+$/.test(data.dataPlan)) {
          return {
            screen: 'PIN_VERIFICATION_SCREEN',
            data: {
              error: 'Invalid data plan selected. Please try again.',
              message: 'Please select a valid data plan'
            }
          };
        }
        
        // Validate PIN format
        if (!data.pin || !/^\d{4}$/.test(data.pin)) {
          return {
            screen: 'PIN_VERIFICATION_SCREEN',
            data: {
              error: 'Please enter exactly 4 digits for your PIN.',
              message: 'PIN must be exactly 4 digits'
            }
          };
        }
        
        const result = await handleDataPurchaseScreen(data, tokenData.userId, tokenData, flowToken);
        
        // If data purchase was successful, return empty response to close terminal flow
        if (Object.keys(result).length === 0) {
          logger.info('Data purchase successful, returning empty response to close flow');
          return result;
        }
        
        return result;
      } else if (tokenData.sessionData && tokenData.sessionData.transferData) {
        logger.info('Detected transfer flow in complete action');
        const result = await handleTransferPinScreen(data, tokenData.userId, tokenData, flowToken);
        
        // If transfer was successful, return empty response to close terminal flow
        if (Object.keys(result).length === 0) {
          logger.info('Transfer successful, returning empty response to close flow');
          return result;
        }
        
        return result;
      } else {
        logger.error('Unable to determine flow type in complete action', {
          dataKeys: Object.keys(data || {}),
          sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
          hasTransferData: !!(tokenData.sessionData && tokenData.sessionData.transferData),
          flowToken: flowToken
        });
        
        // Try to extract transfer data from any available source as fallback
        if (data && (data.transfer_amount || data.recipient_name || data.bank_name)) {
          logger.info('Attempting fallback transfer processing with available data in complete action');
          const result = await handleTransferPinScreen(data, tokenData.userId, tokenData, flowToken);
          return result;
        }
        
        return {
          screen: 'PIN_VERIFICATION_SCREEN',
          data: {
            error: 'Unable to determine transaction type. Please try again.',
            error_message: 'Flow context not found'
          }
        };
      }
    }

    // Handle login PIN verification
    if (screen === 'PIN_INPUT_SCREEN') {
      const result = await handleLoginScreen(data, tokenData.userId, tokenData);
      
      // If login was successful, return completion response
      if (result.data?.success) {
        return {
          screen: 'COMPLETION_SCREEN',
          data: {
            success: true,
            message: 'Login successful! Welcome back to MiiMii!'
          }
        };
      }
      
      // If there was an error, return error response
      return result;
    }

    // Data purchase and transfer flows are now handled in the main PIN_VERIFICATION_SCREEN case

    // For other terminal flows, return success response
    return {
      screen: screen,
      data: {
        success: true,
        message: 'Action completed successfully',
        completed: true,
        terminal: true
      }
    };

  } catch (error) {
    logger.error('Complete action processing failed', { error: error.message });
    return {
      screen: 'ERROR_SCREEN',
      data: {
        error: 'Completion failed',
        code: 'COMPLETION_ERROR'
      }
    };
  }
}

/**
 * Handle data exchange requests
 */
async function handleDataExchange(screen, data, tokenData, flowToken = null) {
  try {
    // Try map flow token to user or fallback to phoneNumber in data
    let userId = tokenData.userId || null;
    let phoneNumber = data?.phoneNumber || null;
    
            // Try redis lookup with flow token
        if (!userId && flowToken) {
          try {
            const redisClient = require('../utils/redis');
            const sessionKey = flowToken;
            logger.info('Looking up session in Redis', { 
              sessionKey, 
              flowToken,
              redisConnected: redisClient.isConnected,
              redisUseDbFallback: redisClient.useDbFallback
            });
            const session = await redisClient.getSession(sessionKey);
            if (session) {
              userId = session.userId || userId;
              phoneNumber = session.phoneNumber || phoneNumber;
              // Store session data for use in screen handlers
              tokenData.sessionData = session;
              logger.info('Session found in Redis', { 
                sessionKey, 
                hasUserId: !!session.userId, 
                hasPhoneNumber: !!session.phoneNumber,
                hasTransferData: !!session.transferData,
                sessionKeys: Object.keys(session),
                sessionData: session
              });
            } else {
              logger.warn('No session found in Redis', { 
                sessionKey, 
                flowToken,
                sessionKeyLength: sessionKey.length,
                flowTokenLength: flowToken.length,
                sessionKeyPrefix: sessionKey.substring(0, 10) + '...',
                flowTokenPrefix: flowToken.substring(0, 10) + '...'
              });
              // Try to get user from token data if available
              if (tokenData.userId) {
                userId = tokenData.userId;
                logger.info('Using userId from token data', { userId });
              }
            }
          } catch (error) {
            logger.error('Error looking up session in Redis', { error: error.message, flowToken });
          }
        }

    if (!userId && phoneNumber) {
      const userService = require('../services/user');
      const user = await userService.getUserByWhatsappNumber(phoneNumber).catch(() => null);
      if (user) userId = user.id;
    }

    logger.info('Handling data exchange', {
      screen,
      tokenData,
      flowId: tokenData.flowId,
      source: tokenData.source,
      dataKeys: Object.keys(data || {}),
      hasSessionData: !!tokenData.sessionData,
      sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
      userId,
      phoneNumber
    });

    // Process based on screen
    switch (screen) {
      case 'QUESTION_ONE':
      case 'screen_poawge':
        return handlePersonalDetailsScreen(data, userId, tokenData);

      case 'screen_kswuhq':
        return handleBvnVerificationScreen(data, userId, tokenData);

      case 'screen_wkunnj':
        return handlePinSetupScreen(data, userId, tokenData);

      case 'PIN_INPUT_SCREEN':
        return handleLoginScreen(data, userId, tokenData);

      case 'NETWORK_SELECTION_SCREEN':
        return handleNetworkSelectionScreen(data, userId, tokenData, flowToken);

      case 'PHONE_INPUT_SCREEN':
        return handlePhoneInputScreen(data, userId, tokenData, flowToken);

      case 'DATA_PLAN_SELECTION_SCREEN':
        // Check if this is a navigate action (user coming from phone input)
        if (data.network && data.phoneNumber && !data.dataPlan) {
          logger.info('Navigate to DATA_PLAN_SELECTION_SCREEN - populating plans for network:', data.network);
          
          // Get data plans for the selected network
          const availablePlans = getDataPlansForNetwork(data.network);
          
          // Format plans for the RadioButtonsGroup
          const formattedPlans = availablePlans.map(plan => ({
            id: plan.id.toString(),
            title: `${plan.title} - ₦${plan.price} (${plan.validity})`
          }));

          logger.info('Formatted plans for flow:', formattedPlans);

          return {
            screen: 'DATA_PLAN_SELECTION_SCREEN',
            data: {
              network: data.network,
              phoneNumber: data.phoneNumber,
              dataPlans: formattedPlans
            }
          };
        }
        
        return handleDataPlanSelectionScreen(data, userId, tokenData, flowToken);

      case 'CONFIRMATION_SCREEN':
        return handleConfirmationScreen(data, userId, tokenData, flowToken);

      case 'PIN_VERIFICATION_SCREEN':
        // Check if this is a data purchase flow or transfer flow
        logger.info('PIN_VERIFICATION_SCREEN received', {
          dataKeys: Object.keys(data || {}),
          hasNetwork: !!data.network,
          hasPhoneNumber: !!data.phoneNumber,
          hasDataPlan: !!data.dataPlan,
          hasPin: !!data.pin,
          sessionData: tokenData.sessionData,
          hasSessionData: !!tokenData.sessionData,
          sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
          flowToken: flowToken,
          tokenDataKeys: Object.keys(tokenData || {}),
          userId: userId
        });
        
        // Check if this is a data purchase flow (has network, phone, and data plan in data)
        if (data.network && data.phoneNumber && data.dataPlan) {
          logger.info('Detected data purchase flow from data payload');
          // This is a data purchase flow
          const result = await handleDataPurchaseScreen(data, userId, tokenData, flowToken);
          
          // If data purchase was successful, return empty response to close terminal flow
          if (Object.keys(result).length === 0) {
            logger.info('Data purchase successful, returning empty response to close flow');
            return result;
          }
          
          // If there was an error, return error response
          return result;
        } else if (tokenData.sessionData && tokenData.sessionData.transferData) {
          logger.info('Detected transfer flow from session data', {
            sessionDataKeys: Object.keys(tokenData.sessionData),
            transferDataKeys: Object.keys(tokenData.sessionData.transferData),
            userId: tokenData.sessionData.userId,
            context: tokenData.sessionData.context
          });
          // This is a transfer flow
          const result = await handleTransferPinScreen(data, userId, tokenData, flowToken);
          
          // If transfer was successful, return empty response to close terminal flow
          if (Object.keys(result).length === 0) {
            logger.info('Transfer successful in data_exchange, returning empty response to close flow');
            return result;
          }
          
          // If there was an error, return error response
          return result;
        } else if (data && (data.transfer_amount || data.recipient_name || data.bank_name || data.pin)) {
          logger.info('Detected transfer flow from flow action payload data', {
            dataKeys: Object.keys(data || {}),
            transferAmount: data.transfer_amount,
            recipientName: data.recipient_name,
            bankName: data.bank_name,
            accountNumber: data.account_number,
            bankCode: data.bank_code,
            hasPin: !!data.pin
          });
          
          // If this is just a PIN submission without transfer data, try to get from session
          if (data.pin && !data.transfer_amount && !data.recipient_name) {
            logger.info('PIN submission detected, checking session for transfer data');
            // This is a PIN submission, we need to get transfer data from session
            const result = await handleTransferPinScreen(data, userId, tokenData, flowToken);
            return result;
          }
          
          // This is a transfer flow with data in the payload
          const result = await handleTransferPinScreen(data, userId, tokenData, flowToken);
          
          // If transfer was successful, return empty response to close terminal flow
          if (Object.keys(result).length === 0) {
            logger.info('Transfer successful in data_exchange, returning empty response to close flow');
            return result;
          }
          
          // If there was an error, return error response
          return result;
        } else {
          logger.error('Unable to determine flow type for PIN_VERIFICATION_SCREEN', {
            dataKeys: Object.keys(data || {}),
            sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
            hasTransferData: !!(tokenData.sessionData && tokenData.sessionData.transferData),
            hasTransferPayload: !!(data && (data.transfer_amount || data.recipient_name || data.bank_name)),
            sessionData: tokenData.sessionData,
            flowToken: flowToken,
            tokenDataKeys: Object.keys(tokenData || {})
          });
          
          // Try to extract transfer data from any available source as fallback
          if (data && (data.transfer_amount || data.recipient_name || data.bank_name)) {
            logger.info('Attempting fallback transfer processing with available data');
            const result = await handleTransferPinScreen(data, userId, tokenData, flowToken);
            return result;
          }
          
          return {
            screen: 'PIN_VERIFICATION_SCREEN',
            data: {
              error: 'Unable to determine transaction type. Please try again.',
              error_message: 'Flow context not found'
            }
          };
        }

      default:
        logger.warn('Unknown Flow screen', { screen });
        return {
          screen: 'ERROR_SCREEN',
          data: {
            error: 'Unknown screen',
            code: 'UNKNOWN_SCREEN'
          }
        };
    }

  } catch (error) {
    logger.error('Data exchange processing failed', { error: error.message });
    return {
      screen: 'ERROR_SCREEN',
      data: {
        error: 'Processing failed',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle personal details screen
 */
async function handlePersonalDetailsScreen(data, userId, tokenData = {}) {
  try {
    // Extract personal details
    const firstName = data.screen_1_First_Name_0;
    const lastName = data.screen_1_Last_Name_1;
    const middleName = data.screen_1_Middle_Name_2;
    const address = data.screen_1_Address_3;
    const gender = data.screen_1_Gender_4;
    const dateOfBirth = data.screen_1_Date_of_Birth__5;
    const phoneNumber = data.phoneNumber || null;

    // Validate required fields
    if (!firstName || !lastName || !address || !gender || !dateOfBirth) {
      return {
        screen: 'screen_poawge',
        data: {
          error: 'Please fill in all required fields',
          validation: {
            firstName: !firstName ? 'First name is required' : null,
            lastName: !lastName ? 'Last name is required' : null,
            address: !address ? 'Address is required' : null,
            gender: !gender ? 'Gender is required' : null,
            dateOfBirth: !dateOfBirth ? 'Date of birth is required' : null
          }
        }
      };
    }

    // Parse gender
    let parsedGender = 'other';
    if (gender.toLowerCase().includes('male')) {
      parsedGender = gender.toLowerCase().includes('female') ? 'female' : 'male';
    }

    // Parse date
    let parsedDate = null;
    if (dateOfBirth) {
      const parts = dateOfBirth.split('/');
      if (parts.length === 3) {
        parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    // Persist to user record if possible
    try {
      if (userId) {
        const userService = require('../services/user');
        const user = await userService.getUserById(userId);
        if (user) {
          await user.update({
            firstName,
            lastName,
            middleName: middleName || null,
            address,
            gender: parsedGender === 'female' ? 'female' : 'male',
            dateOfBirth: parsedDate
          });
        }
      } else if (phoneNumber) {
        const userService = require('../services/user');
        const user = await userService.getUserByWhatsappNumber(phoneNumber);
        if (user) {
          await user.update({
            firstName,
            lastName,
            middleName: middleName || null,
            address,
            gender: parsedGender === 'female' ? 'female' : 'male',
            dateOfBirth: parsedDate
          });
        }
      }
    } catch (persistErr) {
      logger.warn('Failed to persist personal details from flow', { error: persistErr.message });
    }

    logger.info('Personal details received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      firstName,
      lastName,
      gender: parsedGender,
      address,
      dateOfBirth: parsedDate
    });

    // Return next screen
    return {
      screen: 'screen_kswuhq',
      data: {
        success: true,
        message: 'Personal details saved successfully'
      }
    };

  } catch (error) {
    logger.error('Personal details processing failed', { error: error.message });
    return {
      screen: 'screen_poawge',
      data: {
        error: 'Failed to save personal details. Please try again.',
        code: 'SAVE_ERROR'
      }
    };
  }
}

/**
 * Handle BVN verification screen
 */
async function handleBvnVerificationScreen(data, userId, tokenData = {}) {
  try {
    const bvn = data.screen_2_BVN_0;

    // Validate BVN format
    if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
      return {
        screen: 'screen_kswuhq',
        data: {
          error: 'BVN must be exactly 11 digits. Please check and try again.',
          validation: {
            bvn: 'Invalid BVN format'
          }
        }
      };
    }

    // Persist BVN to user if we can resolve the user
    try {
      if (userId) {
        const userService = require('../services/user');
        const user = await userService.getUserById(userId);
        if (user) {
          await user.update({ bvn });
        }
      }
    } catch (persistErr) {
      logger.warn('Failed to persist BVN from flow', { error: persistErr.message });
    }

    logger.info('BVN verification received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      bvn: bvn.substring(0, 3) + '********'
    });

    return {
      screen: 'screen_wkunnj',
      data: {
        success: true,
        message: 'BVN verified successfully! Please proceed to set up your PIN.'
      }
    };

  } catch (error) {
    logger.error('BVN verification processing failed', { error: error.message });
    return {
      screen: 'screen_kswuhq',
      data: {
        error: 'BVN verification service is temporarily unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE'
      }
    };
  }
}

/**
 * Handle PIN setup screen
 */
async function handlePinSetupScreen(data, userId, tokenData = {}) {
  try {
    const pin = data.screen_3_4Digit_PIN_0;
    const confirmPin = data.screen_3_Confirm_PIN_1;

    // Validate PIN
    if (!pin || !confirmPin) {
      return {
        screen: 'screen_wkunnj',
        data: {
          error: 'Both PIN fields are required.',
          validation: {
            pin: !pin ? 'PIN is required' : null,
            confirmPin: !confirmPin ? 'PIN confirmation is required' : null
          }
        }
      };
    }

    if (pin !== confirmPin) {
      return {
        screen: 'screen_wkunnj',
        data: {
          error: 'PINs do not match. Please try again.',
          validation: {
            confirmPin: 'PINs do not match'
          }
        }
      };
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return {
        screen: 'screen_wkunnj',
        data: {
          error: 'PIN must be exactly 4 digits.',
          validation: {
            pin: 'PIN must be 4 digits'
          }
        }
      };
    }

    // Persist PIN and complete onboarding
    try {
      if (userId) {
        const onboardingService = require('../services/onboarding');
        await onboardingService.completePinSetup(userId, pin);
      }
    } catch (persistErr) {
      logger.warn('Failed to complete onboarding during flow PIN setup', { error: persistErr.message });
    }

    logger.info('PIN setup received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      pinLength: pin.length
    });

    return {
      screen: 'COMPLETION_SCREEN',
      data: {
        success: true,
        message: '🎉 Account setup completed! Welcome to MiiMii! Your account is now ready to use.'
      }
    };

  } catch (error) {
    logger.error('PIN setup processing failed', { error: error.message });
    return {
      screen: 'screen_wkunnj',
      data: {
        error: 'Failed to complete account setup. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle data purchase screen (PIN verification)
 */
async function handleDataPurchaseScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const { network, phoneNumber, dataPlan, pin, confirm } = data;

    // Check if user confirmed the purchase
    if (confirm !== 'yes') {
      return {
        screen: 'CONFIRMATION_SCREEN',
        data: {
          error: 'Purchase was not confirmed. Please try again.',
          message: 'Please confirm the purchase to proceed'
        }
      };
    }

    // Get user
    const userService = require('../services/user');
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate user PIN
    await userService.validateUserPin(userId, pin);

    // Store the PIN and data purchase data for background processing
    const processingData = {
      userId: user.id,
      pin: pin,
      dataPurchaseData: {
      phoneNumber,
      network,
        dataPlan: { id: getBilalPlanId(dataPlan), price: getDataPlanPrice(dataPlan) }
      },
      flowToken: flowToken,
      timestamp: Date.now()
    };
    
    // Store in Redis for background processing (5 minute TTL)
    const redisClient = require('../utils/redis');
    const processingKey = `data_purchase_processing:${user.id}:${Date.now()}`;
    await redisClient.setSession(processingKey, processingData, 300);
    
    logger.info('Data purchase data stored for background processing', {
        userId: user.id,
      processingKey,
      dataPurchaseData: {
        network,
        phoneNumber,
        dataPlan
      }
      });

      // Clean up flow session
      if (flowToken) {
        try {
          await redisClient.deleteSession(`flow:${flowToken}`);
          logger.info('Flow session cleaned up successfully', { flowToken });
        } catch (error) {
          logger.warn('Failed to cleanup flow session', { error: error.message });
        }
      }

    // Process the data purchase in the background
    processDataPurchaseInBackground(processingKey, processingData);
    
    // Return empty response to close terminal flow immediately
    return {};

  } catch (error) {
    logger.error('Data purchase processing failed', { error: error.message });
    return {
      screen: 'PIN_VERIFICATION_SCREEN',
      data: {
        error: `Data purchase failed: ${error.message}`,
        code: 'PURCHASE_ERROR'
      }
    };
  }
}

/**
 * Process data purchase in background after flow closes
 */
async function processDataPurchaseInBackground(processingKey, processingData) {
  try {
    const { userId, pin, dataPurchaseData, flowToken } = processingData;
    
    logger.info('Starting background data purchase processing', {
      userId,
      processingKey,
      dataPurchaseData: {
        network: dataPurchaseData.network,
        phoneNumber: dataPurchaseData.phoneNumber,
        dataPlan: dataPurchaseData.dataPlan.id
      }
    });
    
    // Get user and process data purchase
    const userService = require('../services/user');
    const bilalService = require('../services/bilal');
    const whatsappService = require('../services/whatsapp');
    
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found for background data purchase processing');
    }
    
    // Process the data purchase
    let result;
    try {
      result = await bilalService.purchaseData(user, dataPurchaseData, user.whatsappNumber);
    } catch (error) {
      logger.error('Bilal API call failed', { error: error.message, userId: user.id });
      result = {
        success: false,
        message: `Service temporarily unavailable: ${error.message}`,
        error: error.message
      };
    }
    
    if (result && result.success) {
      logger.info('Background data purchase processed successfully', {
        userId: user.id,
        network: dataPurchaseData.network,
        phoneNumber: dataPurchaseData.phoneNumber,
        dataPlan: dataPurchaseData.dataPlan.id,
        reference: result.data?.['request-id']
      });
      
      // Clear conversation state
      await user.clearConversationState();
      
      // Send success messages via WhatsApp
      const successMessage = `✅ *Data Purchase Successful!*\n\n` +
                            `📱 Network: ${dataPurchaseData.network}\n` +
                            `📞 Phone: ${dataPurchaseData.phoneNumber}\n` +
                            `📦 Plan: ${dataPurchaseData.dataPlan.id}\n` +
                            `💰 Amount: ₦${dataPurchaseData.dataPlan.price.toLocaleString()}\n` +
                            `📋 Reference: ${result.data?.['request-id']}\n` +
                            `📅 Date: ${new Date().toLocaleString('en-GB')}\n\n` +
                            `Your data has been purchased successfully! 🎉`;
      
      await whatsappService.sendTextMessage(user.whatsappNumber, successMessage);
      
      logger.info('Data purchase success message sent via WhatsApp', {
        userId: user.id,
        reference: result.data?.['request-id']
      });
      
    } else {
      logger.error('Background data purchase failed', {
        userId: user.id,
        error: result.message,
        dataPurchaseData
      });
      
      // Send error message via WhatsApp
      let errorMessage = `❌ Data purchase failed: ${result.message || 'Unknown error'}\n\nPlease try again or contact support.`;
      
      // Provide specific guidance for common errors
      if (result.message && result.message.includes('Insufficient balance')) {
        errorMessage = `❌ Insufficient balance!\n\n💰 Required: ₦${dataPurchaseData.dataPlan.price.toLocaleString()}\n💳 Please fund your wallet and try again.`;
      } else if (result.message && result.message.includes('403')) {
        errorMessage = `❌ Service temporarily unavailable!\n\n🔧 Our data service is currently experiencing issues. Please try again later or contact support.`;
      } else if (result.message && result.message.includes('Invalid phone number')) {
        errorMessage = `❌ Invalid phone number!\n\n📞 Please ensure you entered a valid 11-digit Nigerian phone number and try again.`;
      }
      
      await whatsappService.sendTextMessage(user.whatsappNumber, errorMessage);
      
      logger.info('Data purchase error message sent via WhatsApp', {
        userId: user.id,
        error: result.message
      });
    }
    
    // Clean up processing data
    const redisClient = require('../utils/redis');
    await redisClient.deleteSession(processingKey);
    
    logger.info('Background data purchase processing completed', {
      userId,
      processingKey,
      success: result.success
    });
    
  } catch (error) {
    logger.error('Background data purchase processing failed', {
      processingKey,
      error: error.message,
      processingData
    });
    
    // Try to send error message to user
    try {
      const userService = require('../services/user');
      const whatsappService = require('../services/whatsapp');
      
      const user = await userService.getUserById(processingData.userId);
      if (user) {
        await whatsappService.sendTextMessage(user.whatsappNumber, "❌ Data purchase processing failed. Please try again or contact support.");
      }
    } catch (sendError) {
      logger.error('Failed to send error message to user', { error: sendError.message });
    }
    
    // Clean up processing data
    try {
      const redisClient = require('../utils/redis');
      await redisClient.deleteSession(processingKey);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup processing data on error', { error: cleanupError.message });
    }
  }
}

/**
 * Get data plan price from plan ID
 */
// Complete data plans database with all 125+ plans
const DATA_PLANS = {
  MTN: [
    { id: 1, title: "500MB - ₦380 (30 days)", price: 380, validity: "30 days", type: "SME" },
    { id: 2, title: "1GB - ₦620 (30 days)", price: 620, validity: "30 days", type: "SME" },
    { id: 3, title: "2GB - ₦1,240 (Monthly)", price: 1240, validity: "Monthly", type: "SME" },
    { id: 4, title: "3GB - ₦2,200 (30 days)", price: 2200, validity: "30 days", type: "SME" },
    { id: 5, title: "5GB - ₦4,500 (30 days)", price: 4500, validity: "30 days", type: "SME" },
    { id: 6, title: "10GB - ₦9,000 (30 days)", price: 9000, validity: "30 days", type: "SME" },
    { id: 36, title: "6GB - ₦2,450 (7 days)", price: 2450, validity: "7 days", type: "GIFTING" },
    { id: 37, title: "1GB - ₦490 (24 hours + 5 mins call)", price: 490, validity: "24 hours", type: "GIFTING PROMO" },
    { id: 38, title: "1.5GB - ₦588 (2 days)", price: 588, validity: "2 days", type: "GIFTING PROMO" },
    { id: 39, title: "15GB - ₦6,305 (30 days)", price: 6305, validity: "30 days", type: "GIFTING PROMO" },
    { id: 41, title: "10GB - ₦4,365 (30 days)", price: 4365, validity: "30 days", type: "GIFTING" },
    { id: 43, title: "8GB - ₦4,365 (7 days + 25 min call)", price: 4365, validity: "7 days", type: "GIFTING PROMO" },
    { id: 80, title: "1.5GB - ₦970 (7 days + 5 mins call)", price: 970, validity: "7 days", type: "GIFTING PROMO" },
    { id: 81, title: "1GB - ₦781 (Weekly + call time)", price: 781, validity: "Weekly", type: "GIFTING" },
    { id: 82, title: "250GB - ₦53,900 (30 days)", price: 53900, validity: "30 days", type: "GIFTING PROMO" },
    { id: 83, title: "150GB - ₦34,900 (30 days)", price: 34900, validity: "30 days", type: "GIFTING PROMO" },
    { id: 84, title: "75GB - ₦19,600 (30 days)", price: 19600, validity: "30 days", type: "GIFTING" },
    { id: 85, title: "32GB - ₦10,780 (30 days)", price: 10780, validity: "30 days", type: "GIFTING PROMO" },
    { id: 86, title: "35GB - ₦6,860 (Postpaid monthly)", price: 6860, validity: "Monthly", type: "GIFTING PROMO" },
    { id: 87, title: "15GB - ₦6,370 (30 days + call time)", price: 6370, validity: "30 days", type: "GIFTING PROMO" },
    { id: 88, title: "12.5GB - ₦5,390 (11GB + call time)", price: 5390, validity: "Monthly", type: "GIFTING" },
    { id: 91, title: "3.2GB - ₦980 (2 days)", price: 980, validity: "2 days", type: "GIFTING PROMO" },
    { id: 92, title: "2.5GB - ₦735 (Daily plan)", price: 735, validity: "Daily", type: "GIFTING PROMO" },
    { id: 94, title: "1GB - ₦98 (Beta mix bundle max)", price: 98, validity: "Daily", type: "GIFTING PROMO" },
    { id: 96, title: "75MB - ₦74 (Daily)", price: 74, validity: "Daily", type: "GIFTING PROMO" },
    { id: 97, title: "0.5MB - ₦49 (Beta mix mini)", price: 49, validity: "Daily", type: "GIFTING PROMO" },
    { id: 98, title: "200GB - ₦49,000 (60 days)", price: 49000, validity: "60 days", type: "GIFTING PROMO" },
    { id: 100, title: "150GB - ₦39,200 (60 days)", price: 39200, validity: "60 days", type: "GIFTING PROMO" },
    { id: 101, title: "40GB - ₦8,820 (Postpaid 2 monthly)", price: 8820, validity: "2 months", type: "GIFTING PROMO" },
    { id: 102, title: "90GB - ₦24,500 (60 days)", price: 24500, validity: "60 days", type: "GIFTING PROMO" },
    { id: 103, title: "7GB - ₦3,430 (30 days)", price: 3430, validity: "30 days", type: "GIFTING" },
    { id: 104, title: "3.5GB - ₦2,450 (30 days + 2GB night)", price: 2450, validity: "30 days", type: "GIFTING" },
    { id: 108, title: "1.2GB - ₦735 (7 days pulse)", price: 735, validity: "7 days", type: "GIFTING PROMO" },
    { id: 112, title: "11GB - ₦3,430 (7 days)", price: 3430, validity: "7 days", type: "GIFTING" },
    { id: 113, title: "230MB - ₦196 (24 hours)", price: 196, validity: "24 hours", type: "GIFTING PROMO" },
    { id: 114, title: "2GB - ₦1,460 (30 days + call 2m)", price: 1460, validity: "30 days", type: "GIFTING" },
    { id: 115, title: "2.7GB - ₦1,960 (30 days + 2 mins)", price: 1960, validity: "30 days", type: "GIFTING" },
    { id: 116, title: "100MB - ₦98 (24 hours)", price: 98, validity: "24 hours", type: "GIFTING" },
    { id: 117, title: "500MB - ₦490 (7 days)", price: 490, validity: "7 days", type: "GIFTING" },
    { id: 118, title: "1.8GB - ₦1,470 (30 days + 1500 Airtime)", price: 1470, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 120, title: "300MB - ₦1,470 (30 days + 1500 talk time)", price: 1470, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 121, title: "1GB - ₦2,940 (30 days + 15000 talk time)", price: 2940, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 122, title: "500MB - ₦346 (Daily)", price: 346, validity: "Daily", type: "GIFTING" },
    { id: 123, title: "12.5GB - ₦5,390 (30 days)", price: 5390, validity: "30 days", type: "GIFTING" },
    { id: 124, title: "14.5GB - ₦4,900 (30 days)", price: 4900, validity: "30 days", type: "GIFTING" },
    { id: 125, title: "65GB - ₦15,680 (30 days)", price: 15680, validity: "30 days", type: "GIFTING" },
    { id: 127, title: "40MB - ₦50 (1 day + 1 min)", price: 50, validity: "1 day", type: "GIFTING" },
    { id: 128, title: "750MB - ₦442 (2 days social)", price: 442, validity: "2 days", type: "GIFTING" },
    { id: 129, title: "2GB - ₦735 (2 days)", price: 735, validity: "2 days", type: "GIFTING" },
    { id: 130, title: "2.5GB - ₦880 (2 days)", price: 880, validity: "2 days", type: "GIFTING" },
    { id: 131, title: "3.5GB - ₦1,460 (7 days)", price: 1460, validity: "7 days", type: "GIFTING" },
    { id: 132, title: "20GB - ₦5,335 (7 days)", price: 5335, validity: "7 days", type: "GIFTING" },
    { id: 133, title: "6.75GB - ₦2,910 (30 days)", price: 2910, validity: "30 days", type: "GIFTING" },
    { id: 134, title: "16.5GB - ₦6,305 (30 days)", price: 6305, validity: "30 days", type: "GIFTING" },
    { id: 135, title: "24GB - ₦7,275 (30 days)", price: 7275, validity: "30 days", type: "GIFTING" },
    { id: 136, title: "29GB - ₦8,730 (30 days)", price: 8730, validity: "30 days", type: "GIFTING" },
    { id: 137, title: "36GB - ₦10,670 (30 days)", price: 10670, validity: "30 days", type: "GIFTING" },
    { id: 138, title: "165GB - ₦33,950 (30 days)", price: 33950, validity: "30 days", type: "GIFTING" },
    { id: 139, title: "250GB - ₦53,350 (30 days)", price: 53350, validity: "30 days", type: "GIFTING" },
    { id: 140, title: "480GB - ₦87,300 (90 days)", price: 87300, validity: "90 days", type: "GIFTING" },
    { id: 141, title: "800GB - ₦121,250 (1 year)", price: 121250, validity: "1 year", type: "GIFTING" },
    { id: 149, title: "470MB - ₦196 (Weekly all social)", price: 196, validity: "Weekly", type: "GIFTING PROMO" }
  ],
  
  AIRTEL: [
    { id: 7, title: "500MB - ₦493 (7 days)", price: 493, validity: "7 days", type: "SME" },
    { id: 8, title: "1GB - ₦784 (7 days)", price: 784, validity: "7 days", type: "SME" },
    { id: 9, title: "2GB - ₦1,500 (30 days)", price: 1500, validity: "30 days", type: "SME" },
    { id: 10, title: "4GB - ₦2,525 (30 days)", price: 2525, validity: "30 days", type: "SME" },
    { id: 26, title: "10GB - ₦4,000 (30 days)", price: 4000, validity: "30 days", type: "SME" },
    { id: 44, title: "300MB - ₦300 (30 days)", price: 300, validity: "30 days", type: "SME" },
    { id: 45, title: "100MB - ₦100 (30 days)", price: 100, validity: "30 days", type: "SME" },
    { id: 53, title: "500MB - ₦425 (30 days)", price: 425, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 54, title: "1GB - ₦850 (30 days)", price: 850, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 55, title: "2GB - ₦1,700 (30 days)", price: 1700, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 56, title: "5GB - ₦4,250 (30 days)", price: 4250, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 57, title: "10GB - ₦8,500 (30 days)", price: 8500, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 58, title: "11GB - ₦4,000 (30 days)", price: 4000, validity: "30 days", type: "GIFTING" },
    { id: 69, title: "1GB - ₦320 (2 days)", price: 320, validity: "2 days", type: "GIFTING PROMO" },
    { id: 72, title: "7GB - ₦2,065 (7 days)", price: 2065, validity: "7 days", type: "GIFTING PROMO" },
    { id: 73, title: "10GB - ₦3,070 (30 days)", price: 3070, validity: "30 days", type: "GIFTING PROMO" },
    { id: 74, title: "25GB - ₦8,000 (30 days)", price: 8000, validity: "30 days", type: "SME" },
    { id: 75, title: "18GB - ₦6,000 (7 days)", price: 6000, validity: "7 days", type: "SME" },
    { id: 106, title: "600MB - ₦230 (2 days)", price: 230, validity: "2 days", type: "GIFTING PROMO" },
    { id: 107, title: "1GB - ₦320 (3 days)", price: 320, validity: "3 days", type: "GIFTING PROMO" },
    { id: 126, title: "1TB - ₦196,000 (1 year)", price: 196000, validity: "1 year", type: "SME" },
    { id: 142, title: "100MB - ₦100 (1 day)", price: 100, validity: "1 day", type: "GIFTING PROMO" },
    { id: 143, title: "100GB - ₦20,000 (30 days mifi)", price: 20000, validity: "30 days", type: "GIFTING PROMO" },
    { id: 144, title: "250MB - ₦50 (1 day night Bundle)", price: 50, validity: "1 day", type: "GIFTING PROMO" },
    { id: 145, title: "35GB - ₦10,000 (30 days)", price: 10000, validity: "30 days", type: "GIFTING" },
    { id: 146, title: "60GB - ₦15,000 (30 days)", price: 15000, validity: "30 days", type: "GIFTING" },
    { id: 147, title: "100GB - ₦20,000 (30 days)", price: 20000, validity: "30 days", type: "GIFTING" },
    { id: 148, title: "160GB - ₦30,000 (30 days)", price: 30000, validity: "30 days", type: "GIFTING" }
  ],
  
  GLO: [
    { id: 11, title: "1.5GB - ₦460 (30 days)", price: 460, validity: "30 days", type: "GIFTING" },
    { id: 12, title: "2.9GB - ₦940 (30 days)", price: 940, validity: "30 days", type: "GIFTING" },
    { id: 13, title: "4.1GB - ₦1,290 (30 days)", price: 1290, validity: "30 days", type: "GIFTING" },
    { id: 14, title: "5.8GB - ₦1,850 (30 days)", price: 1850, validity: "30 days", type: "GIFTING" },
    { id: 15, title: "10GB - ₦3,030 (30 days)", price: 3030, validity: "30 days", type: "GIFTING" },
    { id: 29, title: "200MB - ₦110 (30 days)", price: 110, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 30, title: "500MB - ₦200 (30 days)", price: 200, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 31, title: "1GB - ₦400 (30 days)", price: 400, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 32, title: "2GB - ₦800 (30 days)", price: 800, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 33, title: "3GB - ₦1,215 (30 days)", price: 1215, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 34, title: "5GB - ₦2,025 (30 days)", price: 2025, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 35, title: "10GB - ₦4,050 (30 days)", price: 4050, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 76, title: "1GB - ₦200 (24 hours)", price: 200, validity: "24 hours", type: "GIFTING PROMO" },
    { id: 77, title: "2GB - ₦300 (24 hours)", price: 300, validity: "24 hours", type: "GIFTING PROMO" },
    { id: 78, title: "3.5GB - ₦500 (2 days)", price: 500, validity: "2 days", type: "GIFTING PROMO" },
    { id: 79, title: "15GB - ₦1,950 (7 days)", price: 1950, validity: "7 days", type: "GIFTING PROMO" },
    { id: 150, title: "500MB - ₦190 (14 days)", price: 190, validity: "14 days", type: "SME" },
    { id: 151, title: "1GB - ₦300 (14 days)", price: 300, validity: "14 days", type: "SME" },
    { id: 152, title: "1GB - ₦260 (3 days)", price: 260, validity: "3 days", type: "SME" },
    { id: 153, title: "1GB - ₦280 (7 days)", price: 280, validity: "7 days", type: "SME" },
    { id: 154, title: "3GB - ₦730 (3 days)", price: 730, validity: "3 days", type: "SME" },
    { id: 155, title: "3GB - ₦850 (7 days)", price: 850, validity: "7 days", type: "SME" },
    { id: 156, title: "3GB - ₦1,000 (14 days)", price: 1000, validity: "14 days", type: "SME" },
    { id: 157, title: "5GB - ₦1,240 (3 days)", price: 1240, validity: "3 days", type: "SME" },
    { id: 158, title: "5GB - ₦1,440 (7 days)", price: 1440, validity: "7 days", type: "SME" },
    { id: 159, title: "5GB - ₦1,480 (14 days)", price: 1480, validity: "14 days", type: "SME" },
    { id: 160, title: "10GB - ₦2,950 (14 days)", price: 2950, validity: "14 days", type: "SME" }
  ],
  
  "9MOBILE": [
    { id: 25, title: "1.1GB - ₦400 (30 days)", price: 400, validity: "30 days", type: "SME" },
    { id: 27, title: "1.5GB - ₦880 (30 days)", price: 880, validity: "30 days", type: "GIFTING" },
    { id: 28, title: "500MB - ₦450 (30 days)", price: 450, validity: "30 days", type: "GIFTING" },
    { id: 46, title: "500MB - ₦180 (30 days)", price: 180, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 47, title: "1GB - ₦360 (30 days)", price: 360, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 48, title: "2GB - ₦720 (30 days)", price: 720, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 49, title: "3GB - ₦1,080 (30 days)", price: 1080, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 50, title: "4GB - ₦1,440 (30 days)", price: 1440, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 51, title: "5GB - ₦1,375 (30 days)", price: 1375, validity: "30 days", type: "COOPERATE GIFTING" },
    { id: 52, title: "10GB - ₦2,750 (30 days)", price: 2750, validity: "30 days", type: "COOPERATE GIFTING" }
  ]
};

function getDataPlanPrice(planId) {
  // Search through all networks to find the plan
  for (const network of Object.values(DATA_PLANS)) {
    const plan = network.find(p => p.id.toString() === planId.toString());
    if (plan) {
      return plan.price;
    }
  }
  return 1000; // Default fallback
}

function getBilalPlanId(planId) {
  // If planId is already numeric, return it directly
  if (/^\d+$/.test(planId)) {
    return parseInt(planId);
  }
  
  // Map legacy plan IDs to Bilal API plan IDs
  const planMapping = {
    '100MB-100': 1,  // Map to 500MB plan
    '500MB-200': 1,  // 500MB
    '1GB-300': 2,    // 1GB
    '2GB-500': 3,    // 2GB
    '1GB-500': 2,    // 1GB
    '2GB-1000': 3,   // 2GB
    '3GB-1500': 4,   // 3GB
    '5GB-2500': 5    // 5GB
  };
  return planMapping[planId] || 1; // Default to plan 1 (500MB)
}

function getDataPlansForNetwork(network) {
  return DATA_PLANS[network] || [];
}

/**
 * Handle login screen (PIN input)
 */
async function handleLoginScreen(data, userId, tokenData = {}) {
  try {
    const pin = data.pin;

    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
      return {
        screen: 'PIN_INPUT_SCREEN',
        data: {
          error: 'Please enter exactly 4 digits for your PIN.',
          validation: {
            pin: 'PIN must be exactly 4 digits'
          }
        }
      };
    }

    // For WhatsApp Flow, we need to get the phone number from the flow context
    // Since we don't have direct access to the phone number in the flow data,
    // we'll need to handle this in the flow processing service
    logger.info('Login PIN received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      pinLength: pin.length
    });

    // Return success response for the flow
    // The actual PIN validation will be handled by the flow processing service
    return {
      screen: 'COMPLETION_SCREEN',
      data: {
        success: true,
        message: 'Login successful! Welcome back to MiiMii!'
      }
    };

  } catch (error) {
    logger.error('Login screen processing failed', { error: error.message });
    return {
      screen: 'PIN_INPUT_SCREEN',
      data: {
        error: 'Login failed. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle transfer PIN verification screen
 */
async function handleTransferPinScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const pin = data.pin;

    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
                             return {
           screen: 'PIN_VERIFICATION_SCREEN',
           data: {
             error: 'Please enter exactly 4 digits for your PIN.',
             validation: {
               pin: 'PIN must be exactly 4 digits'
             },
             retry: true
           }
         };
    }

    logger.info('Transfer PIN received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      pinLength: pin.length,
      hasPin: !!pin,
      hasSessionData: !!tokenData.sessionData,
      sessionDataKeys: tokenData.sessionData ? Object.keys(tokenData.sessionData) : [],
      dataKeys: Object.keys(data || {}),
      flowToken: flowToken
    });

    // Get the user from the flow token or phone number
    const userService = require('../services/user');
    
    let user = null;
    
    // Try to get user from token data if available
    if (tokenData.userId) {
      user = await userService.getUserById(tokenData.userId);
    }
    
    // If no user found, try to get from phone number in token data
    if (!user && tokenData.phoneNumber) {
      user = await userService.getUserByPhoneNumber(tokenData.phoneNumber);
    }
    
    if (!user) {
      logger.error('No user found for transfer PIN verification', {
        tokenData,
        hasUserId: !!tokenData.userId,
        hasPhoneNumber: !!tokenData.phoneNumber
      });
      
      return {
        screen: 'PIN_VERIFICATION_SCREEN',
        data: {
          error: 'User not found. Please try again.',
          error_message: 'Unable to identify user for transfer'
        }
      };
    }
    
    // Get the transfer data from session data or flow action payload
    let transferData = null;
    
    // First try to get from session data (preferred for flows)
    if (tokenData.sessionData && tokenData.sessionData.transferData) {
      transferData = tokenData.sessionData.transferData;
      logger.info('Using transfer data from session', {
        userId: user.id,
        hasSessionData: !!tokenData.sessionData,
        dataKeys: Object.keys(transferData || {})
      });
    } else {
        // Try to get transfer data from flow action payload if available
        if (data && (data.transfer_amount || data.recipient_name || data.bank_name)) {
          transferData = {
            amount: parseFloat(data.transfer_amount) || 0,
            recipientName: data.recipient_name || 'Recipient',
            bankName: data.bank_name || 'Unknown Bank',
            accountNumber: data.account_number || '',
            bankCode: data.bank_code || '',
            narration: 'Wallet transfer',
            reference: `TXN${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`
          };
          
          logger.info('Using transfer data from flow action payload', {
            userId: user.id,
            transferData,
            dataKeys: Object.keys(data || {}),
            transferAmount: data.transfer_amount,
            recipientName: data.recipient_name,
            bankName: data.bank_name,
            accountNumber: data.account_number,
            bankCode: data.bank_code
          });
        } else {
          // Try to get from user's conversation state as last resort
          try {
            const userService = require('../services/user');
            const currentUser = await userService.getUserById(user.id);
            if (currentUser && currentUser.conversationState && currentUser.conversationState.data) {
              transferData = {
                amount: currentUser.conversationState.data.amount || 0,
                recipientName: currentUser.conversationState.data.recipientName || 'Recipient',
                bankName: currentUser.conversationState.data.bankName || 'Unknown Bank',
                accountNumber: currentUser.conversationState.data.accountNumber || '',
                bankCode: currentUser.conversationState.data.bankCode || '',
                narration: 'Wallet transfer',
                reference: currentUser.conversationState.data.reference || `TXN${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`
              };
              
              logger.info('Using transfer data from user conversation state', {
                userId: user.id,
                transferData,
                conversationStateKeys: Object.keys(currentUser.conversationState || {})
              });
            } else {
              return {
                screen: 'PIN_VERIFICATION_SCREEN',
                data: {
                  error: 'Transfer session expired. Please try again.',
                  error_message: 'Transfer context not found'
                }
              };
            }
          } catch (error) {
            logger.error('Error getting transfer data from conversation state', { error: error.message, userId: user.id });
            return {
              screen: 'PIN_VERIFICATION_SCREEN',
              data: {
                error: 'Transfer session expired. Please try again.',
                error_message: 'Transfer context not found'
              }
            };
          }
        }
      }
    
    if (!transferData || !transferData.accountNumber || !transferData.bankCode || !transferData.amount) {
      logger.error('Missing transfer data for PIN verification', {
        userId: user.id,
        hasData: !!transferData,
        dataKeys: transferData ? Object.keys(transferData) : []
      });
      
                                 return {
           screen: 'PIN_VERIFICATION_SCREEN',
           data: {
             error: 'Transfer details not found. Please try again.',
             error_message: 'Missing transfer information'
           }
         };
    }
    
    // Store the PIN and transfer data for background processing
    const processingData = {
      userId: user.id,
      pin: pin,
      transferData: transferData,
      flowToken: flowToken,
      timestamp: Date.now()
    };
    
    // Store in Redis for background processing (5 minute TTL)
    const redisClient = require('../utils/redis');
    const processingKey = `transfer_processing:${user.id}:${Date.now()}`;
    await redisClient.setSession(processingKey, processingData, 300);
    
    logger.info('Transfer data stored for background processing', {
          userId: user.id,
      processingKey,
      transferData: {
        amount: transferData.amount,
        recipientName: transferData.recipientName,
        accountNumber: transferData.accountNumber
      }
    });
    
    // Clean up flow session
        if (flowToken) {
          try {
            await redisClient.deleteSession(flowToken);
            logger.info('Flow session cleaned up successfully', { flowToken });
          } catch (error) {
            logger.warn('Failed to cleanup flow session', { error: error.message });
          }
        }
        
    // Return empty response to close terminal flow immediately
        const successResponse = {};
        
        logger.info('Returning empty response to close terminal flow', {
          userId: user.id,
          transferData: {
            amount: transferData.amount,
        recipientName: transferData.recipientName
      }
    });
    
    // Process the transfer in the background (fire and forget)
    setImmediate(() => {
      processTransferInBackground(processingKey, processingData).catch(error => {
        logger.error('Background transfer processing failed', {
          userId: user.id,
          processingKey,
          error: error.message
        });
      });
    });
    
    logger.info('Background transfer processing initiated', {
      userId: user.id,
      processingKey
    });
        
    return successResponse;

          } catch (error) {
    logger.error('Transfer PIN screen processing failed', { error: error.message });
        
        return {
          screen: 'PIN_VERIFICATION_SCREEN',
          data: {
        error: 'PIN verification failed. Please try again.',
        error_message: error.message,
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Process transfer in background after flow closes
 */
async function processTransferInBackground(processingKey, processingData) {
  try {
    const { userId, pin, transferData, flowToken } = processingData;
    
    logger.info('Starting background transfer processing', {
      userId,
      processingKey,
      transferData: {
        amount: transferData.amount,
        recipientName: transferData.recipientName,
        accountNumber: transferData.accountNumber
      }
    });
    
    // Get user and process transfer
    const userService = require('../services/user');
    const bankTransferService = require('../services/bankTransfer');
    const whatsappService = require('../services/whatsapp');
    
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new Error('User not found for background transfer processing');
    }
    
    // Process the bank transfer
    const result = await bankTransferService.processBankTransfer(user.id, transferData, pin);
    
    if (result.success) {
      logger.info('Background transfer processed successfully', {
        userId: user.id,
        reference: result.transaction?.reference,
        amount: transferData.amount
      });
      
      // Clear conversation state
      await user.clearConversationState();
      
      // Send success messages via WhatsApp
      const receiptMessage = `✅ *Transfer Receipt*\n\n` +
                            `💰 Amount: ₦${transferData.amount.toLocaleString()}\n` +
                            `💸 Fee: ₦25\n` +
                            `👤 To: ${transferData.recipientName}\n` +
                            `🏦 Bank: ${transferData.bankName}\n` +
                            `📱 Account: ${transferData.accountNumber}\n` +
                            `📋 Reference: ${result.transaction?.reference}\n` +
                            `📅 Date: ${new Date().toLocaleString('en-GB')}\n` +
                            `✅ Status: Successful\n\n` +
                            `Your transfer has been processed! 🎉`;
      
      const successMessage = `🎉 *Transfer Completed Successfully!*\n\n` +
                            `Your transfer of ₦${transferData.amount.toLocaleString()} to ${transferData.recipientName} has been processed.\n\n` +
                            `📋 Reference: ${result.transaction?.reference}\n` +
                            `📅 Date: ${new Date().toLocaleString('en-GB')}\n\n` +
                            `Thank you for using MiiMii! 🎉`;
      
      await whatsappService.sendTextMessage(user.whatsappNumber, receiptMessage);
      await whatsappService.sendTextMessage(user.whatsappNumber, successMessage);
      
      logger.info('Transfer success messages sent via WhatsApp', {
        userId: user.id,
        reference: result.transaction?.reference
      });
      
    } else {
      logger.error('Background transfer failed', {
        userId: user.id,
        error: result.message,
        transferData
      });
      
      // Send error message via WhatsApp
      const errorMessage = `❌ Transfer failed: ${result.message || 'Unknown error'}\n\nPlease try again or contact support.`;
      await whatsappService.sendTextMessage(user.whatsappNumber, errorMessage);
      
      logger.info('Transfer error message sent via WhatsApp', {
        userId: user.id,
        error: result.message
      });
    }
    
    // Clean up processing data
    const redisClient = require('../utils/redis');
    await redisClient.deleteSession(processingKey);
    
    logger.info('Background transfer processing completed', {
      userId,
      processingKey,
      success: result.success
    });
    
  } catch (error) {
    logger.error('Background transfer processing failed', {
      processingKey,
      error: error.message,
      processingData
    });
    
    // Try to send error message to user
    try {
      const userService = require('../services/user');
      const whatsappService = require('../services/whatsapp');
      
      const user = await userService.getUserById(processingData.userId);
      if (user) {
        await whatsappService.sendTextMessage(user.whatsappNumber, "❌ Transfer processing failed. Please try again or contact support.");
      }
    } catch (sendError) {
      logger.error('Failed to send error message to user', { error: sendError.message });
    }
    
    // Clean up processing data
    try {
      const redisClient = require('../utils/redis');
      await redisClient.deleteSession(processingKey);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup processing data on error', { error: cleanupError.message });
    }
  }
}

/**
 * Handle network selection screen
 */
async function handleNetworkSelectionScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const { network } = data;

    // Validate network selection
    if (!network || !['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(network)) {
      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          error: 'Please select a valid network.',
          message: 'Please choose MTN, Airtel, Glo, or 9mobile'
        }
      };
    }

    logger.info('Network selection received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      network
    });

    // Store network selection in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        await redisClient.setSession(flowToken, { network }, 300);
        logger.info('Network selection stored in session', { flowToken, network });
      } catch (error) {
        logger.warn('Failed to store network selection in session', { error: error.message });
      }
    }

    return {
      screen: 'PHONE_INPUT_SCREEN',
      data: {
        success: true,
        message: 'Network selected successfully',
        network: network
      }
    };

  } catch (error) {
    logger.error('Network selection processing failed', { error: error.message });
    return {
      screen: 'NETWORK_SELECTION_SCREEN',
      data: {
        error: 'Network selection failed. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle phone input screen
 */
async function handlePhoneInputScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const { network, phoneNumber } = data;

    // Validate network
    if (!network || !['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(network)) {
      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          error: 'Invalid network. Please select a network first.',
          message: 'Please choose MTN, Airtel, Glo, or 9mobile'
        }
      };
    }

    // Validate phone number format
    if (!phoneNumber || !/^0[789][01][0-9]{8}$/.test(phoneNumber)) {
      return {
        screen: 'PHONE_INPUT_SCREEN',
        data: {
          error: 'Please enter a valid 11-digit Nigerian phone number.',
          message: 'Phone number must start with 070, 071, 080, 081, 090, or 091'
        }
      };
    }

    logger.info('Phone number received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      network,
      phoneNumber: phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7)
    });

    // Store phone number in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionData = { network, phoneNumber };
        await redisClient.setSession(flowToken, sessionData, 300);
        logger.info('Phone number stored in session', { flowToken, network });
      } catch (error) {
        logger.warn('Failed to store phone number in session', { error: error.message });
      }
    }

    return {
      screen: 'DATA_PLAN_SELECTION_SCREEN',
      data: {
        success: true,
        message: 'Phone number entered successfully',
        network: network,
        phoneNumber: phoneNumber
      }
    };

  } catch (error) {
    logger.error('Phone input processing failed', { error: error.message });
    return {
      screen: 'PHONE_INPUT_SCREEN',
      data: {
        error: 'Phone number processing failed. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle data plan selection screen
 */
async function handleDataPlanSelectionScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const { network, phoneNumber, dataPlan } = data;

    // Validate network and phone number
    if (!network || !['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(network)) {
      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          error: 'Invalid network. Please select a network first.',
          message: 'Please choose MTN, Airtel, Glo, or 9mobile'
        }
      };
    }

    if (!phoneNumber || !/^0[789][01][0-9]{8}$/.test(phoneNumber)) {
      return {
        screen: 'PHONE_INPUT_SCREEN',
        data: {
          error: 'Invalid phone number. Please enter a valid 11-digit Nigerian phone number.',
          message: 'Phone number must start with 070, 071, 080, 081, 090, or 091'
        }
      };
    }

    // If no data plan selected yet, return the available plans for the network
    if (!dataPlan) {
      const availablePlans = getDataPlansForNetwork(network);
      
      logger.info('Returning data plans for network', {
        userId: userId || 'unknown',
        network,
        planCount: availablePlans.length
      });

      return {
        screen: 'DATA_PLAN_SELECTION_SCREEN',
        data: {
          dataPlans: availablePlans.map(plan => ({
            id: plan.id.toString(),
            title: plan.title
          }))
        }
      };
    }

    // Validate data plan
    const availablePlans = getDataPlansForNetwork(network);
    const selectedPlan = availablePlans.find(plan => plan.id.toString() === dataPlan.toString());
    
    if (!selectedPlan) {
      return {
        screen: 'DATA_PLAN_SELECTION_SCREEN',
        data: {
          error: 'Invalid data plan selected. Please choose a valid plan.',
          message: 'Please select a plan from the list'
        }
      };
    }

    logger.info('Data plan selection received from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      network,
      phoneNumber: phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7),
      dataPlan: selectedPlan.id,
      planTitle: selectedPlan.title,
      planPrice: selectedPlan.price
    });

    // Store data plan selection in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionData = { network, phoneNumber, dataPlan: selectedPlan.id };
        await redisClient.setSession(flowToken, sessionData, 300);
        logger.info('Data plan selection stored in session', { flowToken, network, dataPlan: selectedPlan.id });
      } catch (error) {
        logger.warn('Failed to store data plan selection in session', { error: error.message });
      }
    }

    return {
      screen: 'CONFIRMATION_SCREEN',
      data: {
        success: true,
        message: 'Data plan selected successfully',
        network,
        phoneNumber,
        dataPlan: selectedPlan.title,
        price: selectedPlan.price,
        planId: selectedPlan.id
      }
    };

  } catch (error) {
    logger.error('Data plan selection processing failed', { error: error.message });
    return {
      screen: 'DATA_PLAN_SELECTION_SCREEN',
      data: {
        error: 'Data plan selection failed. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

/**
 * Handle confirmation screen
 */
async function handleConfirmationScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const { network, phoneNumber, dataPlan, confirm } = data;

    // Validate all required fields
    if (!network || !['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(network)) {
      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          error: 'Invalid network. Please select a network first.',
          message: 'Please choose MTN, Airtel, Glo, or 9mobile'
        }
      };
    }

    if (!phoneNumber || !/^0[789][01][0-9]{8}$/.test(phoneNumber)) {
      return {
        screen: 'PHONE_INPUT_SCREEN',
        data: {
          error: 'Invalid phone number. Please enter a valid 11-digit Nigerian phone number.',
          message: 'Phone number must start with 070, 071, 080, 081, 090, or 091'
        }
      };
    }

    if (!dataPlan) {
      return {
        screen: 'DATA_PLAN_SELECTION_SCREEN',
        data: {
          error: 'No data plan selected. Please choose a plan.',
          message: 'Please select a data plan'
        }
      };
    }

    // Check if user confirmed the purchase
    if (confirm !== 'yes') {
      logger.info('User cancelled data purchase', {
        userId: userId || 'unknown',
        network,
        phoneNumber: phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7)
      });

      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          reset: true,
          message: 'Purchase cancelled. Please start over.'
        }
      };
    }

    logger.info('Data purchase confirmed from Flow', {
      userId: userId || 'unknown',
      flowId: tokenData.flowId || 'unknown',
      source: tokenData.source || 'unknown',
      network,
      phoneNumber: phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7),
      dataPlan
    });

    // Store confirmation in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionData = { network, phoneNumber, dataPlan, confirm: 'yes' };
        await redisClient.setSession(flowToken, sessionData, 300);
        logger.info('Purchase confirmation stored in session', { flowToken, network, dataPlan });
      } catch (error) {
        logger.warn('Failed to store purchase confirmation in session', { error: error.message });
      }
    }

    return {
      screen: 'PIN_VERIFICATION_SCREEN',
      data: {
        success: true,
        message: 'Purchase confirmed. Please enter your PIN to complete the transaction.'
      }
    };

  } catch (error) {
    logger.error('Confirmation screen processing failed', { error: error.message });
    return {
      screen: 'CONFIRMATION_SCREEN',
      data: {
        error: 'Confirmation failed. Please try again.',
        code: 'PROCESSING_ERROR'
      }
    };
  }
}

module.exports = router;
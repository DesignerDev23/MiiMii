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
      const result = await handleTransferPinScreen(data, tokenData.userId, tokenData, flowToken);
      
      // If transfer was successful, return empty response to close terminal flow
      if (result.data?.success || Object.keys(result).length === 0) {
        logger.info('Transfer successful, returning empty response to close flow');
        return {}; // Empty response closes terminal flow
      }
      
      // If there was an error, return error response
      return result;
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

    // Handle data purchase PIN verification
    if (screen === 'PIN_VERIFICATION_SCREEN' && data.network && data.phoneNumber && data.dataPlan) {
      const result = await handleDataPurchaseScreen(data, tokenData.userId, tokenData, flowToken);
      
      // If data purchase was successful, return completion response
      if (result.data?.success) {
        return {
          screen: 'COMPLETION_SCREEN',
          data: {
            success: true,
            message: 'Data purchase completed successfully!'
          }
        };
      }
      
      // If there was an error, return error response
      return result;
    }

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
        const sessionKey = `flow:${flowToken}`;
        logger.info('Looking up session in Redis', { sessionKey, flowToken });
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
          logger.warn('No session found in Redis', { sessionKey, flowToken });
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
        return handleDataPlanSelectionScreen(data, userId, tokenData, flowToken);

      case 'CONFIRMATION_SCREEN':
        return handleConfirmationScreen(data, userId, tokenData, flowToken);

      case 'PIN_VERIFICATION_SCREEN':
        // Check if this is a data purchase flow or transfer flow
        if (data.network && data.phoneNumber && data.dataPlan) {
          // This is a data purchase flow
          const result = await handleDataPurchaseScreen(data, userId, tokenData, flowToken);
          
          // If data purchase was successful, return empty response to close terminal flow
          if (result.data?.success || Object.keys(result).length === 0) {
            logger.info('Data purchase successful, returning empty response to close flow');
            return {}; // Empty response closes terminal flow
          }
          
          // If there was an error, return error response
          return result;
        } else {
          // This is a transfer flow
          const result = await handleTransferPinScreen(data, userId, tokenData, flowToken);
          
          // If transfer was successful, return empty response to close terminal flow
          if (result.data?.success || Object.keys(result).length === 0) {
            logger.info('Transfer successful in data_exchange, returning empty response to close flow');
            return {}; // Empty response closes terminal flow
          }
          
          // If there was an error, return error response
          return result;
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
          validation: {
            confirm: 'Please confirm the purchase to proceed'
          }
        }
      };
    }

    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
      return {
        screen: 'PIN_VERIFICATION_SCREEN',
        data: {
          error: 'Please enter exactly 4 digits for your PIN.',
          validation: {
            pin: 'PIN must be exactly 4 digits'
          }
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

    // Process data purchase using Bilal service
    const bilalService = require('../services/bilal');
    const dataPurchaseData = {
      phoneNumber,
      network,
      dataPlan: { id: dataPlan, price: getDataPlanPrice(dataPlan) },
      pin
    };

    const result = await bilalService.purchaseData(user, dataPurchaseData, user.whatsappNumber);

    if (result.success) {
      logger.info('Data purchase successful via flow', {
        userId: user.id,
        network,
        phoneNumber,
        dataPlan,
        reference: result.data?.['request-id']
      });

      // Clear conversation state and session
      await user.clearConversationState();

      // Clean up flow session
      if (flowToken) {
        try {
          const redisClient = require('../utils/redis');
          await redisClient.deleteSession(`flow:${flowToken}`);
          logger.info('Flow session cleaned up successfully', { flowToken });
        } catch (error) {
          logger.warn('Failed to cleanup flow session', { error: error.message });
        }
      }

      return {
        data: {
          success: true,
          message: 'Data purchase completed successfully!'
        }
      };
    } else {
      throw new Error(result.message || 'Data purchase failed');
    }

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
 * Get data plan price from plan ID
 */
function getDataPlanPrice(planId) {
  const planPrices = {
    '100MB-100': 100,
    '500MB-200': 200,
    '1GB-300': 300,
    '2GB-500': 500,
    '1GB-500': 500,
    '2GB-1000': 1000,
    '3GB-1500': 1500,
    '5GB-2500': 2500
  };
  return planPrices[planId] || 1000; // Default fallback
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
    
    // Add request deduplication to prevent multiple processing
    const requestId = `${userId}-${flowToken}-${Date.now()}`;
    const redisClient = require('../utils/redis');
    const processingKey = `processing:${requestId}`;
    
    // Check if this request is already being processed
    const isProcessing = await redisClient.getSession(processingKey);
    if (isProcessing) {
      logger.warn('Duplicate transfer PIN request detected, skipping', {
        userId,
        flowToken,
        requestId
      });
              return {
          screen: 'PIN_VERIFICATION_SCREEN',
          data: {
            error: 'Request already being processed. Please wait.',
            error_message: 'Duplicate request detected'
          }
        };
    }
    
    // Mark this request as being processed (5 minute TTL)
    await redisClient.setSession(processingKey, { processing: true, timestamp: Date.now() }, 300);

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
      sessionData: tokenData.sessionData,
      dataKeys: Object.keys(data || {}),
      flowToken: flowToken
    });

    // For WhatsApp Flow, we need to process the transfer here
    // Get the user from the flow token or phone number
    const userService = require('../services/user');
    const bankTransferService = require('../services/bankTransfer');
    
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
    
    // Get the transfer data from session data or user's conversation state
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
      // Fallback to conversation state
      const conversationState = user.conversationState;
      if (!conversationState || conversationState.context !== 'transfer_pin_verification') {
        logger.error('No transfer context found for user', {
          userId: user.id,
          hasConversationState: !!conversationState,
          context: conversationState?.context,
          sessionData: tokenData.sessionData
        });
        
        // Try to get transfer data from flow action payload if available
        if (data && (data.transfer_amount || data.recipient_name)) {
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
            dataKeys: Object.keys(data || {})
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
      } else {
        transferData = conversationState.data;
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
    
    try {
      // Process the bank transfer
      const result = await bankTransferService.processBankTransfer(user.id, transferData, pin);
      
      if (result.success) {
        logger.info('Transfer processed successfully via flow', {
          userId: user.id,
          reference: result.transaction?.reference,
          amount: transferData.amount
        });
        
        // Clear conversation state and session
        await user.clearConversationState();
        
        // Clean up flow session and processing key
        if (flowToken) {
          try {
            const redisClient = require('../utils/redis');
            await redisClient.deleteSession(`flow:${flowToken}`);
            await redisClient.deleteSession(processingKey);
            logger.info('Flow session cleaned up successfully', { flowToken });
          } catch (error) {
            logger.warn('Failed to cleanup flow session', { error: error.message });
          }
        }
        
        // Return empty response to close terminal flow
        const successResponse = {};
        
        logger.info('Returning empty response to close terminal flow', {
          userId: user.id,
          transferData: {
            amount: transferData.amount,
            recipientName: transferData.recipientName,
            reference: result.transaction?.reference
          }
        });
        
        // Add additional logging for debugging
        logger.info('Flow response structure for terminal flow', {
          hasScreen: !!successResponse.screen,
          hasData: !!successResponse.data,
          responseType: 'empty_response_to_close'
        });
        
        return successResponse;
      } else {
        logger.error('Transfer failed via flow', {
          userId: user.id,
          error: result.message,
          transferData
        });
        
              // Clean up flow session and processing key on error
        if (flowToken) {
          try {
            const redisClient = require('../utils/redis');
            await redisClient.deleteSession(`flow:${flowToken}`);
            await redisClient.deleteSession(processingKey);
          } catch (error) {
            logger.warn('Failed to cleanup flow session on error', { error: error.message });
          }
        }
        
        return {
          screen: 'PIN_VERIFICATION_SCREEN',
          data: {
            error: result.message || 'Transfer failed. Please try again.',
            error_message: result.message || 'Transfer processing failed',
            retry: true
          }
        };
      }
    } catch (error) {
      logger.error('Transfer processing failed via flow', {
        userId: user.id,
        error: error.message,
        transferData
      });
      
      // Provide user-friendly error messages
      let errorMessage = "❌ Transfer failed. Try again or contact support";
      
      if (error.message.includes('Insufficient')) {
        errorMessage = error.message;
      } else if (error.message.includes('Failed To Fecth Account Info')) {
        errorMessage = "❌ Account not found. Check the account number and bank name";
      } else if (error.message.includes('could not be found in')) {
        errorMessage = error.message;
      } else if (error.message.includes('Invalid bank account')) {
        errorMessage = "❌ Invalid account details. Check account number and bank name";
      } else if (error.message.includes('Transfer limit')) {
        errorMessage = "❌ Transfer limit exceeded. Try a smaller amount";
      } else if (error.message.includes('PIN')) {
        errorMessage = "❌ Wrong PIN. Check and try again";
      }
      
      // Clean up flow session and processing key on error
      if (flowToken) {
        try {
          const redisClient = require('../utils/redis');
          await redisClient.deleteSession(`flow:${flowToken}`);
          await redisClient.deleteSession(processingKey);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup flow session on error', { error: cleanupError.message });
        }
      }
      
      return {
        screen: 'PIN_VERIFICATION_SCREEN',
        data: {
          error: errorMessage,
          error_message: error.message
        }
      };
    }

  } catch (error) {
    logger.error('Transfer PIN screen processing failed', { error: error.message });
    
    // Clean up processing key on error
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        await redisClient.deleteSession(processingKey);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup processing key on error', { error: cleanupError.message });
      }
    }
    
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
 * Handle network selection screen for data purchase flow
 */
async function handleNetworkSelectionScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const network = data.network;
    
    logger.info('Network selection received', {
      userId,
      network,
      dataKeys: Object.keys(data || {})
    });

    // Validate network selection
    if (!network || !['MTN', 'AIRTEL', 'GLO', '9MOBILE'].includes(network)) {
      return {
        screen: 'NETWORK_SELECTION_SCREEN',
        data: {
          error: 'Please select a valid network.',
          validation: {
            network: 'Network selection is required'
          }
        }
      };
    }

    // Store network selection in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionKey = `flow:${flowToken}`;
        const session = await redisClient.getSession(sessionKey) || {};
        session.network = network;
        await redisClient.setSession(sessionKey, session, 1800); // 30 minutes
        logger.info('Network selection stored in session', { network, flowToken });
      } catch (error) {
        logger.warn('Failed to store network selection in session', { error: error.message });
      }
    }

    // Return success to proceed to next screen
    return {
      data: {
        network: network
      }
    };

  } catch (error) {
    logger.error('Network selection processing failed', { error: error.message });
    return {
      screen: 'NETWORK_SELECTION_SCREEN',
      data: {
        error: 'Network selection failed. Please try again.',
        error_message: error.message
      }
    };
  }
}

/**
 * Handle phone input screen for data purchase flow
 */
async function handlePhoneInputScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const phoneNumber = data.phoneNumber;
    const network = data.network || tokenData.sessionData?.network;
    
    logger.info('Phone input received', {
      userId,
      phoneNumber,
      network,
      dataKeys: Object.keys(data || {})
    });

    // Validate phone number
    if (!phoneNumber || !/^\d{11}$/.test(phoneNumber)) {
      return {
        screen: 'PHONE_INPUT_SCREEN',
        data: {
          error: 'Please enter a valid 11-digit phone number.',
          validation: {
            phoneNumber: 'Phone number must be 11 digits'
          }
        }
      };
    }

    // Store phone number in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionKey = `flow:${flowToken}`;
        const session = await redisClient.getSession(sessionKey) || {};
        session.phoneNumber = phoneNumber;
        if (network) session.network = network;
        await redisClient.setSession(sessionKey, session, 1800); // 30 minutes
        logger.info('Phone number stored in session', { phoneNumber, network, flowToken });
      } catch (error) {
        logger.warn('Failed to store phone number in session', { error: error.message });
      }
    }

    // Return success to proceed to next screen
    return {
      data: {
        network: network,
        phoneNumber: phoneNumber
      }
    };

  } catch (error) {
    logger.error('Phone input processing failed', { error: error.message });
    return {
      screen: 'PHONE_INPUT_SCREEN',
      data: {
        error: 'Phone input failed. Please try again.',
        error_message: error.message
      }
    };
  }
}

/**
 * Handle data plan selection screen for data purchase flow
 */
async function handleDataPlanSelectionScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const dataPlan = data.dataPlan;
    const network = data.network || tokenData.sessionData?.network;
    const phoneNumber = data.phoneNumber || tokenData.sessionData?.phoneNumber;
    
    logger.info('Data plan selection received', {
      userId,
      dataPlan,
      network,
      phoneNumber,
      dataKeys: Object.keys(data || {})
    });

    // Validate data plan selection
    if (!dataPlan) {
      return {
        screen: 'DATA_PLAN_SELECTION_SCREEN',
        data: {
          error: 'Please select a data plan.',
          validation: {
            dataPlan: 'Data plan selection is required'
          }
        }
      };
    }

    // Store data plan in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionKey = `flow:${flowToken}`;
        const session = await redisClient.getSession(sessionKey) || {};
        session.dataPlan = dataPlan;
        if (network) session.network = network;
        if (phoneNumber) session.phoneNumber = phoneNumber;
        await redisClient.setSession(sessionKey, session, 1800); // 30 minutes
        logger.info('Data plan stored in session', { dataPlan, network, phoneNumber, flowToken });
      } catch (error) {
        logger.warn('Failed to store data plan in session', { error: error.message });
      }
    }

    // Return success to proceed to next screen
    return {
      data: {
        network: network,
        phoneNumber: phoneNumber,
        dataPlan: dataPlan
      }
    };

  } catch (error) {
    logger.error('Data plan selection processing failed', { error: error.message });
    return {
      screen: 'DATA_PLAN_SELECTION_SCREEN',
      data: {
        error: 'Data plan selection failed. Please try again.',
        error_message: error.message
      }
    };
  }
}

/**
 * Handle confirmation screen for data purchase flow
 */
async function handleConfirmationScreen(data, userId, tokenData = {}, flowToken = null) {
  try {
    const confirm = data.confirm;
    const network = data.network || tokenData.sessionData?.network;
    const phoneNumber = data.phoneNumber || tokenData.sessionData?.phoneNumber;
    const dataPlan = data.dataPlan || tokenData.sessionData?.dataPlan;
    
    logger.info('Confirmation received', {
      userId,
      confirm,
      network,
      phoneNumber,
      dataPlan,
      dataKeys: Object.keys(data || {})
    });

    // Check if user confirmed
    if (confirm !== 'yes') {
      return {
        screen: 'CONFIRMATION_SCREEN',
        data: {
          error: 'Please confirm to proceed with the purchase.',
          validation: {
            confirm: 'Confirmation is required'
          }
        }
      };
    }

    // Store confirmation in session
    if (flowToken) {
      try {
        const redisClient = require('../utils/redis');
        const sessionKey = `flow:${flowToken}`;
        const session = await redisClient.getSession(sessionKey) || {};
        session.confirm = confirm;
        if (network) session.network = network;
        if (phoneNumber) session.phoneNumber = phoneNumber;
        if (dataPlan) session.dataPlan = dataPlan;
        await redisClient.setSession(sessionKey, session, 1800); // 30 minutes
        logger.info('Confirmation stored in session', { confirm, network, phoneNumber, dataPlan, flowToken });
      } catch (error) {
        logger.warn('Failed to store confirmation in session', { error: error.message });
      }
    }

    // Return success to proceed to next screen
    return {
      data: {
        network: network,
        phoneNumber: phoneNumber,
        dataPlan: dataPlan,
        confirm: confirm
      }
    };

  } catch (error) {
    logger.error('Confirmation processing failed', { error: error.message });
    return {
      screen: 'CONFIRMATION_SCREEN',
      data: {
        error: 'Confirmation failed. Please try again.',
        error_message: error.message
      }
    };
  }
}

module.exports = router;

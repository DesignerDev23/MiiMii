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
      tokenPrefix: flow_token.substring(0, 10) + '...'
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
        return handleDataExchange(screen, data, tokenData);

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
 * Handle data exchange requests
 */
async function handleDataExchange(screen, data, tokenData) {
  try {
    // For WhatsApp Flow tokens, we don't have a userId in the token
    // We'll need to extract user information from the flow data or use a different approach
    const userId = tokenData.userId || 'unknown_user';

    logger.info('Handling data exchange', {
      screen,
      tokenData,
      flowId: tokenData.flowId,
      source: tokenData.source,
      dataKeys: Object.keys(data || {})
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

    // For WhatsApp Flow, we'll use the flow token information
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

    // Store flow data in database (you can implement this based on your needs)
    try {
      // Create or update flow session
      const flowSession = {
        flowId: tokenData.flowId || 'unknown',
        flowToken: tokenData.token,
        screen: 'screen_poawge',
        data: {
          firstName,
          lastName,
          middleName: middleName || null,
          address,
          gender: parsedGender,
          dateOfBirth: parsedDate
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // You can store this in your database here
      // For now, we'll just log it
      logger.info('Flow session data prepared for storage', {
        flowId: flowSession.flowId,
        screen: flowSession.screen,
        hasData: !!flowSession.data
      });
    } catch (storageError) {
      logger.error('Failed to store flow session data', { error: storageError.message });
    }

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

    // For WhatsApp Flow, we'll use the flow token information
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

    // For WhatsApp Flow, we'll use the flow token information
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

module.exports = router;

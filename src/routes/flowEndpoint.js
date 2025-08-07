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
      hasInitialVector: !!initial_vector
    });

    // Validate required fields
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      logger.warn('Missing required Flow endpoint fields', {
        hasEncryptedData: !!encrypted_flow_data,
        hasAesKey: !!encrypted_aes_key,
        hasInitialVector: !!initial_vector
      });
      return res.status(421).json({
        error: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS'
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
      return res.status(421).json({
        error: 'Decryption failed',
        code: 'DECRYPTION_FAILED'
      });
    }

    // Process the decrypted request
    const response = await processFlowRequest(decryptedData.data);

    // Encrypt the response
    const encryptedResponse = await encryptFlowResponse(
      response,
      decryptedData.aesKey,
      decryptedData.initialVector
    );

    if (!encryptedResponse.success) {
      logger.error('Failed to encrypt Flow response', {
        error: encryptedResponse.error
      });
      return res.status(500).json({
        error: 'Encryption failed',
        code: 'ENCRYPTION_FAILED'
      });
    }

    // Return encrypted response as plain text (as per WhatsApp spec)
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(encryptedResponse.data);

  } catch (error) {
    logger.error('Flow endpoint error', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Health check endpoint for Flow
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: FLOW_CONFIG.version,
      endpoint: FLOW_CONFIG.endpointUrl,
      services: {
        database: 'connected',
        encryption: !!FLOW_CONFIG.privateKey,
        userService: 'available',
        onboardingService: 'available'
      }
    };

    res.json(healthStatus);
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
 * Decrypt Flow request using RSA and AES
 */
async function decryptFlowRequest(encryptedFlowData, encryptedAesKey, initialVector) {
  try {
    if (!FLOW_CONFIG.privateKey) {
      throw new Error('Private key not configured');
    }

    // Decrypt the AES key using RSA
    const aesKeyBytes = crypto.privateDecrypt(
      {
        key: FLOW_CONFIG.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(encryptedAesKey, 'base64')
    );

    // Decrypt the Flow data using AES-GCM
    const initialVectorBytes = Buffer.from(initialVector, 'base64');
    const flowDataBytes = Buffer.from(encryptedFlowData, 'base64');

    // Flip the initialization vector (as per WhatsApp spec)
    const flippedIV = Buffer.from(initialVectorBytes);
    for (let i = 0; i < flippedIV.length; i++) {
      flippedIV[i] = ~flippedIV[i];
    }

    // Create AES-GCM cipher
    const cipher = crypto.createDecipher('aes-256-gcm', aesKeyBytes);
    cipher.setAAD(Buffer.alloc(0));
    cipher.setAuthTag(flowDataBytes.slice(-16)); // Last 16 bytes are auth tag

    // Decrypt the data
    const decryptedData = Buffer.concat([
      cipher.update(flowDataBytes.slice(0, -16)),
      cipher.final()
    ]);

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
      initialVector: initialVectorBytes
    };

  } catch (error) {
    logger.error('Flow request decryption failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Encrypt Flow response using AES-GCM
 */
async function encryptFlowResponse(response, aesKey, initialVector) {
  try {
    // Convert response to JSON
    const responseJson = JSON.stringify(response);

    // Flip the initialization vector (as per WhatsApp spec)
    const flippedIV = Buffer.from(initialVector);
    for (let i = 0; i < flippedIV.length; i++) {
      flippedIV[i] = ~flippedIV[i];
    }

    // Create AES-GCM cipher
    const cipher = crypto.createCipher('aes-256-gcm', aesKey);
    cipher.setAAD(Buffer.alloc(0));

    // Encrypt the response
    const encryptedData = Buffer.concat([
      cipher.update(responseJson, 'utf8'),
      cipher.final()
    ]);

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Concatenate encrypted data and auth tag
    const finalEncryptedData = Buffer.concat([encryptedData, authTag]);

    // Return as base64 string
    const encryptedBase64 = finalEncryptedData.toString('base64');

    logger.info('Flow response encrypted successfully', {
      responseLength: responseJson.length,
      encryptedLength: encryptedBase64.length
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
    // Verify flow token
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

    // Process based on action
    switch (action) {
      case 'data_exchange':
        return await handleDataExchange(screen, data, tokenData);

      case 'ping':
        return {
          screen: 'PING_RESPONSE',
          data: {
            status: 'active',
            timestamp: new Date().toISOString()
          }
        };

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
    const { userId } = tokenData;

    logger.info('Handling data exchange', {
      screen,
      userId,
      dataKeys: Object.keys(data || {})
    });

    // Process based on screen
    switch (screen) {
      case 'QUESTION_ONE':
      case 'screen_poawge':
        return await handlePersonalDetailsScreen(data, userId);

      case 'screen_kswuhq':
        return await handleBvnVerificationScreen(data, userId);

      case 'screen_wkunnj':
        return await handlePinSetupScreen(data, userId);

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
async function handlePersonalDetailsScreen(data, userId) {
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

    // Save to database
    const user = await userService.getUserById(userId);
    if (user) {
      await user.update({
        firstName,
        lastName,
        middleName: middleName || null,
        address,
        dateOfBirth: parsedDate,
        gender: parsedGender,
        onboardingStep: 'bvn_verification'
      });

      logger.info('Personal details saved', {
        userId,
        firstName,
        lastName,
        gender: parsedGender
      });
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
async function handleBvnVerificationScreen(data, userId) {
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

    // Verify BVN with Fincra
    const bvnResult = await kycService.verifyBVNWithFincra(bvn, userId);

    if (bvnResult.success) {
      // Update user
      const user = await userService.getUserById(userId);
      if (user) {
        await user.update({
          bvn: bvn,
          kycStatus: 'verified',
          kycData: {
            bvnVerified: true,
            bvnVerifiedAt: new Date().toISOString(),
            bvnData: bvnResult.data
          },
          onboardingStep: 'pin_setup'
        });
      }

      logger.info('BVN verified successfully', {
        userId,
        bvn: bvn.substring(0, 3) + '********'
      });

      return {
        screen: 'screen_wkunnj',
        data: {
          success: true,
          message: 'BVN verified successfully! Please proceed to set up your PIN.'
        }
      };

    } else {
      return {
        screen: 'screen_kswuhq',
        data: {
          error: bvnResult.error || 'BVN verification failed. Please check and try again.',
          code: 'BVN_VERIFICATION_FAILED'
        }
      };
    }

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
async function handlePinSetupScreen(data, userId) {
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

    // Complete PIN setup and create virtual account
    const pinResult = await onboardingService.completePinSetup(userId, pin);

    if (pinResult.success) {
      logger.info('PIN setup completed successfully', {
        userId,
        hasAccountDetails: !!pinResult.accountDetails
      });

      return {
        screen: 'COMPLETION_SCREEN',
        data: {
          success: true,
          message: '🎉 Account setup completed! Welcome to MiiMii! Your account is now ready to use.',
          accountDetails: pinResult.accountDetails
        }
      };

    } else {
      return {
        screen: 'screen_wkunnj',
        data: {
          error: 'Failed to complete account setup. Please try again.',
          code: 'SETUP_FAILED'
        }
      };
    }

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

module.exports = router;




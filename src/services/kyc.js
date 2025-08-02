const axios = require('axios');
const logger = require('../utils/logger');
const userService = require('./user');
const whatsappService = require('./whatsapp');
const { v4: uuidv4 } = require('uuid');

class KYCService {
  constructor() {
    this.baseURL = process.env.DOJAH_API_URL;
    this.appId = process.env.DOJAH_APP_ID;
    this.secretKey = process.env.DOJAH_SECRET_KEY;
  }

  async startKycProcess(user, phoneNumber, kycData, extractedData = null) {
    try {
      const { firstName, lastName, middleName, dateOfBirth, gender, address, bvn } = kycData;
      
      // Update user with KYC data
      await userService.updateUser(user.id, {
        firstName,
        lastName,
        middleName,
        dateOfBirth,
        gender,
        address,
        bvn,
        kycStatus: 'pending',
        kycData: {
          submittedAt: new Date(),
          extractedData,
          verificationSteps: {
            bvnVerification: false,
            phoneVerification: false,
            documentVerification: false
          }
        }
      });

      // Start BVN verification
      const bvnVerification = await this.verifyBvn(bvn, user);
      
      // Start phone verification
      const phoneVerification = await this.verifyPhoneNumber(phoneNumber, user);

      const reference = `KYC_${Date.now()}_${uuidv4().slice(0, 8)}`;

      await whatsappService.sendTextMessage(
        phoneNumber,
        `✅ *KYC Process Started*\n\n` +
        `Reference: ${reference}\n\n` +
        `✅ Personal details recorded\n` +
        `${bvnVerification.verified ? '✅' : '⏳'} BVN verification\n` +
        `${phoneVerification.verified ? '✅' : '⏳'} Phone verification\n` +
        `⏳ Document verification pending\n\n` +
        `Please send a clear photo of your ID card, driver's license, or passport to complete verification.`
      );

      logger.info('KYC process started', {
        userId: user.id,
        reference,
        bvnVerified: bvnVerification.verified,
        phoneVerified: phoneVerification.verified
      });

      return {
        reference,
        kycStatus: 'pending',
        verificationSteps: {
          bvnVerification: bvnVerification.verified,
          phoneVerification: phoneVerification.verified,
          documentVerification: false
        }
      };
    } catch (error) {
      logger.error('Failed to start KYC process', { error: error.message, userId: user.id });
      throw error;
    }
  }

  async verifyBvn(bvn, user) {
    try {
      if (!bvn || bvn.length !== 11) {
        throw new Error('BVN must be 11 digits');
      }

      const payload = {
        bvn: bvn,
        first_name: user.firstName,
        last_name: user.lastName,
        date_of_birth: user.dateOfBirth
      };

      const response = await this.makeRequest('POST', '/kyc/bvn', payload);

      if (response.success && response.data.match) {
        // Update user KYC data
        await userService.updateUser(user.id, {
          kycData: {
            ...user.kycData,
            bvnVerification: {
              verified: true,
              verifiedAt: new Date(),
              details: {
                fullName: response.data.full_name,
                dateOfBirth: response.data.date_of_birth,
                phoneNumber: response.data.phone_number,
                gender: response.data.gender
              }
            }
          }
        });

        logger.info('BVN verification successful', {
          userId: user.id,
          bvn: '***' + bvn.slice(-4)
        });

        return {
          verified: true,
          details: response.data
        };
      } else {
        throw new Error('BVN verification failed - details do not match');
      }
    } catch (error) {
      logger.error('BVN verification failed', { 
        error: error.message, 
        userId: user.id,
        bvn: '***' + bvn.slice(-4)
      });
      
      return {
        verified: false,
        error: error.message
      };
    }
  }

  async verifyPhoneNumber(phoneNumber, user) {
    try {
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      
      const payload = {
        phone_number: cleanNumber
      };

      const response = await this.makeRequest('POST', '/kyc/phone', payload);

      if (response.success) {
        // Update user KYC data
        await userService.updateUser(user.id, {
          kycData: {
            ...user.kycData,
            phoneVerification: {
              verified: true,
              verifiedAt: new Date(),
              details: response.data
            }
          }
        });

        logger.info('Phone verification successful', {
          userId: user.id,
          phoneNumber
        });

        return {
          verified: true,
          details: response.data
        };
      } else {
        throw new Error('Phone verification failed');
      }
    } catch (error) {
      logger.error('Phone verification failed', { 
        error: error.message, 
        userId: user.id,
        phoneNumber
      });
      
      return {
        verified: false,
        error: error.message
      };
    }
  }

  async submitDocuments(user, documentData) {
    try {
      const { documentType, documentNumber } = documentData;
      
      const payload = {
        type: documentType,
        number: documentNumber,
        first_name: user.firstName,
        last_name: user.lastName,
        date_of_birth: user.dateOfBirth
      };

      const response = await this.makeRequest('POST', '/kyc/document', payload);
      const reference = `DOC_${Date.now()}_${uuidv4().slice(0, 8)}`;

      if (response.success && response.data.match) {
        // Update user KYC data
        await userService.updateUser(user.id, {
          kycData: {
            ...user.kycData,
            documentVerification: {
              verified: true,
              verifiedAt: new Date(),
              documentType,
              documentNumber,
              details: response.data
            }
          }
        });

        // Check if all verifications are complete
        await this.checkKycCompletion(user);

        logger.info('Document verification successful', {
          userId: user.id,
          documentType,
          reference
        });

        return {
          reference,
          status: 'verified'
        };
      } else {
        throw new Error('Document verification failed - details do not match');
      }
    } catch (error) {
      logger.error('Document verification failed', { 
        error: error.message, 
        userId: user.id,
        documentData
      });
      
      throw error;
    }
  }

  async checkKycCompletion(user) {
    try {
      const kycData = user.kycData || {};
      const verifications = kycData.verificationSteps || {};

      const allVerified = 
        kycData.bvnVerification?.verified &&
        kycData.phoneVerification?.verified &&
        kycData.documentVerification?.verified;

      if (allVerified) {
        await userService.updateUser(user.id, {
          kycStatus: 'verified',
          kycData: {
            ...kycData,
            completedAt: new Date(),
            verifiedBy: 'dojah_automated'
          }
        });

        // Create virtual account now that KYC is complete
        const walletService = require('./wallet');
        await walletService.createVirtualAccountForWallet(user.id);

        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `🎉 *KYC Verification Complete!*\n\n` +
          `Your account has been fully verified.\n\n` +
          `✅ All verification steps completed\n` +
          `✅ Virtual account created\n` +
          `✅ All MiiMii services now available\n\n` +
          `You can now:\n` +
          `• Send and receive money\n` +
          `• Buy airtime and data\n` +
          `• Pay utility bills\n\n` +
          `Welcome to MiiMii! 🚀`
        );

        logger.info('KYC verification completed', { userId: user.id });
      }
    } catch (error) {
      logger.error('Failed to check KYC completion', { error: error.message, userId: user.id });
    }
  }

  async reviewKycApplication(user, action, reason = null) {
    try {
      if (action === 'approve') {
        await userService.updateUser(user.id, {
          kycStatus: 'verified',
          kycData: {
            ...user.kycData,
            reviewedAt: new Date(),
            reviewedBy: 'admin',
            reviewAction: action,
            reviewReason: reason
          }
        });

        // Create virtual account
        const walletService = require('./wallet');
        await walletService.createVirtualAccountForWallet(user.id);

        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `🎉 *KYC Approved!*\n\n` +
          `Your verification has been approved by our team.\n\n` +
          `✅ All MiiMii services are now available\n` +
          `✅ Virtual account created\n\n` +
          `Welcome to MiiMii! 🚀`
        );
      } else if (action === 'reject') {
        await userService.updateUser(user.id, {
          kycStatus: 'rejected',
          kycData: {
            ...user.kycData,
            reviewedAt: new Date(),
            reviewedBy: 'admin',
            reviewAction: action,
            reviewReason: reason
          }
        });

        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `❌ *KYC Verification Rejected*\n\n` +
          `Unfortunately, your verification could not be completed.\n\n` +
          `Reason: ${reason || 'Additional documentation required'}\n\n` +
          `Please contact support for assistance:\n` +
          `📞 Support: +234-XXX-XXX-XXXX\n` +
          `📧 Email: support@miimii.com`
        );
      }

      logger.info('KYC application reviewed', {
        userId: user.id,
        action,
        reason
      });

      return {
        kycStatus: action === 'approve' ? 'verified' : 'rejected'
      };
    } catch (error) {
      logger.error('Failed to review KYC application', { 
        error: error.message, 
        userId: user.id,
        action 
      });
      throw error;
    }
  }

  async handleKycVerified(webhookData) {
    try {
      const { user_id, verification_type, details } = webhookData;
      
      const user = await userService.getUserById(user_id);
      if (!user) {
        logger.warn('User not found for KYC webhook', { user_id });
        return;
      }

      // Update verification status based on type
      const updateData = {
        kycData: {
          ...user.kycData,
          [`${verification_type}Verification`]: {
            verified: true,
            verifiedAt: new Date(),
            details,
            source: 'dojah_webhook'
          }
        }
      };

      await userService.updateUser(user_id, updateData);
      
      // Check if all verifications are complete
      await this.checkKycCompletion(user);

      logger.info('KYC verification webhook processed', {
        userId: user_id,
        verificationType: verification_type
      });
    } catch (error) {
      logger.error('Failed to handle KYC verified webhook', {
        error: error.message,
        webhookData
      });
    }
  }

  async handleKycRejected(webhookData) {
    try {
      const { user_id, verification_type, reason } = webhookData;
      
      const user = await userService.getUserById(user_id);
      if (!user) {
        logger.warn('User not found for KYC rejection webhook', { user_id });
        return;
      }

      await userService.updateUser(user_id, {
        kycStatus: 'rejected',
        kycData: {
          ...user.kycData,
          rejectedAt: new Date(),
          rejectionReason: reason,
          rejectedVerification: verification_type
        }
      });

      await whatsappService.sendTextMessage(
        user.whatsappNumber,
        `❌ *Verification Issue*\n\n` +
        `There was an issue with your ${verification_type} verification.\n\n` +
        `Reason: ${reason}\n\n` +
        `Please try again or contact support for assistance.`
      );

      logger.info('KYC rejection webhook processed', {
        userId: user_id,
        verificationType: verification_type,
        reason
      });
    } catch (error) {
      logger.error('Failed to handle KYC rejected webhook', {
        error: error.message,
        webhookData
      });
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'AppId': this.appId,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await axios(config);

      return response.data;
    } catch (error) {
      if (error.response) {
        const apiError = error.response.data;
        throw new Error(apiError.message || `Dojah API Error: ${error.response.status}`);
      }
      throw error;
    }
  }

  // Utility method to extract KYC data from OCR results
  extractKycDataFromOCR(ocrResult) {
    const text = ocrResult.text || '';
    const extractedData = ocrResult.extractedData || {};

    return {
      names: extractedData.names || [],
      dates: extractedData.dates || [],
      bvnNumbers: extractedData.bvnNumbers || [],
      documentNumbers: this.extractDocumentNumbers(text),
      confidence: ocrResult.confidence || 0
    };
  }

  extractDocumentNumbers(text) {
    // Extract various Nigerian document number patterns
    const patterns = {
      nationalId: /\b[A-Z]{2}\d{9}\b/g, // NIN format
      driversLicense: /\b[A-Z]{3}\s?\d{8}\b/g, // Driver's license
      passport: /\b[A-Z]\d{8}\b/g, // Passport number
      votersCard: /\b\d{19}\b/g // Voter's card
    };

    const results = {};
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.match(pattern);
      if (matches) {
        results[type] = matches;
      }
    }

    return results;
  }
}

module.exports = new KYCService();
const axios = require('axios');
const logger = require('../utils/logger');
const userService = require('./user');
const whatsappService = require('./whatsapp');
const { v4: uuidv4 } = require('uuid');

class KYCService {
  constructor() {
    this.sandboxURL = 'https://sandbox.dojah.io';
    this.productionURL = 'https://api.dojah.io';
    this.baseURL = process.env.NODE_ENV === 'production' ? this.productionURL : this.sandboxURL;
    this.appId = process.env.DOJAH_APP_ID;
    this.secretKey = process.env.DOJAH_SECRET_KEY;
  }

  async startKycProcess(user, phoneNumber, kycData, extractedData = null) {
    try {
      const { firstName, lastName, middleName, dateOfBirth, gender, address, bvn, nin } = kycData;
      
      // Update user with KYC data
      await userService.updateUser(user.id, {
        firstName,
        lastName,
        middleName,
        dateOfBirth,
        gender,
        address,
        bvn,
        nin,
        kycStatus: 'pending',
        kycData: {
          submittedAt: new Date(),
          extractedData,
          verificationSteps: {
            bvnVerification: false,
            ninVerification: false,
            phoneVerification: false
          }
        }
      });

      // Start BVN verification if provided
      let bvnVerification = { verified: false };
      if (bvn) {
        bvnVerification = await this.verifyBvn(bvn, user);
      }
      
      // Start NIN verification if provided
      let ninVerification = { verified: false };
      if (nin) {
        ninVerification = await this.verifyNin(nin, user);
      }

      const reference = `KYC_${Date.now()}_${uuidv4().slice(0, 8)}`;

      await whatsappService.sendTextMessage(
        phoneNumber,
        `✅ *KYC Process Started*\n\n` +
        `Reference: ${reference}\n\n` +
        `✅ Personal details recorded\n` +
        `${bvnVerification.verified ? '✅' : '⏳'} BVN verification ${bvn ? '(processing)' : '(pending)'}\n` +
        `${ninVerification.verified ? '✅' : '⏳'} NIN verification ${nin ? '(processing)' : '(pending)'}\n` +
        `⏳ Phone verification pending\n\n` +
        `${!bvn ? 'Please provide your 11-digit BVN.\n' : ''}` +
        `${!nin ? 'Please provide your 11-digit NIN.\n' : ''}` +
        `Send a clear photo of your ID card, driver's license, or passport to complete verification.`
      );

      logger.info('KYC process started', {
        userId: user.id,
        reference,
        bvnVerified: bvnVerification.verified,
        ninVerified: ninVerification.verified
      });

      return {
        reference,
        kycStatus: 'pending',
        verificationSteps: {
          bvnVerification: bvnVerification.verified,
          ninVerification: ninVerification.verified,
          phoneVerification: false
        }
      };
    } catch (error) {
      logger.error('Failed to start KYC process', { error: error.message, userId: user.id });
      throw error;
    }
  }

  async verifyBvn(bvn, user, advanced = false) {
    try {
      if (!bvn || bvn.length !== 11) {
        throw new Error('BVN must be 11 digits');
      }

      const endpoint = advanced ? '/api/v1/kyc/bvn/advance' : '/api/v1/kyc/bvn/full';
      const response = await this.makeRequest('GET', endpoint, { bvn });

      if (response.entity) {
        const entity = response.entity;
        
        // Cross-check names for verification
        const nameMatch = this.crossCheckNames(user, entity);
        
        if (nameMatch.isValid) {
          // Update user KYC data
          await userService.updateUser(user.id, {
            kycData: {
              ...user.kycData,
              bvnVerification: {
                verified: true,
                verifiedAt: new Date(),
                confidence: nameMatch.confidence,
                details: {
                  fullName: `${entity.first_name} ${entity.middle_name || ''} ${entity.last_name}`.trim(),
                  dateOfBirth: entity.date_of_birth,
                  phoneNumber: entity.phone_number1,
                  gender: entity.gender,
                  email: entity.email,
                  enrollmentBank: entity.enrollment_bank,
                  nationality: entity.nationality,
                  stateOfOrigin: entity.state_of_origin,
                  maritalStatus: entity.marital_status,
                  watchListed: entity.watch_listed
                }
              }
            }
          });

          logger.info('BVN verification successful', {
            userId: user.id,
            bvn: '***' + bvn.slice(-4),
            confidence: nameMatch.confidence
          });

          return {
            verified: true,
            confidence: nameMatch.confidence,
            details: entity
          };
        } else {
          throw new Error(`BVN verification failed - ${nameMatch.reason}`);
        }
      } else {
        throw new Error('BVN verification failed - invalid response');
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

  async verifyNin(nin, user) {
    try {
      if (!nin || nin.length !== 11) {
        throw new Error('NIN must be 11 digits');
      }

      const response = await this.makeRequest('GET', '/api/v1/kyc/nin', { nin });

      if (response.entity) {
        const entity = response.entity;
        
        // Cross-check names for verification
        const nameMatch = this.crossCheckNames(user, entity);
        
        if (nameMatch.isValid) {
          // Update user KYC data
          await userService.updateUser(user.id, {
            kycData: {
              ...user.kycData,
              ninVerification: {
                verified: true,
                verifiedAt: new Date(),
                confidence: nameMatch.confidence,
                details: {
                  fullName: `${entity.first_name} ${entity.middle_name || ''} ${entity.last_name}`.trim(),
                  dateOfBirth: entity.date_of_birth,
                  phoneNumber: entity.phone_number,
                  gender: entity.gender,
                  email: entity.email,
                  employmentStatus: entity.employment_status,
                  maritalStatus: entity.marital_status,
                  photo: entity.photo ? 'Available' : 'Not available'
                }
              }
            }
          });

          logger.info('NIN verification successful', {
            userId: user.id,
            nin: '***' + nin.slice(-4),
            confidence: nameMatch.confidence
          });

          return {
            verified: true,
            confidence: nameMatch.confidence,
            details: entity
          };
        } else {
          throw new Error(`NIN verification failed - ${nameMatch.reason}`);
        }
      } else {
        throw new Error('NIN verification failed - invalid response');
      }
    } catch (error) {
      logger.error('NIN verification failed', { 
        error: error.message, 
        userId: user.id,
        nin: '***' + nin.slice(-4)
      });
      
      return {
        verified: false,
        error: error.message
      };
    }
  }

  crossCheckNames(user, entity) {
    const userFirstName = (user.firstName || '').toLowerCase().trim();
    const userLastName = (user.lastName || '').toLowerCase().trim();
    const userMiddleName = (user.middleName || '').toLowerCase().trim();

    const entityFirstName = (entity.first_name || '').toLowerCase().trim();
    const entityLastName = (entity.last_name || '').toLowerCase().trim();
    const entityMiddleName = (entity.middle_name || '').toLowerCase().trim();

    let confidence = 0;
    let matchedFields = [];

    // Check first name match
    if (userFirstName && entityFirstName && userFirstName === entityFirstName) {
      confidence += 40;
      matchedFields.push('first_name');
    } else if (userFirstName && entityFirstName && this.isSimilarName(userFirstName, entityFirstName)) {
      confidence += 25;
      matchedFields.push('first_name_similar');
    }

    // Check last name match
    if (userLastName && entityLastName && userLastName === entityLastName) {
      confidence += 40;
      matchedFields.push('last_name');
    } else if (userLastName && entityLastName && this.isSimilarName(userLastName, entityLastName)) {
      confidence += 25;
      matchedFields.push('last_name_similar');
    }

    // Check middle name match (optional)
    if (userMiddleName && entityMiddleName && userMiddleName === entityMiddleName) {
      confidence += 20;
      matchedFields.push('middle_name');
    }

    // Date of birth check if available
    if (user.dateOfBirth && entity.date_of_birth) {
      const userDob = new Date(user.dateOfBirth).toISOString().split('T')[0];
      const entityDob = new Date(entity.date_of_birth).toISOString().split('T')[0];
      
      if (userDob === entityDob) {
        confidence += 20;
        matchedFields.push('date_of_birth');
      }
    }

    const isValid = confidence >= 60; // Minimum 60% confidence required
    const reason = isValid ? 'Verification successful' : 
                   confidence < 30 ? 'Names do not match' : 
                   'Insufficient confidence in name matching';

    return {
      isValid,
      confidence,
      reason,
      matchedFields
    };
  }

  isSimilarName(name1, name2) {
    // Simple similarity check (can be enhanced with fuzzy matching)
    if (Math.abs(name1.length - name2.length) > 3) return false;
    
    // Check if one name contains the other
    if (name1.includes(name2) || name2.includes(name1)) return true;
    
    // Check for common abbreviations/variations
    const variations = {
      'muhammad': ['mohammed', 'mohamed', 'ahmad'],
      'ibrahim': ['abraham'],
      'fatima': ['fatimah'],
      'aisha': ['aishah'],
      'abdul': ['abdullahi'],
      'emmanuel': ['emeka'],
      'oluwaseun': ['seun'],
      'oluwasegun': ['segun']
    };

    for (const [key, values] of Object.entries(variations)) {
      if ((name1 === key && values.includes(name2)) || 
          (name2 === key && values.includes(name1))) {
        return true;
      }
    }

    return false;
  }

  async checkKycCompletion(user) {
    try {
      const kycData = user.kycData || {};

      const allVerified = 
        (kycData.bvnVerification?.verified || kycData.ninVerification?.verified) &&
        kycData.phoneVerification?.verified;

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

  async makeRequest(method, endpoint, params = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'AppId': this.appId,
          'Authorization': this.secretKey,
          'Content-Type': 'application/json'
        }
      };

      if (params) {
        if (method === 'GET') {
          config.params = params;
        } else {
          config.data = params;
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
      ninNumbers: this.extractNinNumbers(text),
      documentNumbers: this.extractDocumentNumbers(text),
      confidence: ocrResult.confidence || 0
    };
  }

  extractNinNumbers(text) {
    // Extract NIN pattern (11 digits)
    const ninPattern = /\b\d{11}\b/g;
    const matches = text.match(ninPattern);
    return matches || [];
  }

  extractDocumentNumbers(text) {
    // Extract various Nigerian document number patterns
    const patterns = {
      nin: /\b\d{11}\b/g, // NIN format (11 digits)
      bvn: /\b\d{11}\b/g, // BVN format (11 digits)
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

  // Test methods for sandbox environment
  async testBvnLookup() {
    try {
      // Use test BVN from documentation
      const testBvn = '22222222222';
      const response = await this.makeRequest('GET', '/api/v1/kyc/bvn/full', { bvn: testBvn });
      
      logger.info('Test BVN lookup successful', { response });
      return response;
    } catch (error) {
      logger.error('Test BVN lookup failed', { error: error.message });
      throw error;
    }
  }

  async testNinLookup() {
    try {
      // Use test NIN from documentation
      const testNin = '70123456789';
      const response = await this.makeRequest('GET', '/api/v1/kyc/nin', { nin: testNin });
      
      logger.info('Test NIN lookup successful', { response });
      return response;
    } catch (error) {
      logger.error('Test NIN lookup failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new KYCService();
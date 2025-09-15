const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

class WhatsAppDiagnostics {
  constructor() {
    const whatsappConfig = config.getWhatsappConfig();
    this.accessToken = whatsappConfig.accessToken;
    this.phoneNumberId = whatsappConfig.phoneNumberId;
  }

  /**
   * Test WhatsApp Business API connectivity and permissions
   */
  async runDiagnostics() {
    const results = {
      timestamp: new Date().toISOString(),
      phoneNumberId: this.phoneNumberId,
      accessTokenPrefix: this.accessToken.substring(0, 20) + '...',
      tests: {}
    };

    try {
      // Test 1: Check phone number info
      await this.testPhoneNumberInfo(results);
      
      // Test 2: Check media upload permissions
      await this.testMediaUploadPermissions(results);
      
      // Test 3: Check message sending permissions
      await this.testMessageSendingPermissions(results);
      
      // Test 4: Check different API versions
      await this.testApiVersions(results);

    } catch (error) {
      logger.error('WhatsApp diagnostics failed', { error: error.message });
      results.error = error.message;
    }

    return results;
  }

  async testPhoneNumberInfo(results) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v23.0/${this.phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 10000
        }
      );

      results.tests.phoneNumberInfo = {
        success: true,
        data: {
          id: response.data.id,
          displayPhoneNumber: response.data.display_phone_number,
          verifiedName: response.data.verified_name,
          qualityRating: response.data.quality_rating,
          status: response.data.status
        }
      };

      logger.info('Phone number info test passed', { phoneNumberId: this.phoneNumberId });
    } catch (error) {
      results.tests.phoneNumberInfo = {
        success: false,
        error: error.message,
        status: error.response?.status,
        response: error.response?.data
      };
      logger.error('Phone number info test failed', { error: error.message });
    }
  }

  async testMediaUploadPermissions(results) {
    try {
      // Create a minimal test image (1x1 pixel PNG)
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x5C, 0xC1, 0x8E, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', testImageBuffer, {
        filename: 'test.png',
        contentType: 'image/png'
      });

      const response = await axios.post(
        `https://graph.facebook.com/v23.0/${this.phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            ...formData.getHeaders()
          },
          timeout: 30000
        }
      );

      results.tests.mediaUpload = {
        success: true,
        mediaId: response.data.id,
        data: response.data
      };

      logger.info('Media upload test passed', { mediaId: response.data.id });
    } catch (error) {
      results.tests.mediaUpload = {
        success: false,
        error: error.message,
        status: error.response?.status,
        response: error.response?.data
      };
      logger.error('Media upload test failed', { error: error.message });
    }
  }

  async testMessageSendingPermissions(results) {
    try {
      // Test with a simple text message first
      const response = await axios.post(
        `https://graph.facebook.com/v23.0/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: '+2349072874728', // Test number
          type: 'text',
          text: {
            body: 'Test message from diagnostics'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      results.tests.messageSending = {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        data: response.data
      };

      logger.info('Message sending test passed', { messageId: response.data.messages?.[0]?.id });
    } catch (error) {
      results.tests.messageSending = {
        success: false,
        error: error.message,
        status: error.response?.status,
        response: error.response?.data
      };
      logger.error('Message sending test failed', { error: error.message });
    }
  }

  async testApiVersions(results) {
    const versions = ['v23.0', 'v22.0', 'v21.0'];
    results.tests.apiVersions = {};

    for (const version of versions) {
      try {
        const response = await axios.get(
          `https://graph.facebook.com/${version}/${this.phoneNumberId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            },
            timeout: 10000
          }
        );

        results.tests.apiVersions[version] = {
          success: true,
          data: response.data
        };

        logger.info(`API version ${version} test passed`);
      } catch (error) {
        results.tests.apiVersions[version] = {
          success: false,
          error: error.message,
          status: error.response?.status
        };
        logger.error(`API version ${version} test failed`, { error: error.message });
      }
    }
  }

  /**
   * Generate a diagnostic report
   */
  generateReport(results) {
    const report = {
      summary: {
        totalTests: Object.keys(results.tests).length,
        passedTests: 0,
        failedTests: 0,
        issues: []
      },
      recommendations: []
    };

    // Analyze results
    Object.entries(results.tests).forEach(([testName, result]) => {
      if (result.success) {
        report.summary.passedTests++;
      } else {
        report.summary.failedTests++;
        report.summary.issues.push({
          test: testName,
          error: result.error,
          status: result.status
        });
      }
    });

    // Generate recommendations
    if (results.tests.phoneNumberInfo && !results.tests.phoneNumberInfo.success) {
      report.recommendations.push('Check WhatsApp Business API phone number ID configuration');
    }

    if (results.tests.mediaUpload && !results.tests.mediaUpload.success) {
      report.recommendations.push('Verify media upload permissions in WhatsApp Business Manager');
    }

    if (results.tests.messageSending && !results.tests.messageSending.success) {
      report.recommendations.push('Check message sending permissions and access token validity');
    }

    if (results.tests.apiVersions) {
      const workingVersions = Object.entries(results.tests.apiVersions)
        .filter(([_, result]) => result.success)
        .map(([version, _]) => version);
      
      if (workingVersions.length === 0) {
        report.recommendations.push('No working API versions found - check access token and phone number ID');
      } else {
        report.recommendations.push(`Use API version: ${workingVersions[0]} (working versions: ${workingVersions.join(', ')})`);
      }
    }

    return report;
  }
}

module.exports = WhatsAppDiagnostics;

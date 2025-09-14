const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

class ImageProcessingService {
  constructor() {
    this.openaiApiKey = process.env.AI_API_KEY;
    this.whatsappConfig = config.getWhatsappConfig();
  }

  /**
   * Download image from WhatsApp media URL
   */
  async downloadImage(mediaId) {
    try {
      logger.info('Downloading image from WhatsApp', {
        mediaId,
        hasAccessToken: !!this.whatsappConfig.accessToken,
        accessTokenLength: this.whatsappConfig.accessToken ? this.whatsappConfig.accessToken.length : 0
      });

      const mediaUrl = `https://graph.facebook.com/v23.0/${mediaId}`;
      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.whatsappConfig.accessToken}`
        }
      });

      logger.info('Media URL response', {
        status: response.status,
        hasUrl: !!response.data.url,
        responseData: response.data
      });

      if (!response.data.url) {
        throw new Error('No media URL found in response');
      }

      // Download the actual image
      const imageResponse = await axios.get(response.data.url, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.whatsappConfig.accessToken}`
        }
      });

      logger.info('Image download successful', {
        imageSize: imageResponse.data.length,
        contentType: imageResponse.headers['content-type']
      });

      return Buffer.from(imageResponse.data);
    } catch (error) {
      logger.error('Failed to download image from WhatsApp', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        mediaId
      });
      throw error;
    }
  }

  /**
   * Preprocess image for better OCR results
   */
  async preprocessImage(imageBuffer) {
    try {
      // Use sharp to enhance the image for better OCR, especially for handwritten text
      const processedBuffer = await sharp(imageBuffer)
        .resize(2000, 2000, { 
          fit: 'inside',
          withoutEnlargement: false 
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 }) // Enhanced sharpening for handwritten text
        .gamma(1.2) // Adjust gamma for better contrast
        .threshold(120) // Lower threshold for handwritten text
        .png()
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      logger.error('Failed to preprocess image', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract text from image using OCR
   */
  async extractTextFromImage(imageBuffer) {
    try {
      logger.info('Starting OCR text extraction', {
        imageBufferSize: imageBuffer.length
      });
      
      const result = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.debug('OCR progress', { progress: Math.round(m.progress * 100) });
          }
        }
      });

      const extractedText = result.data.text;
      logger.info('OCR text extraction completed', {
        textLength: extractedText.length,
        confidence: result.data.confidence,
        extractedText: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : ''),
        fullText: extractedText, // Log the full text for debugging
        rawText: extractedText.replace(/\n/g, '\\n').replace(/\r/g, '\\r') // Show newlines as escape sequences
      });

      return {
        text: extractedText,
        confidence: result.data.confidence
      };
    } catch (error) {
      logger.error('OCR text extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Use AI to analyze extracted text and extract bank details
   */
  async extractBankDetailsFromText(extractedText) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      logger.info('Starting AI bank details extraction', {
        extractedTextLength: extractedText.length,
        hasOpenaiKey: !!this.openaiApiKey
      });

      const openai = require('openai');
      const client = new openai.OpenAI({
        apiKey: this.openaiApiKey
      });

      const prompt = `
You are a banking assistant that extracts bank details from text. Analyze the following text and extract bank information.

Text to analyze:
${extractedText}

Extract the following information if present:
1. Account Number (10-11 digits) - look for numbers that could be account numbers
2. Bank Name (full bank name or common abbreviations like GTB, Access Bank, First Bank, etc.)
3. Account Holder Name (if mentioned)
4. Any other relevant banking information

Common Nigerian bank names to look for:
- Guaranty Trust Bank (GTB)
- Access Bank
- First Bank of Nigeria
- United Bank for Africa (UBA)
- Zenith Bank
- Sterling Bank
- Fidelity Bank
- Union Bank
- Wema Bank
- Polaris Bank
- Jaiz Bank
- Heritage Bank
- Keystone Bank
- Providus Bank
- Titan Trust Bank
- Globus Bank
- Parallex Bank
- Premium Trust Bank
- Suntrust Bank
- TAJ Bank

Return ONLY a JSON object with this structure:
{
  "accountNumber": "1234567890",
  "bankName": "Guaranty Trust Bank",
  "accountHolderName": "John Doe",
  "confidence": 0.95,
  "extractedText": "relevant portion of text that contains the bank details"
}

If any field is not found, use null. Be very careful with account numbers - they should be exactly as written.
Look carefully for any numbers that could be account numbers, even if they're not clearly labeled.
Only return the JSON object, no other text.
`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a banking assistant that extracts bank details from text. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const aiResponse = response.choices[0].message.content.trim();
      logger.info('AI bank details extraction completed', { 
        aiResponse,
        responseLength: aiResponse.length,
        fullResponse: aiResponse
      });

      // Parse the JSON response
      const bankDetails = JSON.parse(aiResponse);
      logger.info('Parsed bank details from AI', {
        hasAccountNumber: !!bankDetails.accountNumber,
        hasBankName: !!bankDetails.bankName,
        hasAccountHolderName: !!bankDetails.accountHolderName,
        confidence: bankDetails.confidence,
        bankDetails: bankDetails
      });

      // If AI didn't find anything, try fallback extraction
      if (!bankDetails.accountNumber && !bankDetails.bankName) {
        logger.info('AI found no bank details, trying fallback extraction');
        const fallbackDetails = this.fallbackBankDetailsExtraction(extractedText);
        if (fallbackDetails.accountNumber || fallbackDetails.bankName) {
          logger.info('Fallback extraction found details', { fallbackDetails });
          // Merge fallback results with AI results
          Object.assign(bankDetails, fallbackDetails);
        }
      }
      
      // Validate the extracted data
      if (bankDetails.accountNumber && !/^\d{10,11}$/.test(bankDetails.accountNumber)) {
        logger.warn('Invalid account number format', { accountNumber: bankDetails.accountNumber });
        bankDetails.accountNumber = null;
      }

      return bankDetails;
    } catch (error) {
      logger.error('AI bank details extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process image and extract bank details
   */
  async processBankDetailsImage(mediaId) {
    try {
      logger.info('Starting bank details image processing', { 
        mediaId,
        hasOpenaiKey: !!this.openaiApiKey,
        hasWhatsappConfig: !!this.whatsappConfig
      });

      // Step 1: Download image
      const imageBuffer = await this.downloadImage(mediaId);
      logger.info('Image downloaded successfully', { 
        size: imageBuffer.length,
        mediaId 
      });

      // Step 2: Preprocess image
      const processedBuffer = await this.preprocessImage(imageBuffer);
      logger.info('Image preprocessing completed');

      // Step 3: Extract text using OCR
      const ocrResult = await this.extractTextFromImage(processedBuffer);
      logger.info('OCR extraction completed', { 
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence 
      });

      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        throw new Error('No text found in image');
      }

      // Step 4: Extract bank details using AI
      const bankDetails = await this.extractBankDetailsFromText(ocrResult.text);
      logger.info('Bank details extraction completed', { bankDetails });

      // Step 5: Validate extracted bank details
      const validation = this.validateBankDetails(bankDetails);
      logger.info('Bank details validation result', {
        isValid: validation.isValid,
        errors: validation.errors,
        bankDetails: bankDetails
      });
      
      if (!validation.isValid) {
        logger.warn('Bank details validation failed', { 
          errors: validation.errors,
          bankDetails 
        });
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          bankDetails,
          ocrText: ocrResult.text
        };
      }

      return {
        success: true,
        bankDetails,
        ocrText: ocrResult.text,
        ocrConfidence: ocrResult.confidence
      };
    } catch (error) {
      logger.error('Bank details image processing failed', { 
        error: error.message,
        mediaId 
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fallback bank details extraction using regex patterns
   */
  fallbackBankDetailsExtraction(text) {
    const result = {
      accountNumber: null,
      bankName: null,
      accountHolderName: null,
      confidence: 0.3,
      extractedText: ''
    };

    // Look for account numbers (10-11 digits)
    const accountNumberMatch = text.match(/\b(\d{10,11})\b/);
    if (accountNumberMatch) {
      result.accountNumber = accountNumberMatch[1];
      result.extractedText += `Account: ${accountNumberMatch[1]} `;
    }

    // Look for bank names (common patterns)
    const bankPatterns = [
      /(?:guaranty\s+trust\s+bank|gtb)/i,
      /(?:access\s+bank)/i,
      /(?:first\s+bank)/i,
      /(?:united\s+bank\s+for\s+africa|uba)/i,
      /(?:zenith\s+bank)/i,
      /(?:sterling\s+bank)/i,
      /(?:fidelity\s+bank)/i,
      /(?:union\s+bank)/i,
      /(?:wema\s+bank)/i,
      /(?:polaris\s+bank)/i,
      /(?:jaiz\s+bank)/i,
      /(?:heritage\s+bank)/i,
      /(?:keystone\s+bank)/i,
      /(?:providus\s+bank)/i,
      /(?:titan\s+trust\s+bank)/i,
      /(?:globus\s+bank)/i,
      /(?:parallex\s+bank)/i,
      /(?:premium\s+trust\s+bank)/i,
      /(?:suntrust\s+bank)/i,
      /(?:taj\s+bank)/i
    ];

    for (const pattern of bankPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.bankName = match[0];
        result.extractedText += `Bank: ${match[0]} `;
        break;
      }
    }

    // Look for account holder names (words that could be names)
    const nameMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    if (nameMatch && !result.bankName) {
      result.accountHolderName = nameMatch[1];
      result.extractedText += `Name: ${nameMatch[1]} `;
    }

    return result;
  }

  /**
   * Validate extracted bank details
   */
  validateBankDetails(bankDetails) {
    const errors = [];

    if (!bankDetails.accountNumber) {
      errors.push('Account number not found');
    } else if (!/^\d{10,11}$/.test(bankDetails.accountNumber)) {
      errors.push('Invalid account number format');
    }

    if (!bankDetails.bankName) {
      errors.push('Bank name not found');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new ImageProcessingService();

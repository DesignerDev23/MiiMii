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
      // Use sharp to enhance the image for better OCR
      const processedBuffer = await sharp(imageBuffer)
        .resize(2000, 2000, { 
          fit: 'inside',
          withoutEnlargement: false 
        })
        .grayscale()
        .normalize()
        .sharpen()
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
        extractedText: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : '')
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
"${extractedText}"

Extract the following information if present:
1. Account Number (10-11 digits)
2. Bank Name (full bank name)
3. Account Holder Name (if mentioned)
4. Any other relevant banking information

Return ONLY a JSON object with this structure:
{
  "accountNumber": "1234567890",
  "bankName": "Guaranty Trust Bank",
  "accountHolderName": "John Doe",
  "confidence": 0.95,
  "extractedText": "relevant portion of text that contains the bank details"
}

If any field is not found, use null. Be very careful with account numbers - they should be exactly as written.
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
      logger.info('AI bank details extraction completed', { aiResponse });

      // Parse the JSON response
      const bankDetails = JSON.parse(aiResponse);
      
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

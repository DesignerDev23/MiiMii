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
        .resize(3000, 3000, { 
          fit: 'inside',
          withoutEnlargement: false 
        })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5, m1: 0.8, m2: 3.0 }) // More aggressive sharpening for handwritten text
        .gamma(1.3) // Higher gamma for better contrast
        .threshold(110) // Even lower threshold for handwritten text
        .modulate({
          brightness: 1.1, // Slightly brighter
          contrast: 1.2    // Higher contrast
        })
        .png()
        .toBuffer();

      logger.info('Image preprocessing completed', {
        originalSize: imageBuffer.length,
        processedSize: processedBuffer.length,
        enhancement: 'Enhanced for handwritten text recognition'
      });

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
        },
        // Enhanced OCR configuration for better text recognition
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,-:()',
        tessedit_pageseg_mode: '6', // Assume a single uniform block of text
        tessedit_ocr_engine_mode: '3', // Default, based on what is available
        preserve_interword_spaces: '1', // Preserve spaces between words
        textord_min_linesize: '2.5', // Minimum line size
        textord_old_baselines: '1', // Use old baseline detection
        textord_old_xheight: '1' // Use old x-height detection
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
You are an expert banking assistant specialized in extracting Nigerian bank details from text, even when not explicitly labeled.

Text to analyze:
${extractedText}

CRITICAL INSTRUCTIONS:
1. Find ANY 10-digit number in the text - this is likely an account number, regardless of context or labels
2. Find ANY Nigerian bank name or abbreviation, even partial matches
3. Don't require labels like "Account Number:" or "Bank Name:" - extract from context
4. Be very aggressive in pattern matching - users often don't format details clearly

ACCOUNT NUMBER DETECTION:
- Look for exactly 10 digits (most Nigerian accounts)
- Can be grouped with spaces, dashes, or continuous
- Examples: "1234567890", "1234 567 890", "1234-567-890"
- Ignore phone numbers (usually 11 digits starting with 0)
- Ignore amounts with currency symbols

NIGERIAN BANK DETECTION (including digital banks):
Traditional Banks:
- GTB, Guaranty Trust, GT Bank, Guaranty Trust Bank
- Access, Access Bank
- First Bank, FBN, First Bank of Nigeria
- UBA, United Bank for Africa
- Zenith, Zenith Bank
- Sterling, Sterling Bank
- Fidelity, Fidelity Bank
- Union Bank
- Wema, Wema Bank
- Polaris, Polaris Bank
- Jaiz, Jaiz Bank
- Heritage, Heritage Bank
- Keystone, Keystone Bank
- Providus, Providus Bank
- Stanbic, Stanbic IBTC
- Standard Chartered
- Citibank
- Ecobank
- FCMB
- Unity Bank

Digital Banks & Fintechs:
- Opay, OPay Bank
- Palmpay, PalmPay
- Kuda, Kuda Bank
- Carbon, Carbon Bank
- VBank, V Bank
- Rubies Bank
- Moniepoint, Moniepoint MFB
- Sparkle, Sparkle Microfinance
- Mintyn, Mintyn Bank
- Fairmoney
- Branch
- Eyowo
- ALAT (by Wema)
- Titan Trust Bank
- TAJ Bank
- Globus Bank
- Parallex Bank
- Premium Trust Bank
- Suntrust Bank
- Coronation Bank
- Rand Merchant Bank
- Nova Merchant Bank
- Bowen Microfinance
- NPF Microfinance

EXTRACTION STRATEGY:
1. Scan entire text for 10-digit sequences
2. Look for bank names/abbreviations anywhere in text
3. Extract names that appear near numbers or bank names
4. Don't require specific formatting or labels
5. Be flexible with spacing, capitalization, and abbreviations

Return ONLY a JSON object:
{
  "accountNumber": "1234567890",
  "bankName": "Access Bank",
  "accountHolderName": "John Doe",
  "confidence": 0.95,
  "extractedText": "relevant portion of text that contains the bank details"
}

Set confidence based on clarity:
- 0.9+: Clear account number + clear bank name
- 0.7-0.9: Clear account number OR clear bank name
- 0.5-0.7: Partial matches or unclear formatting
- <0.5: Very uncertain matches

Use null for missing fields. Extract the most likely 10-digit account number and most recognizable Nigerian bank name.
`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a banking assistant that extracts bank details from text. Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. The response must be parseable JSON.'
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

      // Parse the JSON response - handle markdown code blocks
      let jsonResponse = aiResponse;
      
      // Remove markdown code blocks if present
      if (jsonResponse.includes('```json')) {
        jsonResponse = jsonResponse.replace(/```json\s*/, '').replace(/\s*```/, '');
      } else if (jsonResponse.includes('```')) {
        jsonResponse = jsonResponse.replace(/```\s*/, '').replace(/\s*```/, '');
      }
      
      // Clean up any remaining markdown formatting
      jsonResponse = jsonResponse.trim();
      
      logger.info('Cleaned AI response for JSON parsing', {
        originalResponse: aiResponse,
        cleanedResponse: jsonResponse
      });
      
      let bankDetails;
      try {
        bankDetails = JSON.parse(jsonResponse);
        logger.info('Parsed bank details from AI', {
          hasAccountNumber: !!bankDetails.accountNumber,
          hasBankName: !!bankDetails.bankName,
          hasAccountHolderName: !!bankDetails.accountHolderName,
          confidence: bankDetails.confidence,
          bankDetails: bankDetails
        });
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON', {
          error: parseError.message,
          originalResponse: aiResponse,
          cleanedResponse: jsonResponse
        });
        throw new Error(`AI response parsing failed: ${parseError.message}`);
      }

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
      
      // Validate and clean the extracted data
      if (bankDetails.accountNumber) {
        // Clean account number - remove spaces, dashes, and other formatting
        const cleanAccountNumber = bankDetails.accountNumber.toString().replace(/[\s\-]/g, '');
        
        // Validate format - should be 8-11 digits, but prioritize 10-digit accounts
        if (!/^\d{8,11}$/.test(cleanAccountNumber)) {
          logger.warn('Invalid account number format', { accountNumber: bankDetails.accountNumber });
          bankDetails.accountNumber = null;
        } else {
          // Use the cleaned version
          bankDetails.accountNumber = cleanAccountNumber;
          
          // Warn if not 10 digits (most common format)
          if (cleanAccountNumber.length !== 10) {
            logger.info('Account number length not standard 10 digits', { 
              accountNumber: cleanAccountNumber, 
              length: cleanAccountNumber.length 
            });
          }
        }
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
   * Enhanced fallback bank details extraction using improved regex patterns
   */
  fallbackBankDetailsExtraction(text) {
    const result = {
      accountNumber: null,
      bankName: null,
      accountHolderName: null,
      confidence: 0.3,
      extractedText: ''
    };

    // Enhanced account number detection - prioritize 10-digit numbers, avoid phone numbers
    const cleanText = text.replace(/[^\w\s]/g, ' '); // Remove special chars but keep numbers
    const numberMatches = cleanText.match(/\b(\d{8,11})\b/g);
    
    if (numberMatches) {
      // Filter out phone numbers (11 digits starting with 0) and prioritize 10-digit numbers
      const accountCandidates = numberMatches
        .filter(num => {
          // Exclude phone numbers (11 digits starting with 0)
          if (num.length === 11 && num.startsWith('0')) return false;
          // Exclude very common numbers that are likely not accounts
          if (['1234567890', '0000000000', '1111111111'].includes(num)) return false;
          return true;
        })
        .sort((a, b) => {
          // Prioritize 10-digit numbers
          if (a.length === 10 && b.length !== 10) return -1;
          if (b.length === 10 && a.length !== 10) return 1;
          return 0;
        });
      
      if (accountCandidates.length > 0) {
        result.accountNumber = accountCandidates[0];
        result.extractedText += `Account: ${accountCandidates[0]} `;
      }
    }

    // Enhanced bank name patterns including digital banks and common abbreviations
    const bankPatterns = [
      // Traditional banks with variations
      /(?:guaranty\s+trust\s*(?:bank)?|gtb?|gt\s+bank)/i,
      /(?:access\s*(?:bank)?)/i,
      /(?:first\s+bank(?:\s+of\s+nigeria)?|fbn)/i,
      /(?:united\s+bank\s+for\s+africa|uba)/i,
      /(?:zenith\s*(?:bank)?)/i,
      /(?:sterling\s*(?:bank)?)/i,
      /(?:fidelity\s*(?:bank)?)/i,
      /(?:union\s*(?:bank)?)/i,
      /(?:wema\s*(?:bank)?)/i,
      /(?:polaris\s*(?:bank)?)/i,
      /(?:jaiz\s*(?:bank)?)/i,
      /(?:heritage\s*(?:bank)?)/i,
      /(?:keystone\s*(?:bank)?)/i,
      /(?:providus\s*(?:bank)?)/i,
      /(?:stanbic\s*(?:ibtc)?)/i,
      /(?:standard\s+chartered)/i,
      /(?:citibank)/i,
      /(?:ecobank)/i,
      /(?:fcmb)/i,
      /(?:unity\s*(?:bank)?)/i,
      
      // Digital banks and fintechs
      /(?:opay\s*(?:bank)?)/i,
      /(?:palmpay)/i,
      /(?:kuda\s*(?:bank)?)/i,
      /(?:carbon\s*(?:bank)?)/i,
      /(?:v\s*bank|vbank)/i,
      /(?:rubies\s*(?:bank)?)/i,
      /(?:moniepoint(?:\s+mfb)?)/i,
      /(?:sparkle(?:\s+microfinance)?)/i,
      /(?:mintyn\s*(?:bank)?)/i,
      /(?:fairmoney)/i,
      /(?:branch)/i,
      /(?:eyowo)/i,
      /(?:alat)/i,
      /(?:titan\s+trust\s*(?:bank)?)/i,
      /(?:taj\s*(?:bank)?)/i,
      /(?:globus\s*(?:bank)?)/i,
      /(?:parallex\s*(?:bank)?)/i,
      /(?:premium\s+trust\s*(?:bank)?)/i,
      /(?:suntrust\s*(?:bank)?)/i,
      /(?:coronation\s*(?:bank)?)/i,
      /(?:rand\s+merchant\s*(?:bank)?)/i,
      /(?:nova\s+merchant\s*(?:bank)?)/i,
      /(?:bowen\s*(?:microfinance)?)/i,
      /(?:npf\s*(?:microfinance)?)/i
    ];

    for (const pattern of bankPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Normalize bank name
        let bankName = match[0].trim();
        
        // Convert common abbreviations to full names
        const bankNameMap = {
          'gtb': 'Guaranty Trust Bank',
          'gt bank': 'Guaranty Trust Bank',
          'uba': 'United Bank for Africa',
          'fbn': 'First Bank of Nigeria',
          'fcmb': 'First City Monument Bank',
          'opay': 'Opay',
          'palmpay': 'Palmpay',
          'kuda': 'Kuda Bank',
          'carbon': 'Carbon Bank',
          'v bank': 'VBank',
          'vbank': 'VBank',
          'alat': 'ALAT by Wema'
        };
        
        const normalizedName = bankName.toLowerCase().replace(/\s+/g, ' ').trim();
        result.bankName = bankNameMap[normalizedName] || bankName;
        result.extractedText += `Bank: ${result.bankName} `;
        result.confidence = 0.5; // Higher confidence when bank is found
        break;
      }
    }

    // Enhanced name extraction - look for capitalized words that could be names
    const namePatterns = [
      // Full names (2-3 words, properly capitalized)
      /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g,
      // Single names that might be account holders
      /\b([A-Z][a-z]{3,})\b/g
    ];
    
    for (const pattern of namePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        // Filter out bank names from potential account holder names
        const bankKeywords = ['bank', 'trust', 'access', 'first', 'united', 'zenith', 'sterling', 'fidelity', 'union', 'wema', 'polaris', 'heritage', 'keystone', 'opay', 'kuda', 'carbon'];
        const validNames = matches.filter(name => {
          const lowerName = name.toLowerCase();
          return !bankKeywords.some(keyword => lowerName.includes(keyword));
        });
        
        if (validNames.length > 0) {
          result.accountHolderName = validNames[0];
          result.extractedText += `Name: ${validNames[0]} `;
          break;
        }
      }
    }

    // Increase confidence if we found both account number and bank
    if (result.accountNumber && result.bankName) {
      result.confidence = 0.7;
    } else if (result.accountNumber || result.bankName) {
      result.confidence = 0.5;
    }

    return result;
  }

  /**
   * Validate extracted bank details with flexible requirements
   */
  validateBankDetails(bankDetails) {
    const errors = [];

    // Account number validation - more flexible
    if (!bankDetails.accountNumber) {
      errors.push('Account number not found');
    } else if (!/^\d{8,11}$/.test(bankDetails.accountNumber)) {
      errors.push('Invalid account number format (should be 8-11 digits)');
    }

    // Bank name validation - more flexible, allow partial matches
    if (!bankDetails.bankName) {
      errors.push('Bank name not found');
    } else {
      // Check if bank name is too short or generic
      const bankName = bankDetails.bankName.toLowerCase();
      if (bankName.length < 3 || ['bank', 'ltd', 'plc'].includes(bankName)) {
        errors.push('Bank name too generic or short');
      }
    }

    // If we have at least one piece of information with decent confidence, consider it valid
    const hasMinimumInfo = bankDetails.accountNumber || bankDetails.bankName;
    const hasDecentConfidence = bankDetails.confidence >= 0.5;

    return {
      isValid: hasMinimumInfo && hasDecentConfidence && errors.length <= 1, // Allow 1 error if we have good confidence
      errors,
      hasMinimumInfo,
      confidence: bankDetails.confidence
    };
  }
}

module.exports = new ImageProcessingService();

const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const logger = require('../utils/logger');

class OCRService {
  constructor() {
    this.visionClient = new vision.ImageAnnotatorClient();
    this.supportedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp'
    ];
  }

  async extractText(imageStreamOrBuffer, options = {}) {
    let tempFilePath = null;
    
    try {
      // Save stream to temporary file
      tempFilePath = await this.saveInputToFile(imageStreamOrBuffer);
      
      // Preprocess image for better OCR results
      const processedImagePath = await this.preprocessImage(tempFilePath);
      
      // Perform OCR
      const ocrResult = await this.performOCR(processedImagePath, options);
      
      // Clean up temporary files
      this.cleanupFiles([tempFilePath, processedImagePath]);
      
      return ocrResult;
    } catch (error) {
      logger.error('OCR extraction failed', { error: error.message });
      
      // Clean up temporary files
      if (tempFilePath) {
        this.cleanupFiles([tempFilePath]);
      }
      
      throw error;
    }
  }

  async saveInputToFile(streamOrBuffer) {
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `ocr_${Date.now()}.jpg`);
    const writeStream = fs.createWriteStream(tempFilePath);
    
    const stream = Buffer.isBuffer(streamOrBuffer) ? Readable.from(streamOrBuffer) : streamOrBuffer;
    return new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on('finish', () => resolve(tempFilePath));
      writeStream.on('error', reject);
    });
  }

  async preprocessImage(imagePath) {
    try {
      const outputPath = imagePath.replace('.jpg', '_processed.jpg');
      
      await sharp(imagePath)
        .grayscale() // Convert to grayscale
        .normalize() // Normalize the image
        .sharpen() // Sharpen for better text recognition
        .resize({ width: 1200, withoutEnlargement: true }) // Resize for optimal OCR
        .jpeg({ quality: 90 })
        .toFile(outputPath);
      
      return outputPath;
    } catch (error) {
      logger.warn('Image preprocessing failed, using original', { error: error.message });
      return imagePath;
    }
  }

  async performOCR(imagePath, options = {}) {
    try {
      const [result] = await this.visionClient.documentTextDetection(imagePath);
      const annotation = result.fullTextAnnotation || {};
      const extractedText = annotation.text || result.textAnnotations?.[0]?.description || '';
      const pages = annotation.pages || [];
      const wordCount = pages.reduce((count, page) => {
        const blocks = page.blocks || [];
        return count + blocks.reduce((bCount, block) => {
          const paragraphs = block.paragraphs || [];
          return bCount + paragraphs.reduce((pCount, para) => pCount + (para.words?.length || 0), 0);
        }, 0);
      }, 0);

      // Post-process the extracted text
      const processedText = this.postProcessText(extractedText);
      
      // Extract potential financial information
      const extractedData = this.extractFinancialInfo(processedText);

      return {
        text: processedText,
        confidence: wordCount > 0 ? 90 : 0,
        extractedData,
        rawData: {
          pagesCount: pages.length,
          textAnnotations: result.textAnnotations?.length || 0
        }
      };
    } catch (error) {
      logger.error('Google Vision OCR failed', { error: error.message, imagePath });
      throw new Error('OCR processing failed');
    }
  }

  postProcessText(rawText) {
    if (!rawText) return '';
    
    return rawText
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[^\w\s.,;:!?()\[\]{}@#$%&*+=/_|~`"'-]/g, '') // Remove invalid characters
      .trim();
  }

  extractFinancialInfo(text) {
    const extractedData = {};
    
    // Extract phone numbers
    const phoneNumbers = text.match(/\b(0[789][01]\d{8}|\+234[789][01]\d{8})\b/g);
    if (phoneNumbers) {
      extractedData.phoneNumbers = phoneNumbers.map(num => 
        num.startsWith('+234') ? '0' + num.slice(4) : num
      );
    }

    // Extract amounts (Nigerian currency patterns)
    const amounts = text.match(/(?:₦|NGN|N|naira)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi);
    if (amounts) {
      extractedData.amounts = amounts.map(amount => 
        amount.replace(/[₦NGNnaira\s]/gi, '').replace(',', '')
      );
    }

    // Extract account numbers (10 digits for Nigerian banks)
    const accountNumbers = text.match(/\b\d{10}\b/g);
    if (accountNumbers) {
      extractedData.accountNumbers = accountNumbers;
    }

    // Extract bank names (comprehensive Nigerian banks list)
    const bankNames = text.match(/\b(GTBank|GTB|UBA|Zenith|First Bank|FirstBank|FBN|Access|Fidelity|Union|Sterling|Wema|FCMB|Ecobank|Diamond|Heritage|Keystone|Polaris|Providus|Stanbic|Standard Chartered|SunTrust|Citibank|Unity|Globus|Jaiz|TAJ|VFD|Parallex|PremiumTrust|Coronation|Rand Merchant|FBNQuest|Signature|Nova|Optimus|Bowen|Sparkle|Mutual|NPF|Titan Trust|TCF|Covenant|Moniepoint|Opay|Palmpay|Kuda|Carbon|ALAT|V Bank|Rubies|Fintech|Mintyn|Fairmoney|Branch|Eyowo|Flutterwave|Paystack|9 Payment|9pay|Monie|Rubies MFB|Rubies|MFB|Microfinance|Micro Finance|GT Bank|Guaranty Trust|First Bank of Nigeria|United Bank for Africa|Zenith Bank|Access Bank|Fidelity Bank|Union Bank|Sterling Bank|Wema Bank|First City Monument Bank|Eco Bank|Heritage Bank|Keystone Bank|Polaris Bank|Providus Bank|Stanbic IBTC|Standard Chartered Bank|SunTrust Bank|Citibank Nigeria|Unity Bank|Jaiz Bank|TAJ Bank|VFD Microfinance|Parallex Bank|PremiumTrust Bank|Coronation Bank|Rand Merchant Bank|FBNQuest Merchant Bank|Signature Bank|Nova Merchant Bank|Optimus Bank|Bowen Microfinance Bank|Sparkle Microfinance Bank|Mutual Trust Microfinance Bank|NPF Microfinance Bank|Titan Trust Bank|TCF Microfinance Bank|Covenant Microfinance Bank|Moniepoint Microfinance Bank|Opay Microfinance Bank|PalmPay Microfinance Bank|Kuda Microfinance Bank|Carbon Microfinance Bank|ALAT by Wema|V Bank Microfinance|Rubies Microfinance Bank|Fintech Microfinance Bank|Mintyn Microfinance Bank|Fairmoney Microfinance Bank|Branch Microfinance Bank|Eyowo Microfinance Bank|Flutterwave Microfinance Bank|Paystack Microfinance Bank)\b/gi);
    if (bankNames) {
      extractedData.bankNames = [...new Set(bankNames.map(name => name.toLowerCase().trim()))];
    }

    // Extract BVN (11 digits)
    const bvnNumbers = text.match(/\b\d{11}\b/g);
    if (bvnNumbers) {
      extractedData.bvnNumbers = bvnNumbers;
    }

    // Extract names (capitalize first letters)
    const namePatterns = text.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g);
    if (namePatterns) {
      extractedData.names = namePatterns;
    }

    // Extract dates
    const dates = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g);
    if (dates) {
      extractedData.dates = dates;
    }

    return extractedData;
  }

  cleanupFiles(filePaths) {
    filePaths.forEach(filePath => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          logger.warn('Failed to cleanup temp file', { filePath, error: error.message });
        }
      }
    });
  }

  // Specialized methods for different document types
  async extractBankDetails(imageStream) {
    const result = await this.extractText(imageStream, {
      psm: 6, // Uniform block of text
      language: 'eng'
    });

    return {
      ...result,
      bankDetails: {
        accountNumbers: result.extractedData.accountNumbers || [],
        bankNames: result.extractedData.bankNames || [],
        accountHolderNames: result.extractedData.names || []
      }
    };
  }

  async extractIDDocument(imageStream) {
    const result = await this.extractText(imageStream, {
      psm: 6,
      language: 'eng'
    });

    return {
      ...result,
      idDetails: {
        names: result.extractedData.names || [],
        dates: result.extractedData.dates || [],
        bvnNumbers: result.extractedData.bvnNumbers || []
      }
    };
  }

  async extractReceiptData(imageStream) {
    const result = await this.extractText(imageStream, {
      psm: 6,
      language: 'eng'
    });

    return {
      ...result,
      receiptDetails: {
        amounts: result.extractedData.amounts || [],
        phoneNumbers: result.extractedData.phoneNumbers || [],
        dates: result.extractedData.dates || []
      }
    };
  }
}

module.exports = new OCRService();
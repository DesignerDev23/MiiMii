const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class OCRService {
  constructor() {
    this.supportedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp'
    ];
  }

  async extractText(imageStream, options = {}) {
    let tempFilePath = null;
    
    try {
      // Save stream to temporary file
      tempFilePath = await this.saveStreamToFile(imageStream);
      
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

  async saveStreamToFile(stream) {
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `ocr_${Date.now()}.jpg`);
    const writeStream = fs.createWriteStream(tempFilePath);
    
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
    const {
      language = 'eng',
      psm = 6, // Uniform block of text
      oem = 3  // Default OCR Engine Mode
    } = options;

    try {
      const { data } = await Tesseract.recognize(
        imagePath,
        language,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              logger.debug(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          },
          tessedit_pageseg_mode: psm,
          tessedit_ocr_engine_mode: oem,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?-()[]{}@#$%&*+=/_|~`"\'',
        }
      );

      // Post-process the extracted text
      const processedText = this.postProcessText(data.text);
      
      // Extract potential financial information
      const extractedData = this.extractFinancialInfo(processedText);

      return {
        text: processedText,
        confidence: data.confidence,
        extractedData,
        rawData: {
          words: data.words,
          lines: data.lines,
          paragraphs: data.paragraphs
        }
      };
    } catch (error) {
      logger.error('Tesseract OCR failed', { error: error.message, imagePath });
      throw new Error('OCR processing failed');
    }
  }

  postProcessText(rawText) {
    if (!rawText) return '';
    
    return rawText
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[^\w\s.,;:!?-()[\]{}@#$%&*+=/_|~`"']/g, '') // Remove invalid characters
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

    // Extract account numbers (typically 10 digits)
    const accountNumbers = text.match(/\b\d{10}\b/g);
    if (accountNumbers) {
      extractedData.accountNumbers = accountNumbers;
    }

    // Extract bank names (common Nigerian banks)
    const bankNames = text.match(/\b(GTBank|UBA|Zenith|First Bank|Access|Fidelity|Union|Sterling|Wema|FCMB|Ecobank|Diamond|Heritage|Keystone|Polaris|Providus|Stanbic|Standard Chartered|SunTrust|Citibank|Unity|Globus|Jaiz|TAJ|VFD|Parallex|PremiumTrust|Coronation|Rand Merchant|FBN|FBNQuest|Signature|Nova|Optimus|Bowen|Sparkle|Mutual|NPF|Titan Trust|TCF|Covenant|Moniepoint|Opay|Palmpay|Kuda|Carbon|ALAT|V Bank|Rubies|Fintech|Mintyn|Fairmoney|Branch|Eyowo|Flutterwave|Paystack)\b/gi);
    if (bankNames) {
      extractedData.bankNames = [...new Set(bankNames.map(name => name.toLowerCase()))];
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
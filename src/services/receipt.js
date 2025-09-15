const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const logger = require('../utils/logger');

class ReceiptService {
  constructor() {
    this.fontPath = path.join(__dirname, '../../assets/fonts');
    this.logoPath = path.join(__dirname, '../../assets/images');
    this.templatePath = path.join(__dirname, '../../assets/templates');
    
    // High-quality scaling factor for better image resolution
    this.scale = 2; // 2x scaling for 800x1200 instead of 400x600
    
    // Register Google Outfit font if available
    try {
      const outfitFontPath = path.join(this.fontPath, 'Outfit-Regular.ttf');
      const outfitBoldFontPath = path.join(this.fontPath, 'Outfit-Bold.ttf');
      
      if (fs.existsSync(outfitFontPath)) {
        registerFont(outfitFontPath, { family: 'Outfit' });
        logger.info('Google Outfit font registered successfully');
      }
      
      if (fs.existsSync(outfitBoldFontPath)) {
        registerFont(outfitBoldFontPath, { family: 'Outfit Bold' });
        logger.info('Google Outfit Bold font registered successfully');
      }
    } catch (error) {
      logger.warn('Font registration failed, using default fonts', { error: error.message });
    }
  }

  // Helper method to scale coordinates and dimensions
  scale(value) {
    return value * this.scale;
  }

  async loadLogo() {
    try {
      const logoPath = path.join(this.logoPath, 'logo.png');
      if (fs.existsSync(logoPath)) {
        const logo = await loadImage(logoPath);
        logger.info('Logo loaded successfully');
        return logo;
      } else {
        logger.warn('Logo file not found, using placeholder');
        return null;
      }
    } catch (error) {
      logger.warn('Failed to load logo, using placeholder', { error: error.message });
      return null;
    }
  }

  async generateReceipt(transactionData) {
    try {
      const {
        transactionType,
        amount,
        sender,
        beneficiary,
        reference,
        date,
        status = 'Successful',
        remark = '',
        charges = 0,
        discount = 0
      } = transactionData;

      // Create high-quality canvas
      const canvas = createCanvas(this.scale(400), this.scale(600));
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.scale(400), this.scale(600));

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.scale(400), this.scale(80));

      // Load and draw logo
      const logo = await this.loadLogo();
      if (logo) {
        // Calculate logo dimensions to fit in header
        const logoSize = 40;
        const logoX = 30;
        const logoY = 20;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } else {
        // Logo placeholder (red swirl)
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(50, 40, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${this.scale(24)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', this.scale(200), this.scale(35));

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = `bold italic ${this.scale(28)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = `${this.scale(12)}px Outfit, Arial`;
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, this.scale(200), this.scale(140));

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 320);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: transactionType || 'Bank Transfer' },
        { label: 'Transaction Date', value: date },
        { label: 'Sender', value: sender || 'N/A' },
        { label: 'Beneficiary', value: beneficiary || 'N/A' },
        { label: 'Remark', value: remark || 'N/A' },
        { label: 'Transaction Fee', value: `₦ ${parseFloat(charges || 0).toLocaleString()}.00` },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(detail.label, 40, yPos);

        // Separator line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        // Value
        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = `${this.scale(10)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 520);
      ctx.fillText('please call +234 090 433 39590, +234 906 048 9754 or send an email', this.scale(200), this.scale(535));
      ctx.fillText('to contactcenter@chatmiimii.com', this.scale(200), this.scale(550));

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 570);
      ctx.lineTo(350, 570);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${this.scale(14)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', this.scale(200), this.scale(590));

      // Convert to buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 1.0 });
      
      // Validate the generated buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Failed to generate valid image buffer');
      }
      
      const bufferSizeInKB = buffer.length / 1024;
      logger.info('Receipt generated successfully', {
        reference,
        transactionType,
        amount,
        bufferSize: `${bufferSizeInKB.toFixed(2)}KB`
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate receipt', { error: error.message, transactionData });
      throw error;
    }
  }

  async generateAirtimeReceipt(transactionData) {
    try {
      const {
        network,
        phoneNumber,
        amount,
        reference,
        date,
        status = 'Successful',
        discount = 0
      } = transactionData;

      // Create high-quality canvas
      const canvas = createCanvas(this.scale(400), this.scale(600));
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.scale(400), this.scale(600));

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.scale(400), this.scale(80));

      // Load and draw logo
      const logo = await this.loadLogo();
      if (logo) {
        // Calculate logo dimensions to fit in header
        const logoSize = 40;
        const logoX = 30;
        const logoY = 20;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } else {
        // Logo placeholder (red swirl)
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(50, 40, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${this.scale(24)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', this.scale(200), this.scale(35));

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = `bold italic ${this.scale(28)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = `${this.scale(12)}px Outfit, Arial`;
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, this.scale(200), this.scale(140));

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 320);

      // Transaction details (removed discount as requested)
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: 'Airtime Purchase' },
        { label: 'Transaction Date', value: date },
        { label: 'Network', value: network },
        { label: 'Phone Number', value: phoneNumber },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(detail.label, 40, yPos);

        // Separator line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        // Value
        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = `${this.scale(10)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 520);
      ctx.fillText('please call +234 090 433 39590, +234 906 048 9754 or send an email', this.scale(200), this.scale(535));
      ctx.fillText('to contactcenter@chatmiimii.com', this.scale(200), this.scale(550));

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 570);
      ctx.lineTo(350, 570);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${this.scale(14)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', this.scale(200), this.scale(590));

      // Convert to buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 1.0 });
      
      // Validate the generated buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Failed to generate valid image buffer');
      }
      
      const bufferSizeInKB = buffer.length / 1024;
      logger.info('Airtime receipt generated successfully', {
        reference,
        network,
        phoneNumber,
        amount,
        bufferSize: `${bufferSizeInKB.toFixed(2)}KB`
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate airtime receipt', { error: error.message, transactionData });
      throw error;
    }
  }

  async generateDataReceipt(transactionData) {
    try {
      const {
        network,
        phoneNumber,
        dataPlan,
        amount,
        reference,
        date,
        status = 'Successful',
        discount = 0
      } = transactionData;

      // Create high-quality canvas
      const canvas = createCanvas(this.scale(400), this.scale(600));
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.scale(400), this.scale(600));

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.scale(400), this.scale(80));

      // Load and draw logo
      const logo = await this.loadLogo();
      if (logo) {
        const logoSize = 40;
        const logoX = 30;
        const logoY = 20;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(50, 40, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${this.scale(24)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', this.scale(200), this.scale(35));

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = `bold italic ${this.scale(28)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = `${this.scale(12)}px Outfit, Arial`;
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, this.scale(200), this.scale(140));

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 320);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: 'Data Purchase' },
        { label: 'Transaction Date', value: date },
        { label: 'Network', value: network },
        { label: 'Phone Number', value: phoneNumber },
        { label: 'Data Plan', value: dataPlan },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(detail.label, 40, yPos);

        // Separator line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        // Value
        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = `${this.scale(10)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 520);
      ctx.fillText('please call +234 090 433 39590, +234 906 048 9754 or send an email', this.scale(200), this.scale(535));
      ctx.fillText('to contactcenter@chatmiimii.com', this.scale(200), this.scale(550));

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 570);
      ctx.lineTo(350, 570);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${this.scale(14)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', this.scale(200), this.scale(590));

      // Convert to buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 1.0 });
      
      // Validate the generated buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Failed to generate valid image buffer');
      }
      
      const bufferSizeInKB = buffer.length / 1024;
      logger.info('Data receipt generated successfully', {
        reference,
        network,
        phoneNumber,
        dataPlan,
        amount,
        bufferSize: `${bufferSizeInKB.toFixed(2)}KB`
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate data receipt', { error: error.message, transactionData });
      throw error;
    }
  }

  async generateElectricityReceipt(transactionData) {
    try {
      const {
        disco,
        meterType,
        meterNumber,
        amount,
        charges,
        reference,
        date,
        status = 'Successful',
        token = null
      } = transactionData;

      // Create high-quality canvas
      const canvas = createCanvas(this.scale(400), this.scale(650));
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.scale(400), this.scale(650));

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.scale(400), this.scale(80));

      // Load and draw logo
      const logo = await this.loadLogo();
      if (logo) {
        const logoSize = 40;
        const logoX = 30;
        const logoY = 20;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(50, 40, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${this.scale(24)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', this.scale(200), this.scale(35));

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = `bold italic ${this.scale(28)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = `${this.scale(12)}px Outfit, Arial`;
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, this.scale(200), this.scale(140));

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 370);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: 'Electricity Bill Payment' },
        { label: 'Transaction Date', value: date },
        { label: 'Disco', value: disco },
        { label: 'Meter Type', value: meterType },
        { label: 'Meter Number', value: meterNumber },
        { label: 'Charges', value: `₦ ${parseFloat(charges).toLocaleString()}.00` },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(detail.label, 40, yPos);

        // Separator line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        // Value
        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Add token if available
      if (token) {
        yPos += 10;
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText('Meter Token', 40, yPos);

        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(token, 360, yPos);
      }

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = `${this.scale(10)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 570);
      ctx.fillText('please call +234 090 433 39590, +234 906 048 9754 or send an email', this.scale(200), this.scale(585));
      ctx.fillText('to contactcenter@chatmiimii.com', this.scale(200), this.scale(600));

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 620);
      ctx.lineTo(350, 620);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${this.scale(14)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', this.scale(200), this.scale(640));

      // Convert to buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 1.0 });
      
      // Validate the generated buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Failed to generate valid image buffer');
      }
      
      const bufferSizeInKB = buffer.length / 1024;
      logger.info('Electricity receipt generated successfully', {
        reference,
        disco,
        meterNumber,
        amount,
        bufferSize: `${bufferSizeInKB.toFixed(2)}KB`
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate electricity receipt', { error: error.message, transactionData });
      throw error;
    }
  }

  async generateTransferReceipt(transactionData) {
    try {
      const {
        type,
        amount,
        fee,
        totalAmount,
        recipientName,
        recipientBank,
        recipientAccount,
        reference,
        date,
        status = 'Successful',
        senderName
      } = transactionData;

      // Create high-quality canvas
      const canvas = createCanvas(this.scale(400), this.scale(650));
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.scale(400), this.scale(650));

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.scale(400), this.scale(80));

      // Load and draw logo
      const logo = await this.loadLogo();
      if (logo) {
        const logoSize = 40;
        const logoX = 30;
        const logoY = 20;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.arc(50, 40, 20, 0, 2 * Math.PI);
        ctx.fill();
      }

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${this.scale(24)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', this.scale(200), this.scale(35));

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = `bold italic ${this.scale(28)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = `${this.scale(12)}px Outfit, Arial`;
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, this.scale(200), this.scale(140));

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 370);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: type },
        { label: 'Transaction Date', value: date },
        { label: 'Recipient Name', value: recipientName },
        { label: 'Recipient Bank', value: recipientBank },
        { label: 'Recipient Account', value: recipientAccount },
        { label: 'Transaction Fee', value: `₦ ${parseFloat(fee).toLocaleString()}.00` },
        { label: 'Total Amount', value: `₦ ${parseFloat(totalAmount).toLocaleString()}.00` },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(detail.label, 40, yPos);

        // Separator line
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, yPos + 5);
        ctx.lineTo(360, yPos + 5);
        ctx.stroke();

        // Value
        ctx.fillStyle = '#000000';
        ctx.font = `${this.scale(12)}px Outfit, Arial`;
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = `${this.scale(10)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 570);
      ctx.fillText('please call +234 090 433 39590, +234 906 048 9754 or send an email', this.scale(200), this.scale(585));
      ctx.fillText('to contactcenter@chatmiimii.com', this.scale(200), this.scale(600));

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 620);
      ctx.lineTo(350, 620);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${this.scale(14)}px Outfit, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', this.scale(200), this.scale(640));

      // Convert to buffer
      const buffer = canvas.toBuffer('image/jpeg', { quality: 1.0 });
      
      // Validate the generated buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Failed to generate valid image buffer');
      }
      
      const bufferSizeInKB = buffer.length / 1024;
      logger.info('Transfer receipt generated successfully', {
        reference,
        recipientName,
        amount,
        bufferSize: `${bufferSizeInKB.toFixed(2)}KB`
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate transfer receipt', { error: error.message, transactionData });
      throw error;
    }
  }
}

module.exports = new ReceiptService();

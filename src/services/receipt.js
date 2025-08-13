const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const logger = require('../utils/logger');

class ReceiptService {
  constructor() {
    this.fontPath = path.join(__dirname, '../../assets/fonts');
    this.templatePath = path.join(__dirname, '../../assets/templates');
    
    // Register fonts if available
    try {
      if (fs.existsSync(path.join(this.fontPath, 'Arial.ttf'))) {
        registerFont(path.join(this.fontPath, 'Arial.ttf'), { family: 'Arial' });
      }
    } catch (error) {
      logger.warn('Font registration failed, using default fonts', { error: error.message });
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

      // Create canvas
      const canvas = createCanvas(400, 600);
      const ctx = canvas.getContext('2d');

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 600);

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 400, 80);

      // Logo placeholder (red swirl)
      ctx.fillStyle = '#ff6666';
      ctx.beginPath();
      ctx.arc(50, 40, 20, 0, 2 * Math.PI);
      ctx.fill();

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', 200, 35);

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = 'bold italic 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = '12px Arial';
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, 200, 140);

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 320);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: transactionType },
        { label: 'Transaction Date', value: date },
        { label: 'Sender', value: sender || 'N/A' },
        { label: 'Beneficiary', value: beneficiary || 'N/A' },
        { label: 'Remark', value: remark || 'N/A' },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 12px Arial';
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
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 520);
      ctx.fillText('please call +234 907 110 2959, +234 701 405 5875 or send an email', 200, 535);
      ctx.fillText('to contactcenter@chatmiimiiai.com', 200, 550);

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 570);
      ctx.lineTo(350, 570);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', 200, 590);

      // Convert to buffer
      const buffer = canvas.toBuffer('image/png');
      
      logger.info('Receipt generated successfully', {
        reference,
        transactionType,
        amount
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

      // Create canvas
      const canvas = createCanvas(400, 600);
      const ctx = canvas.getContext('2d');

      // Set background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 600);

      // Header
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 400, 80);

      // Logo placeholder (red swirl)
      ctx.fillStyle = '#ff6666';
      ctx.beginPath();
      ctx.arc(50, 40, 20, 0, 2 * Math.PI);
      ctx.fill();

      // MiiMii.AI title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('MiiMii.AI', 200, 35);

      // Transaction Receipt title
      ctx.fillStyle = '#000000';
      ctx.font = 'bold italic 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Transaction Receipt', 200, 120);

      // Generated date
      ctx.font = '12px Arial';
      ctx.fillStyle = '#666666';
      ctx.fillText(`Generated from The MiiMii AI on ${date}`, 200, 140);

      // Content area background
      ctx.fillStyle = '#f0f8f0';
      ctx.fillRect(20, 160, 360, 320);

      // Transaction details
      const details = [
        { label: 'Transaction Amount', value: `₦ ${parseFloat(amount).toLocaleString()}.00` },
        { label: 'Transaction Type', value: 'Airtime Purchase' },
        { label: 'Transaction Date', value: date },
        { label: 'Network', value: network },
        { label: 'Phone Number', value: phoneNumber },
        { label: 'Discount', value: discount > 0 ? `₦ ${discount}.00` : '₦ 0.00' },
        { label: 'Transaction Reference', value: reference },
        { label: 'Transaction Status', value: status }
      ];

      let yPos = 180;
      details.forEach((detail, index) => {
        // Label
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 12px Arial';
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
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(detail.value, 360, yPos);

        yPos += 35;
      });

      // Footer
      ctx.fillStyle = '#666666';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('If you have any questions or would like more information,', 200, 520);
      ctx.fillText('please call +234 907 110 2959, +234 701 405 5875 or send an email', 200, 535);
      ctx.fillText('to contactcenter@chatmiimiiai.com', 200, 550);

      // Red line
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 570);
      ctx.lineTo(350, 570);
      ctx.stroke();

      // Thank you message
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Thank you for using The MiiMii.AI', 200, 590);

      // Convert to buffer
      const buffer = canvas.toBuffer('image/png');
      
      logger.info('Airtime receipt generated successfully', {
        reference,
        network,
        phoneNumber,
        amount
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to generate airtime receipt', { error: error.message, transactionData });
      throw error;
    }
  }
}

module.exports = new ReceiptService();

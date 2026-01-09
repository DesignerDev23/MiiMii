const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
// Models removed - using Supabase client instead
const transactionService = require('./transaction');
const emailService = require('./emailService');

class StatementService {
  async generateStatement(user, options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
        endDate = new Date(),
        type = null, // 'credit', 'debit', or null for all
        category = null, // Transaction category filter
        limit = 1000
      } = options;

      // Build query
      const where = {
        userId: user.id,
        createdAt: {
          [require('sequelize').Op.between]: [startDate, endDate]
        }
      };

      if (type) {
        where.type = type;
      }

      if (category) {
        where.category = category;
      }

      // Fetch transactions
      const transactions = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('transactions', where, {
          orderBy: 'createdAt',
          order: 'desc',
          limit: parseInt(limit, 10)
        });
      });

      // Generate PDF
      const pdfBuffer = await this.generateStatementPDF(user, transactions, {
        startDate,
        endDate,
        type,
        category
      });

      const fileName = `MiiMii_Statement_${user.id}_${Date.now()}.pdf`;

      return {
        success: true,
        pdfBuffer,
        fileName,
        transactionCount: transactions.length,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    } catch (error) {
      logger.error('Failed to generate statement', {
        error: error.message,
        userId: user.id
      });
      throw error;
    }
  }

  async generateStatementPDF(user, transactions, options = {}) {
    const { startDate, endDate, type, category } = options;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: 'MiiMii Account Statement',
            Author: 'MiiMii',
            Subject: 'Account Statement',
            Creator: 'MiiMii Platform'
          }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header with gradient effect (simulated)
        doc.rect(0, 0, 595, 100)
           .fillColor('#6366f1')
           .fill();

        // Logo placeholder
        doc.fillColor('#ffffff')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text('MiiMii', 50, 35, { align: 'left' });

        doc.fillColor('#ffffff')
           .fontSize(12)
           .font('Helvetica')
           .text('Your Digital Financial Assistant', 50, 65, { align: 'left' });

        // Reset color
        doc.fillColor('#000000');

        // Account Information Section
        doc.moveTo(50, 120)
           .lineTo(545, 120)
           .strokeColor('#e5e7eb')
           .stroke();

        doc.fontSize(18)
           .font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Account Statement', 50, 140);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#6b7280')
           .text(`Generated: ${new Date().toLocaleString('en-US', { 
             year: 'numeric', 
             month: 'long', 
             day: 'numeric',
             hour: '2-digit',
             minute: '2-digit'
           })}`, 50, 170);

        // User Information Box
        const userInfoY = 200;
        doc.rect(50, userInfoY, 495, 80)
           .fillColor('#f9fafb')
           .fill()
           .strokeColor('#e5e7eb')
           .stroke();

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Account Holder:', 60, userInfoY + 15);

        doc.font('Helvetica')
           .fillColor('#4b5563')
           .text(`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.whatsappNumber, 60, userInfoY + 30);

        doc.font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Phone Number:', 60, userInfoY + 50);

        doc.font('Helvetica')
           .fillColor('#4b5563')
           .text(user.whatsappNumber, 60, userInfoY + 65);

        doc.font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Email:', 300, userInfoY + 15);

        doc.font('Helvetica')
           .fillColor('#4b5563')
           .text(user.appEmail || user.email || 'N/A', 300, userInfoY + 30);

        doc.font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Statement Period:', 300, userInfoY + 50);

        doc.font('Helvetica')
           .fillColor('#4b5563')
           .text(`${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 300, userInfoY + 65);

        // Summary Section
        const summaryY = 300;
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Summary', 50, summaryY);

        // Calculate totals
        const credits = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const debits = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const fees = transactions.reduce((sum, t) => sum + parseFloat(t.fee || 0), 0);

        const summaryBoxY = summaryY + 25;
        doc.rect(50, summaryBoxY, 495, 60)
           .fillColor('#f0f9ff')
           .fill()
           .strokeColor('#bfdbfe')
           .stroke();

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#1e40af')
           .text('Total Credits:', 60, summaryBoxY + 10);

        doc.font('Helvetica')
           .fillColor('#1e3a8a')
           .text(`₦${credits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, summaryBoxY + 25);

        doc.font('Helvetica-Bold')
           .fillColor('#1e40af')
           .text('Total Debits:', 200, summaryBoxY + 10);

        doc.font('Helvetica')
           .fillColor('#1e3a8a')
           .text(`₦${debits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, summaryBoxY + 25);

        doc.font('Helvetica-Bold')
           .fillColor('#1e40af')
           .text('Total Fees:', 340, summaryBoxY + 10);

        doc.font('Helvetica')
           .fillColor('#1e3a8a')
           .text(`₦${fees.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 340, summaryBoxY + 25);

        doc.font('Helvetica-Bold')
           .fillColor('#1e40af')
           .text('Transactions:', 480, summaryBoxY + 10);

        doc.font('Helvetica')
           .fillColor('#1e3a8a')
           .text(`${transactions.length}`, 480, summaryBoxY + 25);

        // Transactions Table
        let tableY = summaryBoxY + 90;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text('Transaction Details', 50, tableY);

        tableY += 25;

        // Table Header
        doc.rect(50, tableY, 495, 25)
           .fillColor('#6366f1')
           .fill();

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#ffffff')
           .text('Date', 55, tableY + 8)
           .text('Type', 120, tableY + 8)
           .text('Description', 180, tableY + 8)
           .text('Amount', 380, tableY + 8)
           .text('Status', 450, tableY + 8)
           .text('Reference', 500, tableY + 8);

        tableY += 30;

        // Table Rows
        transactions.forEach((transaction, index) => {
          // Check if we need a new page
          if (tableY > 700) {
            doc.addPage();
            tableY = 50;
          }

          const isCredit = transaction.type === 'credit';
          const rowColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';

          doc.rect(50, tableY, 495, 20)
             .fillColor(rowColor)
             .fill()
             .strokeColor('#e5e7eb')
             .stroke();

          const date = new Date(transaction.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });

          const time = new Date(transaction.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#4b5563')
             .text(date, 55, tableY + 5)
             .text(time, 55, tableY + 13)
             .text(transaction.type.toUpperCase(), 120, tableY + 9)
             .text((transaction.description || transaction.category || 'N/A').substring(0, 25), 180, tableY + 9, { width: 190, ellipsis: true })
             .fillColor(isCredit ? '#10b981' : '#ef4444')
             .text(
               `${isCredit ? '+' : '-'}₦${parseFloat(transaction.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
               380,
               tableY + 9
             )
             .fillColor('#4b5563')
             .text(transaction.status.toUpperCase(), 450, tableY + 9)
             .text(transaction.reference.substring(0, 8), 500, tableY + 9);

          tableY += 20;
        });

        // Footer
        const footerY = 750;
        doc.moveTo(50, footerY)
           .lineTo(545, footerY)
           .strokeColor('#e5e7eb')
           .stroke();

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#6b7280')
           .text('This is a computer-generated statement. No signature required.', 50, footerY + 10, { align: 'center' })
           .text('For inquiries, contact support@miimii.ai', 50, footerY + 20, { align: 'center' })
           .text(`© ${new Date().getFullYear()} MiiMii. All rights reserved.`, 50, footerY + 30, { align: 'center' });

        // Page numbers
        let pageNumber = 1;
        doc.on('pageAdded', () => {
          pageNumber++;
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#9ca3af')
             .text(`Page ${pageNumber}`, 50, doc.page.height - 30, { align: 'right' });
        });

        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#9ca3af')
           .text('Page 1', 50, doc.page.height - 30, { align: 'right' });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async requestStatement(user, options = {}) {
    try {
      // Generate statement
      const statement = await this.generateStatement(user, options);

      // Get user email
      const email = user.appEmail || user.email;
      if (!email) {
        throw new Error('User email not found. Please update your email address in settings.');
      }

      // Send via email
      const emailResult = await emailService.sendStatement(email, {
        pdfBuffer: statement.pdfBuffer,
        fileName: statement.fileName,
        startDate: statement.startDate,
        endDate: statement.endDate,
        transactionCount: statement.transactionCount
      });

      if (!emailResult.success) {
        logger.warn('Failed to send statement via email, but PDF was generated', {
          userId: user.id,
          error: emailResult.error
        });
        // Still return success with PDF buffer for download
      }

      return {
        success: true,
        message: emailResult.success 
          ? 'Statement generated and sent to your email' 
          : 'Statement generated. Email sending failed, but PDF is available for download.',
        statement: {
          pdfBuffer: statement.pdfBuffer.toString('base64'), // Base64 for API response
          fileName: statement.fileName,
          transactionCount: statement.transactionCount,
          startDate: statement.startDate,
          endDate: statement.endDate
        },
        emailSent: emailResult.success
      };
    } catch (error) {
      logger.error('Failed to request statement', {
        error: error.message,
        userId: user.id
      });
      throw error;
    }
  }
}

module.exports = new StatementService();


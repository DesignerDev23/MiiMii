const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { supabase } = require('../database/connection');
const emailService = require('./emailService');

class StatementService {
  constructor() {
    // Font paths
    this.fontPath = path.join(__dirname, '../../assets/fonts');
    this.logoPath = path.join(__dirname, '../../assets/images/logo.png');
    
    // Font file paths
    this.outfitRegularPath = path.join(this.fontPath, 'Outfit-Regular.ttf');
    this.outfitBoldPath = path.join(this.fontPath, 'Outfit-Bold.ttf');
    
    // Check if fonts exist
    this.hasOutfitRegular = fs.existsSync(this.outfitRegularPath);
    this.hasOutfitBold = fs.existsSync(this.outfitBoldPath);
    
    if (this.hasOutfitRegular) {
      logger.info('Google Outfit Regular font found');
    }
    if (this.hasOutfitBold) {
      logger.info('Google Outfit Bold font found');
    }
  }

  // Helper method to get font path or fallback
  // PDFKit supports TTF fonts when passed as file paths directly to .font()
  // If font file doesn't work, it will fall back to built-in fonts
  getFont(fontName) {
    try {
      if (fontName === 'Outfit' && this.hasOutfitRegular && fs.existsSync(this.outfitRegularPath)) {
        return this.outfitRegularPath; // Return file path for PDFKit
      }
      if (fontName === 'Outfit-Bold' && this.hasOutfitBold && fs.existsSync(this.outfitBoldPath)) {
        return this.outfitBoldPath; // Return file path for PDFKit
      }
    } catch (error) {
      logger.debug('Font path check failed, using fallback', { error: error.message });
    }
    // Fallback to built-in fonts (Helvetica)
    return fontName === 'Outfit-Bold' ? 'Helvetica-Bold' : 'Helvetica';
  }

  /**
   * Get date range based on preset options
   */
  getDateRange(rangeType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let startDate, endDate;

    switch (rangeType) {
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'last_3_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case 'last_30_days':
      default:
        startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = new Date(now);
        break;
    }

    return { startDate, endDate };
  }

  async generateStatement(user, options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
        endDate = new Date(),
        type = null, // 'credit', 'debit', or null for all
        category = null, // Transaction category filter
        limit = 1000
      } = options;

      logger.info('Generating statement', {
        userId: user.id,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        type,
        category,
        limit
      });

      // Build Supabase query
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('userId', user.id)
        .gte('createdAt', startDate.toISOString())
        .lte('createdAt', endDate.toISOString())
        .order('createdAt', { ascending: false })
        .limit(parseInt(limit, 10));

      // Add type filter if specified
      if (type) {
        query = query.eq('type', type);
      }

      // Add category filter if specified
      if (category) {
        query = query.eq('category', category);
      }

      // Execute query
      const { data: transactions, error, count } = await databaseService.executeWithRetry(async () => {
        return await query;
      });

      if (error) {
        throw error;
      }

      logger.info('Transactions fetched for statement', {
        userId: user.id,
        transactionCount: transactions?.length || 0,
        totalCount: count || 0
      });

      // Generate PDF
      const pdfBuffer = await this.generateStatementPDF(user, transactions || [], {
        startDate,
        endDate,
        type,
        category,
        totalCount: count || 0
      });

      const fileName = `MiiMii_Statement_${user.id}_${Date.now()}.pdf`;

      return {
        success: true,
        pdfBuffer,
        fileName,
        transactionCount: transactions?.length || 0,
        totalCount: count || 0,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    } catch (error) {
      logger.error('Failed to generate statement', {
        error: error.message,
        userId: user.id,
        stack: error.stack
      });
      throw error;
    }
  }

  async generateStatementPDF(user, transactions, options = {}) {
    const { startDate, endDate, type, category, totalCount } = options;

    return new Promise(async (resolve, reject) => {
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

        // Load logo if available
        let logo = null;
        if (fs.existsSync(this.logoPath)) {
          try {
            doc.image(this.logoPath, 50, 30, { width: 50, height: 50 });
            logo = true;
          } catch (logoError) {
            logger.warn('Failed to load logo image', { error: logoError.message });
          }
        }

        // Header background - MiiMii brand color (red)
        doc.rect(0, 0, 595, 110)
           .fillColor('#DC2626') // MiiMii red
           .fill();

        // MiiMii text (next to logo if logo exists, otherwise standalone)
        doc.fillColor('#ffffff')
           .fontSize(32)
           .font(this.getFont('Outfit-Bold'))
           .text('MiiMii', logo ? 110 : 50, 35, { align: 'left' });

        doc.fillColor('#ffffff')
           .fontSize(12)
           .font(this.getFont('Outfit'))
           .text('Your Digital Financial Assistant', logo ? 110 : 50, 75, { align: 'left' });

        // Reset color for body content
        doc.fillColor('#000000');

        // Account Information Section
        doc.moveTo(50, 140)
           .lineTo(545, 140)
           .strokeColor('#e5e7eb')
           .stroke();

        doc.fontSize(20)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Account Statement', 50, 160);

        doc.fontSize(10)
           .font(this.getFont('Outfit'))
           .fillColor('#6b7280')
           .text(`Generated: ${new Date().toLocaleString('en-US', { 
             year: 'numeric', 
             month: 'long', 
             day: 'numeric',
             hour: '2-digit',
             minute: '2-digit'
           })}`, 50, 190);

        // User Information Box
        const userInfoY = 220;
        doc.rect(50, userInfoY, 495, 80)
           .fillColor('#f9fafb')
           .fill()
           .strokeColor('#e5e7eb')
           .stroke();

        doc.fontSize(10)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Account Holder:', 60, userInfoY + 15);

        doc.font(this.getFont('Outfit'))
           .fillColor('#4b5563')
           .text(`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.whatsappNumber || 'N/A', 60, userInfoY + 30);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Phone Number:', 60, userInfoY + 50);

        doc.font(this.getFont('Outfit'))
           .fillColor('#4b5563')
           .text(user.whatsappNumber || 'N/A', 60, userInfoY + 65);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Email:', 300, userInfoY + 15);

        doc.font(this.getFont('Outfit'))
           .fillColor('#4b5563')
           .text(user.appEmail || user.email || 'N/A', 300, userInfoY + 30);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Statement Period:', 300, userInfoY + 50);

        doc.font(this.getFont('Outfit'))
           .fillColor('#4b5563')
           .text(`${startDate.toLocaleDateString('en-GB')} - ${endDate.toLocaleDateString('en-GB')}`, 300, userInfoY + 65);

        // Summary Section
        const summaryY = 320;
        doc.fontSize(16)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Summary', 50, summaryY);

        // Calculate totals
        const credits = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const debits = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const fees = transactions.reduce((sum, t) => sum + parseFloat(t.fee || 0), 0);

        const summaryBoxY = summaryY + 25;
        doc.rect(50, summaryBoxY, 495, 70)
           .fillColor('#FEF2F2') // Light red background matching brand
           .fill()
           .strokeColor('#FCA5A5')
           .stroke();

        doc.fontSize(10)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#991B1B')
           .text('Total Credits:', 60, summaryBoxY + 10);

        doc.font(this.getFont('Outfit'))
           .fillColor('#7F1D1D')
           .text(`N${credits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, summaryBoxY + 25);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#991B1B')
           .text('Total Debits:', 200, summaryBoxY + 10);

        doc.font(this.getFont('Outfit'))
           .fillColor('#7F1D1D')
           .text(`N${debits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, summaryBoxY + 25);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#991B1B')
           .text('Total Fees:', 340, summaryBoxY + 10);

        doc.font(this.getFont('Outfit'))
           .fillColor('#7F1D1D')
           .text(`N${fees.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 340, summaryBoxY + 25);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#991B1B')
           .text('Net Amount:', 480, summaryBoxY + 10);

        const netAmount = credits - debits - fees;
        doc.font(this.getFont('Outfit'))
           .fillColor('#7F1D1D')
           .text(`N${netAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, summaryBoxY + 25);

        doc.font(this.getFont('Outfit-Bold'))
           .fillColor('#991B1B')
           .text('Transactions:', 60, summaryBoxY + 45);

        doc.font(this.getFont('Outfit'))
           .fillColor('#7F1D1D')
           .text(`${transactions.length}${totalCount && totalCount > transactions.length ? ` of ${totalCount}` : ''}`, 60, summaryBoxY + 60);

        // Transactions Table
        let tableY = summaryBoxY + 110;
        doc.fontSize(14)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#1f2937')
           .text('Transaction Details', 50, tableY);

        tableY += 25;

        // Table Header - Adjusted column positions for better spacing
        doc.rect(50, tableY, 495, 28)
           .fillColor('#DC2626') // MiiMii brand red
           .fill();

        doc.fontSize(8)
           .font(this.getFont('Outfit-Bold'))
           .fillColor('#ffffff')
           .text('Date', 55, tableY + 9)
           .text('Time', 55, tableY + 18)
           .text('Type', 120, tableY + 13)
           .text('Description', 170, tableY + 13, { width: 180 })
           .text('Amount (N)', 360, tableY + 13, { width: 70, align: 'right' })
           .text('Status', 440, tableY + 13)
           .text('Ref', 490, tableY + 13);

        tableY += 35;

        // Table Rows
        if (transactions.length === 0) {
          doc.fontSize(10)
             .font(this.getFont('Outfit'))
             .fillColor('#6b7280')
             .text('No transactions found for the selected period.', 55, tableY + 10);
        } else {
          transactions.forEach((transaction, index) => {
            // Check if we need a new page
            if (tableY > 750) {
              doc.addPage();
              
              // Add header to new page
              doc.rect(0, 0, 595, 110)
                 .fillColor('#DC2626')
                 .fill();
              
              if (fs.existsSync(this.logoPath)) {
                try {
                  doc.image(this.logoPath, 50, 30, { width: 50, height: 50 });
                } catch (e) {}
              }
              
              doc.fillColor('#ffffff')
                 .fontSize(24)
                 .font(this.getFont('Outfit-Bold'))
                 .text('MiiMii', 110, 45);
              
              doc.fillColor('#000000');
              tableY = 50;
            }

            const isCredit = transaction.type === 'credit';
            const rowColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';

            doc.rect(50, tableY, 495, 22)
               .fillColor(rowColor)
               .fill()
               .strokeColor('#e5e7eb')
               .stroke();

            const date = new Date(transaction.createdAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });

            const time = new Date(transaction.createdAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit'
            });

            // Format description - show more characters (up to 50 chars)
            const description = transaction.description || transaction.category || 'N/A';
            const descriptionText = description.length > 50 ? description.substring(0, 47) + '...' : description;
            
            // Format amount - use "N" instead of naira sign
            const amount = parseFloat(transaction.amount || 0);
            const formattedAmount = amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const amountText = `${isCredit ? '+' : '-'}N${formattedAmount}`;
            
            doc.fontSize(7)
               .font(this.getFont('Outfit'))
               .fillColor('#4b5563')
               .text(date, 55, tableY + 6)
               .text(time, 55, tableY + 14)
               .text((transaction.type?.toUpperCase() || 'N/A').substring(0, 4), 120, tableY + 10)
               .text(descriptionText, 170, tableY + 10, { width: 180, ellipsis: false })
               .fillColor(isCredit ? '#10b981' : '#ef4444')
               .text(amountText, 360, tableY + 10, { width: 70, align: 'right' })
               .fillColor('#4b5563')
               .text((transaction.status || 'PENDING').toUpperCase().substring(0, 6), 440, tableY + 10)
               .text((transaction.reference || '').substring(0, 8), 490, tableY + 10);

            tableY += 22;
          });
        }

        // Footer
        const footerY = tableY + 30;
        
        // Only add footer if there's space on current page
        if (footerY < 750) {
          doc.moveTo(50, footerY)
             .lineTo(545, footerY)
             .strokeColor('#e5e7eb')
             .stroke();

          doc.fontSize(8)
             .font(this.getFont('Outfit'))
             .fillColor('#6b7280')
             .text('This is a computer-generated statement. No signature required.', 50, footerY + 10, { align: 'center', width: 495 })
             .text('For inquiries, contact support@chatmiimii.com', 50, footerY + 20, { align: 'center', width: 495 })
             .text(`© ${new Date().getFullYear()} MiiMii. All rights reserved.`, 50, footerY + 30, { align: 'center', width: 495 });
        }

        // Page numbers - track page number
        let pageNumber = 1;

        // Add page number to first page
        doc.fontSize(8)
           .font(this.getFont('Outfit'))
           .fillColor('#9ca3af')
           .text('Page 1', 50, doc.page.height - 50, { align: 'right', width: 495 });

        // Add footer and page number to subsequent pages
        doc.on('pageAdded', () => {
          pageNumber++;
          const footerY = doc.page.height - 50;
          
          // Footer separator
          doc.moveTo(50, footerY - 30)
             .lineTo(545, footerY - 30)
             .strokeColor('#e5e7eb')
             .stroke();

          // Footer text
          doc.fontSize(8)
             .font(this.getFont('Outfit'))
             .fillColor('#6b7280')
             .text('This is a computer-generated statement. No signature required.', 50, footerY - 20, { align: 'center', width: 495 })
             .text('For inquiries, contact support@chatmiimii.com', 50, footerY - 10, { align: 'center', width: 495 })
             .text(`© ${new Date().getFullYear()} MiiMii. All rights reserved.`, 50, footerY, { align: 'center', width: 495 });
          
          // Page number
          doc.fontSize(8)
             .font(this.getFont('Outfit'))
             .fillColor('#9ca3af')
             .text(`Page ${pageNumber}`, 50, footerY - 45, { align: 'right', width: 495 });
        });

        doc.end();
      } catch (error) {
        logger.error('Failed to generate statement PDF', { error: error.message, stack: error.stack });
        reject(error);
      }
    });
  }

  async requestStatement(user, options = {}) {
    try {
      logger.info('Statement request received', {
        userId: user.id,
        options,
        hasEmail: !!(user.appEmail || user.email)
      });

      // Generate statement
      const statement = await this.generateStatement(user, options);

      // Get user email (from options if provided during interactive flow, otherwise from user record)
      const email = options.email || user.appEmail || user.email;
      if (!email) {
        logger.error('User email not found for statement generation', {
          userId: user.id,
          hasAppEmail: !!user.appEmail,
          hasEmail: !!user.email,
          optionsEmail: !!options.email
        });
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
          ? `Your account statement has been generated and sent to ${email}. Please check your email inbox.` 
          : 'Statement generated. Email sending failed, but PDF is available for download.',
        statement: {
          pdfBuffer: statement.pdfBuffer.toString('base64'), // Base64 for API response
          fileName: statement.fileName,
          transactionCount: statement.transactionCount,
          totalCount: statement.totalCount,
          startDate: statement.startDate,
          endDate: statement.endDate
        },
        emailSent: emailResult.success,
        email: email
      };
    } catch (error) {
      logger.error('Failed to request statement', {
        error: error.message,
        userId: user.id,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new StatementService();

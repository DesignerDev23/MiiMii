const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialize();
  }

  initialize() {
    try {
      // Email configuration from environment variables
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };

      if (emailConfig.auth.user && emailConfig.auth.pass) {
        this.transporter = nodemailer.createTransport(emailConfig);
        this.isConfigured = true;
        logger.info('Email service initialized successfully', {
          host: emailConfig.host,
          port: emailConfig.port
        });
      } else {
        logger.warn('Email service not configured - SMTP credentials missing');
      }
    } catch (error) {
      logger.error('Failed to initialize email service', { error: error.message });
    }
  }

  async sendEmail(options) {
    if (!this.isConfigured) {
      logger.warn('Email service not configured, skipping email send', {
        to: options.to,
        subject: options.subject
      });
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments || []
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email', {
        error: error.message,
        to: options.to,
        subject: options.subject
      });
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetOTP(email, otp) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #6366f1; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>MiiMii Password Reset</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested to reset your password. Use the OTP below to complete the process:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p>This OTP will expire in <strong>10 minutes</strong>.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MiiMii. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'MiiMii - Password Reset OTP',
      html,
      text: `Your password reset OTP is: ${otp}. This code expires in 10 minutes.`
    });
  }

  async sendStatement(email, statementData) {
    const { pdfBuffer, fileName, startDate, endDate, transactionCount } = statementData;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #6366f1; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Your Account Statement</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Your account statement has been generated and is attached to this email.</p>
            <div class="info-box">
              <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
              <p><strong>Transactions:</strong> ${transactionCount}</p>
            </div>
            <p>Please find your statement PDF attached below.</p>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MiiMii. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: `MiiMii Account Statement - ${startDate} to ${endDate}`,
      html,
      text: `Your account statement for the period ${startDate} to ${endDate} (${transactionCount} transactions) is attached.`,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });
  }

  async sendAccountDeletionConfirmation(email, deletionDate) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning-box { background: #fef2f2; border: 2px solid #dc2626; padding: 15px; margin: 15px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Deletion Confirmation</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Your MiiMii account has been successfully deleted.</p>
            <div class="warning-box">
              <p><strong>Deletion Date:</strong> ${deletionDate}</p>
              <p>All your data has been permanently removed from our system.</p>
            </div>
            <p>If you didn't request this deletion, please contact our support immediately.</p>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MiiMii. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'MiiMii - Account Deletion Confirmation',
      html,
      text: `Your MiiMii account has been deleted on ${deletionDate}. If you didn't request this, please contact support immediately.`
    });
  }
}

module.exports = new EmailService();


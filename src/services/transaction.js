const { Transaction, User } = require('../models');
const bellBankService = require('./bellbank');
const walletService = require('./wallet');
const userService = require('./user');
const whatsappService = require('./whatsapp');
const aiService = require('./ai');
const logger = require('../utils/logger');

class TransactionService {
  // Create a new transaction record
  async createTransaction(userId, transactionData) {
    try {
      const {
        type,
        category,
        subCategory,
        amount,
        fee = 0,
        platformFee = 0,
        providerFee = 0,
        totalAmount,
        currency = 'NGN',
        description,
        reference,
        recipientDetails,
        metadata,
        status = 'pending',
        source = 'whatsapp',
        priority = 'normal',
        approvalStatus = 'auto_approved'
      } = transactionData;

      // Generate reference if not provided
      const finalReference = reference || Transaction.generateReference(type, category);

      // Calculate total amount if not provided
      const finalTotalAmount = totalAmount || (parseFloat(amount) + parseFloat(fee) + parseFloat(platformFee) + parseFloat(providerFee));

      const transaction = await Transaction.create({
        userId,
        reference: finalReference,
        type,
        category,
        subCategory,
        amount: parseFloat(amount),
        fee: parseFloat(fee),
        platformFee: parseFloat(platformFee),
        providerFee: parseFloat(providerFee),
        totalAmount: parseFloat(finalTotalAmount),
        currency,
        description,
        recipientDetails,
        metadata,
        status,
        source,
        priority,
        approvalStatus,
        processedAt: status === 'completed' ? new Date() : null
      });

      logger.info('Transaction created successfully', {
        transactionId: transaction.id,
        reference: transaction.reference,
        userId,
        type,
        category,
        amount: transaction.amount,
        status: transaction.status
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to create transaction', {
        error: error.message,
        userId,
        transactionData
      });
      throw error;
    }
  }

  // Update transaction status
  async updateTransactionStatus(reference, status, additionalData = {}) {
    try {
      const transaction = await Transaction.findOne({ where: { reference } });
      
      if (!transaction) {
        throw new Error(`Transaction with reference ${reference} not found`);
      }

      const updateData = {
        status,
        ...additionalData
      };

      // Set processedAt if status is completed
      if (status === 'completed') {
        updateData.processedAt = new Date();
      }

      await transaction.update(updateData);

      logger.info('Transaction status updated', {
        reference,
        oldStatus: transaction.status,
        newStatus: status,
        additionalData: Object.keys(additionalData)
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to update transaction status', {
        error: error.message,
        reference,
        status
      });
      throw error;
    }
  }

  async initiateTransfer(user, transferData, userPhoneNumber) {
    try {
      const { recipientPhone, amount, description, recipientName } = transferData;
      
      // Validate amount
      if (!amount || amount <= 0) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "❌ Invalid amount. Please specify a valid amount to transfer."
        );
        return;
      }

      // Check if recipient exists (MiiMii to MiiMii transfer)
      const recipient = await userService.getUserByPhoneNumber(recipientPhone);
      
      if (recipient) {
        // MiiMii to MiiMii transfer (free)
        return await this.handleMiiMiiTransfer(user, recipient, amount, description, userPhoneNumber);
      } else {
        // External bank transfer via BellBank
        return await this.handleBankTransfer(user, transferData, userPhoneNumber);
      }
    } catch (error) {
      logger.error('Transfer initiation failed', { 
        error: error.message, 
        userId: user.id,
        transferData 
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `❌ Transfer failed!\n\nReason: ${error.message}\n\nPlease try again or contact support.`
      );
      
      throw error;
    }
  }

  async handleMiiMiiTransfer(sender, recipient, amount, description, senderPhoneNumber) {
    try {
      // Check sender balance
      const senderWallet = await walletService.getUserWallet(sender.id);
      
      if (!senderWallet.canDebit(amount)) {
        await whatsappService.sendTextMessage(
          senderPhoneNumber,
          `❌ Insufficient balance!\n\nRequired: ₦${parseFloat(amount).toLocaleString()}\nAvailable: ₦${parseFloat(senderWallet.balance).toLocaleString()}\n\nPlease fund your wallet first.`
        );
        return;
      }

      // Perform transfer
      const result = await walletService.transferBetweenWallets(
        sender.id,
        recipient.id,
        amount,
        description || `Transfer to ${recipient.firstName || recipient.whatsappNumber}`
      );

      // Notify sender
      await whatsappService.sendTextMessage(
        senderPhoneNumber,
        `✅ *Transfer Successful!*\n\n` +
        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
        `To: ${recipient.firstName || recipient.whatsappNumber}\n` +
        `Reference: ${result.reference}\n` +
        `Fee: Free (MiiMii transfer)\n\n` +
        `Transfer completed instantly! 🚀`
      );

      // Notify recipient
      await whatsappService.sendTextMessage(
        recipient.whatsappNumber,
        `💰 *Money Received!*\n\n` +
        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
        `From: ${sender.firstName || sender.whatsappNumber}\n` +
        `Reference: ${result.reference}\n\n` +
        `${description ? `Note: ${description}\n\n` : ''}` +
        `Check your balance: Type "balance"`
      );

      logger.info('MiiMii transfer successful', {
        senderId: sender.id,
        recipientId: recipient.id,
        amount,
        reference: result.reference
      });

      return result;
    } catch (error) {
      logger.error('MiiMii transfer failed', { 
        error: error.message,
        senderId: sender.id,
        recipientId: recipient?.id
      });
      throw error;
    }
  }

  async handleBankTransfer(user, transferData, userPhoneNumber) {
    try {
      const { recipientPhone, amount, description, accountNumber, bankCode, accountName } = transferData;
      
      // Calculate fees - Fixed 25 naira fee for transfers
      const transferFee = 25;
      const totalAmount = parseFloat(amount) + transferFee;

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      
      if (!wallet.canDebit(totalAmount)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\n` +
          `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
          `Fee: ₦${transferFee.toLocaleString()}\n` +
          `Total: ₦${totalAmount.toLocaleString()}\n` +
          `Available: ₦${parseFloat(wallet.balance).toLocaleString()}\n\n` +
          `Please fund your wallet first.`
        );
        return;
      }

      // If we have account details, proceed directly
      if (accountNumber && bankCode) {
        return await this.processBankTransfer(user, {
          ...transferData,
          accountNumber,
          bankCode,
          accountName,
          totalAmount,
          fee: transferFee
        }, userPhoneNumber);
      }

      // If we only have phone number, try to resolve account details
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `🏦 *Bank Transfer*\n\n` +
        `To complete this transfer, I need the recipient's bank details.\n\n` +
        `Please provide:\n` +
        `• Bank name\n` +
        `• Account number\n\n` +
        `Example: "GTBank 0123456789" or "Send ₦5000 to GTBank 0123456789"`
      );

      return;
    } catch (error) {
      logger.error('Bank transfer failed', { 
        error: error.message,
        userId: user.id,
        transferData
      });
      throw error;
    }
  }

  async processBankTransfer(user, transferData, userPhoneNumber) {
    try {
      const { accountNumber, bankCode, accountName, amount, totalAmount, fee, description } = transferData;
      
      // Validate account details
      let validatedAccount = null;
      
      if (accountName) {
        validatedAccount = { accountName, valid: true };
      } else {
        validatedAccount = await bellBankService.validateBankAccount(bankCode, accountNumber);
        
        if (!validatedAccount.valid) {
          await whatsappService.sendTextMessage(
            userPhoneNumber,
            `❌ Invalid account details!\n\nPlease verify the account number and bank, then try again.`
          );
          return;
        }
      }

      // Create transaction reference
      const reference = walletService.generateReference();

      // Debit user wallet first
      await walletService.debitWallet(
        user.id,
        totalAmount,
        `Bank transfer to ${validatedAccount.accountName || accountNumber}`,
        {
          category: 'bank_transfer',
          accountNumber,
          bankCode,
          accountName: validatedAccount.accountName,
          originalAmount: amount,
          fee,
          provider: 'bellbank',
          status: 'processing'
        }
      );

      // Initiate transfer via BellBank
      const transferResult = await bellBankService.initiateTransfer({
        amount,
        bankCode,
        accountNumber,
        accountName: validatedAccount.accountName,
        description: description || 'MiiMii transfer',
        reference
      });

      // Notify user
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `✅ *Transfer Initiated!*\n\n` +
        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
        `To: ${validatedAccount.accountName}\n` +
        `Account: ${accountNumber}\n` +
        `Bank: ${validatedAccount.bankName || 'Bank'}\n` +
        `Fee: ₦${fee.toLocaleString()}\n` +
        `Reference: ${reference}\n\n` +
        `⏳ Processing... You'll receive confirmation shortly.`
      );

      logger.info('Bank transfer initiated', {
        userId: user.id,
        amount,
        accountNumber,
        reference,
        providerReference: transferResult.providerReference
      });

      return {
        reference,
        amount,
        status: 'processing',
        accountName: validatedAccount.accountName,
        accountNumber
      };
    } catch (error) {
      logger.error('Bank transfer processing failed', {
        error: error.message,
        userId: user.id,
        transferData
      });

      // Check if this is a timeout error
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        // For timeout errors, the transfer might still succeed on BellBank's side
        // The user will be notified via webhook when the transfer completes
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `⏳ *Transfer Processing*\n\n` +
          `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
          `To: ${validatedAccount.accountName}\n` +
          `Account: ${accountNumber}\n` +
          `Reference: ${reference}\n\n` +
          `Your transfer is being processed. This may take a few minutes.\n` +
          `You'll receive confirmation once it's completed.`
        );

        logger.info('Bank transfer timeout - user notified of processing status', {
          userId: user.id,
          amount,
          accountNumber,
          reference
        });

        return {
          reference,
          amount,
          status: 'processing',
          accountName: validatedAccount.accountName,
          accountNumber,
          message: 'Transfer is being processed - you will be notified when completed'
        };
      }

      throw error;
    }
  }

  async handleBellBankTransferComplete(webhookData) {
    try {
      const { reference, amount, recipient_account, status } = webhookData;
      
      // Find transaction by reference
      const transaction = await Transaction.findOne({ 
        where: { providerReference: reference },
        include: [{ model: User, as: 'user' }]
      });

      if (!transaction) {
        logger.warn('Transaction not found for BellBank webhook', { reference });
        return;
      }

      // Update transaction status
      await transaction.update({
        status: 'completed',
        processedAt: new Date(),
        providerResponse: webhookData
      });

      // Generate and send receipt
      let receiptSent = false;
      try {
        const receiptData = {
          transactionType: 'Bank Transfer',
          amount: parseFloat(amount),
          sender: transaction.user.name || 'MiiMii User',
          beneficiary: recipient_account,
          reference: transaction.reference,
          date: new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          status: 'Successful',
          remark: transaction.description || 'Bank transfer',
          charges: transaction.fee || 25,
          discount: 0
        };

        const receiptService = require('./receipt');
        const receiptBuffer = await receiptService.generateReceipt(receiptData);
        
        // Send receipt as text message (simplified for test numbers)
        await whatsappService.sendTextMessage(
          transaction.user.whatsappNumber,
          `✅ *Transfer Receipt*\n\n💰 Amount: ₦${parseFloat(amount).toLocaleString()}\n💸 Fee: ₦${transaction.fee || 25}\n👤 To: ${recipient_account}\n📋 Reference: ${transaction.reference}\n📅 Date: ${new Date().toLocaleString('en-GB')}\n✅ Status: Successful\n\nYour transfer has been processed! 🎉`
        );
        
        // Send additional success message
        await whatsappService.sendTextMessage(
          transaction.user.whatsappNumber,
          `🎉 *Transfer Completed Successfully!*\n\nYour transfer of ₦${parseFloat(amount).toLocaleString()} to ${recipient_account} has been processed.\n\n📋 *Reference:* ${transaction.reference}\n⏰ *Estimated Arrival:* 5-15 minutes\n\nThank you for using MiiMii! 💙`
        );
        
        receiptSent = true;
      } catch (receiptError) {
        logger.warn('Failed to generate transfer receipt, sending text message only', { error: receiptError.message });
      }

      // Send text notification if receipt wasn't sent
      if (!receiptSent) {
        await whatsappService.sendTextMessage(
          transaction.user.whatsappNumber,
          `✅ *Transfer Completed!*\n\n` +
          `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
          `To: ${recipient_account}\n` +
          `Reference: ${transaction.reference}\n\n` +
          `Your transfer has been completed successfully! 🎉`
        );
      }

      logger.info('Bank transfer completed via webhook', {
        reference,
        amount,
        userId: transaction.userId
      });
    } catch (error) {
      logger.error('Failed to handle BellBank transfer completion', {
        error: error.message,
        webhookData
      });
    }
  }

  async handleBellBankTransferFailed(webhookData) {
    try {
      const { reference, amount, reason } = webhookData;
      
      // Find transaction by reference
      const transaction = await Transaction.findOne({ 
        where: { providerReference: reference },
        include: [{ model: User, as: 'user' }]
      });

      if (!transaction) {
        logger.warn('Transaction not found for BellBank failure webhook', { reference });
        return;
      }

      // Update transaction status
      await transaction.update({
        status: 'failed',
        processedAt: new Date(),
        failureReason: reason,
        providerResponse: webhookData
      });

      // Refund user
      await walletService.creditWallet(
        transaction.userId,
        transaction.totalAmount,
        `Refund for failed transfer - ${transaction.reference}`,
        {
          category: 'refund',
          originalTransactionId: transaction.id,
          originalReference: transaction.reference
        }
      );

      // Notify user
      await whatsappService.sendTextMessage(
        transaction.user.whatsappNumber,
        `❌ *Transfer Failed*\n\n` +
        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
        `Reference: ${transaction.reference}\n` +
        `Reason: ${reason}\n\n` +
        `💰 Your money has been refunded to your wallet.\n\n` +
        `Please try again or contact support if the issue persists.`
      );

      logger.info('Bank transfer failed, user refunded', {
        reference,
        amount,
        userId: transaction.userId,
        reason
      });
    } catch (error) {
      logger.error('Failed to handle BellBank transfer failure', {
        error: error.message,
        webhookData
      });
    }
  }

  async sendTransactionHistory(user, userPhoneNumber, limit = 5) {
    try {
      const transactions = await Transaction.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
        limit: limit
      });

      if (transactions.length === 0) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "📊 *Transaction History*\n\nNo transactions found. Start using MiiMii to see your transaction history here! 💰"
        );
        return;
      }

      // Generate PDF
      const pdfBuffer = await this.generateTransactionHistoryPDF(user, transactions);
      
      // Send PDF via WhatsApp
      await whatsappService.sendDocument(
        userPhoneNumber,
        pdfBuffer,
        `transaction_history_${user.id}_${Date.now()}.pdf`,
        'application/pdf',
        `📊 *Your Transaction History*\n\nHere's your recent transaction history (${transactions.length} transactions).\n\n💡 You can also type "transactions 10" to see more transactions.`
      );

      logger.info('Transaction history PDF sent', {
        userId: user.id,
        transactionCount: transactions.length
      });
    } catch (error) {
      logger.error('Failed to send transaction history PDF', {
        error: error.message,
        userId: user.id
      });

      // Fallback to text format
      await this.sendTransactionHistoryText(user, userPhoneNumber, limit);
    }
  }

  async generateTransactionHistoryPDF(user, transactions) {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .text('MiiMii Transaction History', { align: 'center' })
           .moveDown();

        doc.fontSize(12)
           .font('Helvetica')
           .text(`Generated for: ${user.firstName} ${user.lastName || ''}`)
           .text(`Phone: ${user.whatsappNumber}`)
           .text(`Date: ${new Date().toLocaleDateString()}`)
           .moveDown(2);

        // Table header
        const tableTop = doc.y;
        const tableLeft = 50;
        const colWidths = [80, 100, 80, 80, 100];

        // Draw table header
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Date', tableLeft, tableTop)
           .text('Type', tableLeft + colWidths[0], tableTop)
           .text('Amount', tableLeft + colWidths[0] + colWidths[1], tableTop)
           .text('Status', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop)
           .text('Reference', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);

        // Draw table rows
        let yPosition = tableTop + 20;
        doc.fontSize(9).font('Helvetica');

        transactions.forEach((transaction, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }

          const date = new Date(transaction.createdAt).toLocaleDateString();
          const type = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
          const amount = `₦${parseFloat(transaction.amount).toLocaleString()}`;
          const status = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
          const reference = transaction.reference.substring(0, 12) + '...';

          doc.text(date, tableLeft, yPosition)
             .text(type, tableLeft + colWidths[0], yPosition)
             .text(amount, tableLeft + colWidths[0] + colWidths[1], yPosition)
             .text(status, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], yPosition)
             .text(reference, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], yPosition);

          yPosition += 15;
        });

        // Footer
        doc.moveDown(2)
           .fontSize(10)
           .text(`Total Transactions: ${transactions.length}`, { align: 'center' })
           .text('Generated by MiiMii - Your Digital Financial Assistant', { align: 'center' });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async sendTransactionHistoryText(user, userPhoneNumber, limit = 5) {
    try {
      const transactions = await Transaction.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
        limit: limit
      });
      
      if (transactions.length === 0) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "📊 *Transaction History*\n\nNo transactions found. Start using MiiMii to see your transaction history here! 💰"
        );
        return;
      }

      let historyText = `📊 *Transaction History*\n\nHere are your recent ${transactions.length} transactions:\n\n`;

      transactions.forEach((transaction, index) => {
        const date = new Date(transaction.createdAt).toLocaleDateString();
        const time = new Date(transaction.createdAt).toLocaleTimeString();
        const type = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
        const amount = parseFloat(transaction.amount).toLocaleString();
        const status = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
        const emoji = this.getTransactionEmoji(transaction.type, transaction.status);

        historyText += `${emoji} *${type}*\n`;
        historyText += `💰 Amount: ₦${amount}\n`;
        historyText += `📅 Date: ${date} at ${time}\n`;
        historyText += `📊 Status: ${status}\n`;
        historyText += `🔢 Ref: ${transaction.reference}\n`;

        if (transaction.description) {
          historyText += `📝 Note: ${transaction.description}\n`;
        }
        
        if (index < transactions.length - 1) {
          historyText += '\n';
        }
      });

      if (transactions.length >= limit) {
        historyText += `\n\n💡 Showing last ${limit} transactions.\nType "transactions 10" for more.`;
      }

      await whatsappService.sendTextMessage(userPhoneNumber, historyText);

      logger.info('Transaction history sent', {
        userId: user.id,
        transactionCount: transactions.length
      });
    } catch (error) {
      logger.error('Failed to send transaction history', {
        error: error.message,
        userId: user.id
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "❌ Unable to retrieve transaction history right now. Please try again later."
      );
    }
  }

  getTransactionEmoji(type, status) {
    const emojis = {
      credit: '💰',
      debit: '💸',
      transfer: '🔄',
      airtime: '📱',
      data: '📶',
      utility: '⚡',
      fee_charge: '💳',
      refund: '↩️',
      bonus: '🎁',
      cashback: '💵'
    };

    const statusEmojis = {
      completed: '✅',
      pending: '⏳',
      failed: '❌',
      processing: '🔄',
      cancelled: '🚫'
    };

    return `${emojis[type] || '📊'} ${statusEmojis[status] || '📊'}`;
  }

  async getTransactionByReference(reference) {
    try {
      const transaction = await Transaction.findOne({
        where: { reference },
        include: [{ model: User, as: 'user' }]
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to get transaction by reference', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  async retryFailedTransaction(transactionId, userPhoneNumber) {
    try {
      const transaction = await Transaction.findByPk(transactionId, {
        include: [{ model: User, as: 'user' }]
      });

      if (!transaction || transaction.status !== 'failed') {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "❌ Transaction not found or cannot be retried."
        );
        return;
      }

      // Re-initiate the transaction based on type
      if (transaction.category === 'bank_transfer') {
        const recipientDetails = transaction.recipientDetails || {};
        
        await this.handleBankTransfer(transaction.user, {
          amount: transaction.amount,
          accountNumber: recipientDetails.accountNumber,
          bankCode: recipientDetails.bankCode,
          accountName: recipientDetails.accountName,
          description: transaction.description
        }, userPhoneNumber);
      }

      logger.info('Transaction retry initiated', {
        originalTransactionId: transactionId,
        userId: transaction.userId
      });
    } catch (error) {
      logger.error('Failed to retry transaction', {
        error: error.message,
        transactionId
      });

      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "❌ Failed to retry transaction. Please try again or contact support."
      );
    }
  }

  // Handle Bilal service webhooks
  async handleBilalSuccess(webhookData, serviceType) {
    try {
      // This is handled in the bilal service, but we can add additional logic here
      logger.info('Bilal service webhook success processed', {
        serviceType,
        reference: webhookData.reference
      });
    } catch (error) {
      logger.error('Failed to handle Bilal success webhook', {
        error: error.message,
        webhookData,
        serviceType
      });
    }
  }

  async handleBilalFailed(webhookData, serviceType) {
    try {
      // This is handled in the bilal service, but we can add additional logic here
      logger.info('Bilal service webhook failure processed', {
        serviceType,
        reference: webhookData.reference,
        reason: webhookData.reason
      });
    } catch (error) {
      logger.error('Failed to handle Bilal failure webhook', {
        error: error.message,
        webhookData,
        serviceType
      });
    }
  }

  // Get recent transactions for a user
  async getRecentTransactions(userId, limit = 5) {
    try {
      const transactions = await Transaction.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        attributes: ['id', 'type', 'category', 'amount', 'status', 'description', 'createdAt', 'reference']
      });

      return transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        category: tx.category,
        amount: parseFloat(tx.amount),
        status: tx.status,
        description: tx.description,
        reference: tx.reference,
        createdAt: tx.createdAt
      }));
    } catch (error) {
      logger.error('Failed to get recent transactions', {
        error: error.message,
        userId,
        limit
      });
      return [];
    }
  }
}

module.exports = new TransactionService();
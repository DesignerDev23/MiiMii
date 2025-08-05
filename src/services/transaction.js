const { Transaction, User } = require('../models');
const bellBankService = require('./bellbank');
const walletService = require('./wallet');
const userService = require('./user');
const whatsappService = require('./whatsapp');
const aiService = require('./ai');
const logger = require('../utils/logger');

class TransactionService {
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
      
      // Calculate fees
      const feeStructure = await bellBankService.calculateTransferFee(amount);
      const totalAmount = feeStructure.totalAmount;

      // Check user balance
      const wallet = await walletService.getUserWallet(user.id);
      
      if (!wallet.canDebit(totalAmount)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `❌ Insufficient balance!\n\n` +
          `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
          `Fee: ₦${feeStructure.totalFee.toLocaleString()}\n` +
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
          fee: feeStructure.totalFee
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

      // Notify user
      await whatsappService.sendTextMessage(
        transaction.user.whatsappNumber,
        `✅ *Transfer Completed!*\n\n` +
        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
        `To: ${recipient_account}\n` +
        `Reference: ${transaction.reference}\n\n` +
        `Your transfer has been completed successfully! 🎉`
      );

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
      const transactions = await walletService.getWalletTransactions(user.id, limit);
      
      if (transactions.length === 0) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          `📊 *Transaction History*\n\nNo transactions found.\n\nStart using MiiMii to see your transaction history here! 🚀`
        );
        return;
      }

      // Generate AI summary
      const summary = await aiService.generateTransactionSummary(transactions);
      
      let historyText = `📊 *Transaction History*\n\n${summary}\n\n`;
      
      transactions.forEach((tx, index) => {
        const emoji = tx.type === 'credit' ? '💰' : '💸';
        const sign = tx.type === 'credit' ? '+' : '-';
        const date = new Date(tx.createdAt).toLocaleDateString();
        
        historyText += `${emoji} ${sign}₦${parseFloat(tx.amount).toLocaleString()}\n`;
        historyText += `   ${tx.description}\n`;
        historyText += `   ${date} • ${tx.status}\n`;
        
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
}

module.exports = new TransactionService();
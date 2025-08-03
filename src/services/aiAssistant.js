const axios = require('axios');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const bankTransferService = require('./bankTransfer');
const dataService = require('./data');
const airtimeService = require('./airtime');
const utilityService = require('./utility');
const transactionService = require('./transaction');

class AIAssistantService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiBaseUrl = 'https://api.openai.com/v1';
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    
    // Intent patterns for command recognition
    this.intentPatterns = {
      TRANSFER_MONEY: ['send', 'transfer', 'pay', 'give'],
      BUY_AIRTIME: ['airtime', 'recharge', 'top up', 'credit'],
      BUY_DATA: ['data', 'internet', 'mb', 'gb'],
      PAY_BILL: ['bill', 'electric', 'cable', 'tv', 'water', 'internet bill'],
      CHECK_BALANCE: ['balance', 'wallet', 'account'],
      TRANSACTION_HISTORY: ['history', 'transactions', 'statement'],
      BANK_TRANSFER: ['bank transfer', 'transfer to bank', 'send to bank'],
      HELP: ['help', 'what can you do', 'commands', 'menu'],
      REGISTER: ['register', 'signup', 'sign up', 'join', 'create account'],
      SET_PIN: ['set pin', 'create pin', 'pin'],
      KYC: ['kyc', 'verify', 'verification', 'identity']
    };

    // System prompt for AI assistant
    this.systemPrompt = `You are MiiMii, a helpful WhatsApp-based fintech assistant. Your role is to understand user messages and extract relevant information for financial transactions.

CAPABILITIES:
- Money transfers (wallet-to-wallet, bank transfers)
- Airtime purchases
- Data bundle purchases  
- Utility bill payments (electricity, cable TV, water, internet)
- Account management (balance, history, KYC)

EXTRACT INFORMATION FROM USER MESSAGES:
1. INTENT: What does the user want to do?
2. AMOUNT: How much money/data involved?
3. RECIPIENT: Phone number, account number, or meter number
4. NETWORK/PROVIDER: MTN, Airtel, Glo, 9mobile, or utility providers
5. ADDITIONAL DETAILS: Any other relevant information

RESPONSE FORMAT (JSON):
{
  "intent": "TRANSFER_MONEY|BUY_AIRTIME|BUY_DATA|PAY_BILL|CHECK_BALANCE|BANK_TRANSFER|HELP|REGISTER|SET_PIN|KYC",
  "confidence": 0.95,
  "extractedData": {
    "amount": "5000",
    "recipient": "09012345678",
    "network": "MTN",
    "description": "airtime purchase",
    "bankCode": "058",
    "accountNumber": "1234567890",
    "billType": "electricity",
    "meterNumber": "12345678901"
  },
  "requiredFields": ["pin"],
  "userFriendlyResponse": "I'll help you buy ₦5,000 MTN airtime for 09012345678. Please provide your PIN to continue.",
  "needsMoreInfo": false,
  "clarificationNeeded": []
}

EXAMPLES:
- "Send 5k to Musa 9091234567 Opay" → TRANSFER_MONEY
- "Buy 1000 MTN airtime for 08123456789" → BUY_AIRTIME  
- "Pay 2000 naira electricity bill 12345678901" → PAY_BILL
- "Check my balance" → CHECK_BALANCE
- "Transfer 10000 to Access Bank 1234567890" → BANK_TRANSFER

Always be helpful, secure, and ask for PIN when required for transactions.`;
  }

  // Main AI processing function
  async processUserMessage(phoneNumber, message, messageType = 'text') {
    try {
      logger.info('Processing user message with AI', { phoneNumber, messageType });

      // Get or create user
      const user = await userService.getOrCreateUser(phoneNumber);
      
      // Process based on message type
      let processedText = message;
      
      if (messageType === 'audio') {
        processedText = await this.transcribeAudio(message);
      } else if (messageType === 'image') {
        processedText = await this.extractTextFromImage(message);
      }

      // Get AI intent and data extraction
      const aiResponse = await this.getAIResponse(processedText, user);
      
      // Process the intent
      const result = await this.processIntent(aiResponse, user);
      
      return {
        aiResponse,
        result,
        user
      };
    } catch (error) {
      logger.error('AI processing failed', { error: error.message, phoneNumber, message });
      return {
        error: error.message,
        userFriendlyResponse: "Sorry, I'm having trouble understanding your request. Please try again or type 'help' for assistance."
      };
    }
  }

  // Get AI response from OpenAI
  async getAIResponse(message, user) {
    try {
      const userContext = `
User Info:
- Phone: ${user.whatsappNumber}
- Name: ${user.firstName || ''} ${user.lastName || ''}
- KYC Status: ${user.kycStatus}
- Can Transact: ${user.canPerformTransactions()}
- Account Active: ${user.isActive}
`;

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: `${userContext}\n\nUser Message: "${message}"` }
          ],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: "json_object" }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = JSON.parse(response.data.choices[0].message.content);
      
      logger.info('AI response generated', { 
        intent: aiResponse.intent, 
        confidence: aiResponse.confidence 
      });

      return aiResponse;
    } catch (error) {
      logger.error('OpenAI API error', { error: error.message });
      throw new Error('AI processing unavailable. Please try again later.');
    }
  }

  // Process the identified intent
  async processIntent(aiResponse, user) {
    try {
      const { intent, extractedData, requiredFields, needsMoreInfo } = aiResponse;

      // Check if user needs to complete registration/KYC first
      if (intent !== 'REGISTER' && intent !== 'HELP' && !user.canPerformTransactions()) {
        return {
          success: false,
          message: "To use MiiMii services, please complete your registration and KYC verification first. Type 'register' to get started.",
          requiresAction: 'COMPLETE_REGISTRATION'
        };
      }

      // Check if more information is needed
      if (needsMoreInfo) {
        return {
          success: false,
          message: aiResponse.userFriendlyResponse,
          needsMoreInfo: true,
          clarificationNeeded: aiResponse.clarificationNeeded
        };
      }

      // Route to appropriate service based on intent
      switch (intent) {
        case 'TRANSFER_MONEY':
          return await this.processMoneyTransfer(extractedData, user);
          
        case 'BUY_AIRTIME':
          return await this.processAirtimePurchase(extractedData, user);
          
        case 'BUY_DATA':
          return await this.processDataPurchase(extractedData, user);
          
        case 'PAY_BILL':
          return await this.processBillPayment(extractedData, user);
          
        case 'BANK_TRANSFER':
          return await this.processBankTransfer(extractedData, user);
          
        case 'CHECK_BALANCE':
          return await this.getWalletBalance(user);
          
        case 'TRANSACTION_HISTORY':
          return await this.getTransactionHistory(user);
          
        case 'HELP':
          return this.getHelpMessage();
          
        case 'REGISTER':
          return this.getRegistrationInstructions();
          
        case 'SET_PIN':
          return this.getPinInstructions();
          
        case 'KYC':
          return this.getKYCInstructions(user);
          
        default:
          return {
            success: false,
            message: "I didn't understand that request. Type 'help' to see what I can do for you."
          };
      }
    } catch (error) {
      logger.error('Intent processing failed', { error: error.message, intent: aiResponse?.intent });
      return {
        success: false,
        message: "Sorry, I encountered an error processing your request. Please try again."
      };
    }
  }

  // Process money transfer
  async processMoneyTransfer(data, user) {
    try {
      const { amount, recipient, description, pin } = data;
      
      if (!pin) {
        return {
          success: false,
          message: `I'll help you send ₦${parseFloat(amount).toLocaleString()} to ${recipient}. Please reply with your 4-digit PIN to complete the transfer.`,
          awaitingInput: 'PIN',
          pendingTransaction: { amount, recipient, description }
        };
      }

      // Process the transfer
      const result = await transactionService.processTransfer(user.id, {
        recipientPhone: recipient,
        amount: parseFloat(amount),
        description: description || 'Wallet transfer'
      }, pin);

      return {
        success: true,
        message: `✅ Transfer successful! ₦${parseFloat(amount).toLocaleString()} sent to ${recipient}. Reference: ${result.reference}`,
        transactionDetails: result
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Transfer failed: ${error.message}`
      };
    }
  }

  // Process airtime purchase
  async processAirtimePurchase(data, user) {
    try {
      const { amount, recipient, network, pin } = data;
      
      if (!pin) {
        return {
          success: false,
          message: `I'll buy ₦${parseFloat(amount).toLocaleString()} ${network} airtime for ${recipient}. Please reply with your PIN to continue.`,
          awaitingInput: 'PIN',
          pendingTransaction: { amount, recipient, network, type: 'airtime' }
        };
      }

      const result = await airtimeService.purchaseAirtime(user.id, recipient, network, amount, pin);

      return {
        success: true,
        message: `✅ Airtime purchase successful! ₦${parseFloat(amount).toLocaleString()} ${network} airtime sent to ${recipient}. Reference: ${result.reference}`,
        transactionDetails: result
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Airtime purchase failed: ${error.message}`
      };
    }
  }

  // Process data purchase
  async processDataPurchase(data, user) {
    try {
      const { amount, recipient, network, planId, pin } = data;
      
      if (!pin) {
        return {
          success: false,
          message: `I'll buy ${network} data for ${recipient}. Please reply with your PIN to continue.`,
          awaitingInput: 'PIN',
          pendingTransaction: { amount, recipient, network, planId, type: 'data' }
        };
      }

      const result = await dataService.purchaseData(user.id, recipient, network, planId, pin);

      return {
        success: true,
        message: `✅ Data purchase successful! ${network} data sent to ${recipient}. Reference: ${result.reference}`,
        transactionDetails: result
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Data purchase failed: ${error.message}`
      };
    }
  }

  // Process bill payment
  async processBillPayment(data, user) {
    try {
      const { amount, billType, provider, meterNumber, pin } = data;
      
      if (!pin) {
        return {
          success: false,
          message: `I'll pay your ₦${parseFloat(amount).toLocaleString()} ${billType} bill. Please reply with your PIN to continue.`,
          awaitingInput: 'PIN',
          pendingTransaction: { amount, billType, provider, meterNumber, type: 'bill' }
        };
      }

      const result = await utilityService.payBill(user.id, billType, provider, meterNumber, amount, pin);

      return {
        success: true,
        message: `✅ Bill payment successful! ₦${parseFloat(amount).toLocaleString()} ${billType} bill paid. Reference: ${result.reference}`,
        transactionDetails: result
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Bill payment failed: ${error.message}`
      };
    }
  }

  // Process bank transfer
  async processBankTransfer(data, user) {
    try {
      const { amount, accountNumber, bankCode, narration, pin } = data;
      
      if (!pin) {
        return {
          success: false,
          message: `I'll transfer ₦${parseFloat(amount).toLocaleString()} to bank account ${accountNumber}. Please reply with your PIN to continue.`,
          awaitingInput: 'PIN',
          pendingTransaction: { amount, accountNumber, bankCode, narration, type: 'bank_transfer' }
        };
      }

      const result = await bankTransferService.processBankTransfer(user.id, {
        accountNumber,
        bankCode,
        amount: parseFloat(amount),
        narration: narration || 'Transfer from MiiMii'
      }, pin);

      return {
        success: true,
        message: `✅ Bank transfer successful! ₦${parseFloat(amount).toLocaleString()} sent to ${accountNumber}. Reference: ${result.transaction.reference}`,
        transactionDetails: result
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Bank transfer failed: ${error.message}`
      };
    }
  }

  // Get wallet balance
  async getWalletBalance(user) {
    try {
      const balance = await walletService.getWalletBalance(user.id);
      return {
        success: true,
        message: `💰 Your wallet balance is ₦${balance.toLocaleString()}`,
        balance
      };
    } catch (error) {
      return {
        success: false,
        message: "Unable to retrieve balance at this time. Please try again."
      };
    }
  }

  // Get transaction history
  async getTransactionHistory(user) {
    try {
      const transactions = await transactionService.getUserTransactions(user.id, 5);
      
      if (transactions.length === 0) {
        return {
          success: true,
          message: "📋 You have no transactions yet. Start using MiiMii to see your transaction history here!"
        };
      }

      let message = "📋 *Recent Transactions:*\n\n";
      transactions.forEach((tx, index) => {
        const emoji = tx.type === 'credit' ? '💰' : '💸';
        message += `${emoji} ${tx.description}\n`;
        message += `   ₦${parseFloat(tx.amount).toLocaleString()} • ${tx.status}\n`;
        message += `   ${new Date(tx.createdAt).toLocaleDateString()}\n\n`;
      });

      return {
        success: true,
        message,
        transactions
      };
    } catch (error) {
      return {
        success: false,
        message: "Unable to retrieve transaction history. Please try again."
      };
    }
  }

  // Get help message
  getHelpMessage() {
    return {
      success: true,
      message: `🤖 *Welcome to MiiMii!* 

I can help you with:

💸 *Send Money*
"Send 5000 to 09012345678"

📱 *Buy Airtime* 
"Buy 1000 MTN airtime for 08123456789"

📶 *Buy Data*
"Get 2GB MTN data for 08123456789"

💡 *Pay Bills*
"Pay 5000 electricity bill 12345678901"

🏦 *Bank Transfer*
"Transfer 10000 to Access Bank 1234567890"

💰 *Check Balance*
"What's my balance?"

📋 *Transaction History*
"Show my transactions"

Just chat naturally with me! I understand what you want to do. 😊`
    };
  }

  // Get registration instructions
  getRegistrationInstructions() {
    return {
      success: true,
      message: `👋 *Welcome to MiiMii!*

To get started, I need to set up your account:

1️⃣ Your phone number: ${this.userPhone} ✅
2️⃣ Set your full name
3️⃣ Create a 4-digit PIN
4️⃣ Complete KYC verification

Let's start! What's your full name?`,
      awaitingInput: 'FULL_NAME'
    };
  }

  // Get PIN instructions
  getPinInstructions() {
    return {
      success: true,
      message: `🔐 *Set Your PIN*

Create a secure 4-digit PIN for transactions:

⚠️ *Important:*
- Don't use 1234, 0000, or your birthday
- Keep it secret and secure
- You'll need it for all transactions

Please enter your 4-digit PIN:`,
      awaitingInput: 'SET_PIN'
    };
  }

  // Get KYC instructions
  getKYCInstructions(user) {
    if (user.kycStatus === 'completed') {
      return {
        success: true,
        message: "✅ Your KYC verification is already complete! You can use all MiiMii services."
      };
    }

    return {
      success: true,
      message: `📋 *KYC Verification*

To use MiiMii services, complete your verification:

📝 *Required Information:*
- Full name
- Date of birth (YYYY-MM-DD)
- Gender (male/female)
- BVN (Bank Verification Number)
- Address

This keeps your account secure and enables all features.

Ready to start? Type 'yes' to begin KYC.`,
      awaitingInput: 'KYC_START'
    };
  }

  // Transcribe audio message (placeholder - implement with speech-to-text service)
  async transcribeAudio(audioUrl) {
    try {
      // Implement actual audio transcription here
      // You can use OpenAI Whisper API or other services
      logger.info('Audio transcription requested', { audioUrl });
      
      // For now, return a placeholder
      return "Audio transcription not yet implemented. Please send text messages.";
    } catch (error) {
      logger.error('Audio transcription failed', { error: error.message });
      throw new Error('Unable to process audio message');
    }
  }

  // Extract text from image using OCR (placeholder - implement with Tesseract)
  async extractTextFromImage(imageUrl) {
    try {
      // Implement actual OCR here using Tesseract
      logger.info('OCR text extraction requested', { imageUrl });
      
      // For now, return a placeholder
      return "Image text extraction not yet implemented. Please send text messages.";
    } catch (error) {
      logger.error('OCR text extraction failed', { error: error.message });
      throw new Error('Unable to process image message');
    }
  }

  // Validate phone number format
  validatePhoneNumber(phoneNumber) {
    // Nigerian phone number validation
    const nigerianPhoneRegex = /^(\+234|234|0)?([789][01]\d{8})$/;
    return nigerianPhoneRegex.test(phoneNumber.replace(/\s+/g, ''));
  }

  // Format phone number to standard Nigerian format
  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\s+/g, '').replace(/^\+?234/, '');
    if (cleaned.startsWith('0')) {
      return '234' + cleaned.substring(1);
    }
    return '234' + cleaned;
  }
}

module.exports = new AIAssistantService();
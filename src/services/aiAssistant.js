const axios = require('axios');
const { axiosConfig } = require('../utils/httpsAgent');
const logger = require('../utils/logger');
const userService = require('./user');
const walletService = require('./wallet');
const bankTransferService = require('./bankTransfer');
const dataService = require('./data');
const airtimeService = require('./airtime');
const utilityService = require('./utility');
const transactionService = require('./transaction');
const { ActivityLog } = require('../models');

class AIAssistantService {
  constructor() {
    this.openaiApiKey = process.env.AI_API_KEY;
    this.openaiBaseUrl = 'https://api.openai.com/v1';
    this.model = process.env.AI_MODEL || 'gpt-4-turbo-preview';
    
    // Validate OpenAI configuration
    this.isConfigured = !!this.openaiApiKey;
    if (!this.isConfigured) {
      logger.warn('OpenAI API key not configured - AI features will use fallback processing');
    }
    
    // Enhanced intent patterns for better recognition
    this.intentPatterns = {
      TRANSFER_MONEY: {
        keywords: ['send', 'transfer', 'pay', 'give', 'move', 'forward', 'remit'],
        patterns: [
          /send\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\w+)?\s*(\d{11})/i,
          /transfer\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\w+)?\s*(\d{11})/i,
          /pay\s+(\w+)?\s*(\d+k?|\d+(?:,\d{3})*)\s+(\d{11})/i
        ]
      },
      BANK_TRANSFER: {
        keywords: ['bank transfer', 'transfer to bank', 'send to bank', 'pay bank'],
        patterns: [
          /transfer\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\w+\s*bank|\w+)\s+(\d{10})/i,
          /send\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\w+\s*bank|\w+)\s+(\d{10})/i
        ]
      },
      BUY_AIRTIME: {
        keywords: ['airtime', 'recharge', 'top up', 'credit', 'load', 'buy airtime'],
        patterns: [
          /buy\s+(\d+k?|\d+(?:,\d{3})*)\s+airtime(?:\s+for)?\s*(\d{11})?/i,
          /(\d+k?|\d+(?:,\d{3})*)\s+airtime(?:\s+for)?\s*(\d{11})?/i,
          /recharge\s+(\d{11})?\s*(?:with)?\s*(\d+k?|\d+(?:,\d{3})*)/i
        ]
      },
      BUY_DATA: {
        keywords: ['data', 'internet', 'mb', 'gb', 'buy data'],
        patterns: [
          /buy\s+(\d+(?:\.\d+)?(?:mb|gb))\s+data(?:\s+for)?\s*(\d{11})?/i,
          /(\d+(?:\.\d+)?(?:mb|gb))\s+data(?:\s+for)?\s*(\d{11})?/i,
          /(\d+k?|\d+(?:,\d{3})*)\s+worth\s+of\s+data(?:\s+for)?\s*(\d{11})?/i
        ]
      },
      PAY_BILL: {
        keywords: ['bill', 'electric', 'electricity', 'cable', 'tv', 'water', 'internet bill', 'pay bill'],
        patterns: [
          /pay\s+(\d+k?|\d+(?:,\d{3})*)\s+(electricity|electric|cable|tv|water|internet)\s+(?:bill\s+)?(?:for\s+)?(\w+)?\s*(\d+)/i,
          /(electricity|electric|cable|tv|water|internet)\s+bill\s+(\d+k?|\d+(?:,\d{3})*)\s+(\w+)?\s*(\d+)/i
        ]
      },
      CHECK_BALANCE: {
        keywords: ['balance', 'wallet', 'account', 'money', 'fund', 'how much'],
        patterns: [
          /(?:check\s+)?(?:my\s+)?(?:wallet\s+)?balance/i,
          /how\s+much\s+(?:money\s+)?(?:do\s+)?i\s+have/i
        ]
      },
      TRANSACTION_HISTORY: {
        keywords: ['history', 'transactions', 'statement', 'records', 'activity'],
        patterns: [
          /(?:transaction\s+)?(?:history|transactions|statement|records)/i,
          /show\s+(?:my\s+)?(?:recent\s+)?transactions/i
        ]
      },
      HELP: {
        keywords: ['help', 'what can you do', 'commands', 'menu', 'assist', 'support'],
        patterns: [/help/i, /what\s+can\s+you\s+do/i, /menu/i]
      }
    };

    // System prompt for enhanced AI processing
    this.systemPrompt = `You are MiiMii, a highly intelligent WhatsApp-based fintech assistant for Nigeria. Your role is to understand natural language and extract precise information for financial transactions.

CORE CAPABILITIES:
- Money transfers (wallet-to-wallet, bank transfers)
- Airtime purchases (MTN, Airtel, Glo, 9mobile)
- Data bundle purchases
- Utility bill payments (electricity, cable TV, water, internet)
- Account management (balance, history, KYC)

EXTRACTION RULES:
1. AMOUNTS: Recognize "k" as thousands (5k = 5000), commas in numbers (5,000), and written amounts
2. PHONE NUMBERS: Nigerian format (11 digits starting with 070, 080, 081, 090, 091, etc.)
3. ACCOUNT NUMBERS: Bank accounts (10 digits), meter numbers (variable length)
4. NAMES: Extract recipient names, bank names, utility providers
5. CONTEXT: Consider conversation history and user preferences

RESPONSE FORMAT (JSON):
{
  "success": true,
  "intent": "INTENT_NAME",
  "confidence": 0.95,
  "extractedData": {
    "amount": "5000",
    "recipient": "John",
    "phoneNumber": "08123456789",
    "accountNumber": "0123456789",
    "bankName": "GTBank",
    "bankCode": "058",
    "utilityProvider": "EKEDC",
    "meterNumber": "12345678901",
    "network": "MTN",
    "dataSize": "1GB"
  },
  "requiredFields": ["pin"],
  "message": "I'll help you send ₦5,000 to John (08123456789). Please provide your PIN to authorize this transaction.",
  "requiresAction": "VERIFY_PIN",
  "awaitingInput": "pin",
  "context": "money_transfer_verification",
  "estimatedFee": "25.00"
}

EXAMPLES:
- "Send 5k to Musa 9091234567 Opay" → TRANSFER_MONEY with amount=5000, recipient=Musa, phoneNumber=9091234567
- "Buy 1000 MTN airtime for 08123456789" → BUY_AIRTIME with amount=1000, network=MTN, phoneNumber=08123456789
- "Pay 2000 electricity EKEDC 12345678901" → PAY_BILL with amount=2000, utilityProvider=EKEDC, meterNumber=12345678901
- "Transfer 10000 to Access Bank 1234567890" → BANK_TRANSFER with amount=10000, bankName=Access Bank, accountNumber=1234567890

NIGERIAN CONTEXT:
- Networks: MTN, Airtel, Glo, 9mobile
- Banks: GTBank, Access, Zenith, UBA, First Bank, etc.
- Utilities: PHCN, EKEDC, IKEDC, DStv, GOtv, Startimes, etc.
- Phone prefixes: 070X, 080X, 081X, 090X, 091X (where X is any digit)

Be helpful, secure, and always ask for PIN verification for transactions.`;
  }

  async processUserMessage(phoneNumber, message, messageType = 'text', extractedData = null) {
    try {
      logger.info('AI processing user message', { phoneNumber, messageType });

      // Get user and context
      const user = await userService.getOrCreateUser(phoneNumber);
      
      // Check conversation state for multi-step interactions
      const conversationState = user.conversationState;
      
      // If user is in a conversation flow, handle accordingly
      if (conversationState && conversationState.awaitingInput) {
        return await this.handleConversationFlow(user, message, conversationState);
      }

      // Process new message with AI
      const aiResponse = await this.getAIResponse(message, user, extractedData);
      
      if (!aiResponse.success) {
        return {
          success: false,
          error: aiResponse.error,
          userFriendlyResponse: "I'm having trouble understanding that right now. Please try rephrasing your request."
        };
      }

      // Process the intent
      const result = await this.processIntent(aiResponse, user, message);
      
      return {
        success: true,
        result: result
      };

    } catch (error) {
      logger.error('AI processing failed', { error: error.message, phoneNumber });
      return {
        success: false,
        error: error.message,
        userFriendlyResponse: "I encountered an error processing your request. Please try again."
      };
    }
  }

  async getAIResponse(message, user, extractedData = null) {
    try {
      // Check if OpenAI is configured
      if (!this.isConfigured) {
        logger.info('OpenAI not configured, using fallback processing', { 
          phoneNumber: user.whatsappNumber,
          messageType: 'text'
        });
        return this.fallbackProcessing(message, user);
      }

      // Build context for the AI
      const context = await this.buildUserContext(user);
      
      // Prepare the prompt
      const userPrompt = `
USER CONTEXT:
- Name: ${user.firstName || 'Unknown'} ${user.lastName || ''}
- Phone: ${user.whatsappNumber}
- Wallet Balance: ₦${context.walletBalance}
- KYC Status: ${user.kycStatus}
- Recent Activity: ${context.recentActivity}

${extractedData ? `EXTRACTED DATA FROM IMAGE/DOCUMENT:\n${JSON.stringify(extractedData, null, 2)}\n` : ''}

USER MESSAGE: "${message}"

Extract intent and data from this message. Consider the user context and any extracted data. Return a JSON response following the specified format.`;

      const response = await axios.post(`${this.openaiBaseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      }, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      const aiResult = JSON.parse(response.data.choices[0].message.content);
      
      // Log AI response for monitoring - handle gracefully if DB unavailable
      try {
        await ActivityLog.logUserActivity(
          user.id,
          'ai_processing',
          'intent_extracted',
          {
            source: 'system',
            description: 'AI extracted intent from user message',
            intent: aiResult.intent,
            confidence: aiResult.confidence,
            hasExtractedData: !!extractedData
          }
        );
      } catch (dbError) {
        logger.warn('Failed to log AI activity - continuing without logging', { error: dbError.message });
      }

      return aiResult;

    } catch (error) {
      logger.error('OpenAI API call failed', { 
        error: error.message, 
        phoneNumber: user.whatsappNumber,
        errorType: error.response?.status || 'unknown'
      });
      
      // Fallback to rule-based processing if AI fails
      logger.info('Using fallback processing due to AI failure', { phoneNumber: user.whatsappNumber });
      return this.fallbackProcessing(message, user);
    }
  }

  async buildUserContext(user) {
    try {
      const wallet = await walletService.getUserWallet(user.id);
      const recentTransactions = await transactionService.getRecentTransactions(user.id, 3);
      
      return {
        walletBalance: wallet ? parseFloat(wallet.balance).toLocaleString() : '0',
        recentActivity: recentTransactions.length > 0 
          ? recentTransactions.map(t => `${t.type}: ₦${t.amount}`).join(', ')
          : 'No recent activity'
      };
    } catch (error) {
      logger.error('Failed to build user context', { error: error.message, userId: user.id });
      return { walletBalance: '0', recentActivity: 'No data available' };
    }
  }

  async processIntent(aiResponse, user, originalMessage) {
    try {
      const { intent, extractedData, confidence } = aiResponse;
      
      // Check user eligibility for transactions
      if (this.isTransactionIntent(intent)) {
        if (!user.canPerformTransactions()) {
          return {
            intent: 'REGISTRATION_REQUIRED',
            message: "🔐 To perform transactions, please complete your account setup first.\n\nYou need to:\n✅ Complete KYC verification\n✅ Set up your transaction PIN\n\nType 'help' for assistance with account setup.",
            requiresAction: 'COMPLETE_REGISTRATION'
          };
        }
      }

      // Process based on intent
      switch (intent) {
        case 'GREETING':
          return {
            intent: 'GREETING',
            message: aiResponse.message || `Hello ${user.fullName || 'there'}! 👋\n\nI'm MiiMii, your financial assistant. I can help you with:\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do today?`,
            requiresAction: 'NONE'
          };
          
        case 'TRANSFER_MONEY':
          return await this.handleMoneyTransfer(user, extractedData, aiResponse);
          
        case 'BANK_TRANSFER':
          return await this.handleBankTransfer(user, extractedData, aiResponse);
          
        case 'BUY_AIRTIME':
          return await this.handleAirtimePurchase(user, extractedData, aiResponse);
          
        case 'BUY_DATA':
          return await this.handleDataPurchase(user, extractedData, aiResponse);
          
        case 'PAY_BILL':
          return await this.handleBillPayment(user, extractedData, aiResponse);
          
        case 'CHECK_BALANCE':
          return await this.handleBalanceInquiry(user);
          
        case 'TRANSACTION_HISTORY':
          return await this.handleTransactionHistory(user, extractedData);
          
        case 'HELP':
          return this.handleHelp(user);
          
        case 'UNKNOWN':
        default:
          return {
            intent: 'UNKNOWN',
            message: aiResponse.message || "I didn't quite understand that. Could you please rephrase or type 'help' for assistance?",
            requiresAction: 'NONE'
          };
      }
    } catch (error) {
      logger.error('Intent processing failed', { error: error.message, userId: user.id });
      return {
        intent: 'ERROR',
        message: "I encountered an error processing your request. Please try again or contact support.",
        requiresAction: null
      };
    }
  }

  async handleMoneyTransfer(user, extractedData, aiResponse) {
    const { amount, phoneNumber, recipient } = extractedData;
    
    if (!amount || !phoneNumber) {
      return {
        intent: 'TRANSFER_MONEY',
        message: "To send money, I need the amount and recipient's phone number.\n\n📝 Example: 'Send 5000 to John 08123456789'",
        awaitingInput: 'transfer_details',
        context: 'money_transfer'
      };
    }

    // Validate amount
    const transferAmount = this.parseAmount(amount);
    if (transferAmount < 100) {
      return {
        intent: 'TRANSFER_MONEY',
        message: "Minimum transfer amount is ₦100. Please specify a valid amount.",
        awaitingInput: 'transfer_details',
        context: 'money_transfer'
      };
    }

    // Check wallet balance
    const wallet = await walletService.getUserWallet(user.id);
    if (!wallet.canDebit(transferAmount)) {
      return {
        intent: 'TRANSFER_MONEY',
        message: `Insufficient balance! You need ₦${transferAmount.toLocaleString()} but only have ₦${parseFloat(wallet.availableBalance).toLocaleString()}.`,
        requiresAction: 'FUND_WALLET'
      };
    }

    // Store transaction details and request PIN
    await user.updateConversationState({
      intent: 'TRANSFER_MONEY',
      awaitingInput: 'pin',
      transactionData: {
        amount: transferAmount,
        phoneNumber,
        recipient: recipient || phoneNumber,
        description: `Transfer to ${recipient || phoneNumber}`
      }
    });

    return {
      intent: 'TRANSFER_MONEY',
      message: `💸 *Transfer Confirmation*\n\n` +
               `💰 Amount: ₦${transferAmount.toLocaleString()}\n` +
               `👤 To: ${recipient || phoneNumber}\n` +
               `📱 Phone: ${phoneNumber}\n` +
               `💳 Fee: ₦${this.calculateTransferFee(transferAmount)}\n` +
               `💵 Total: ₦${(transferAmount + this.calculateTransferFee(transferAmount)).toLocaleString()}\n\n` +
               `🔐 Please enter your 4-digit PIN to authorize this transfer.`,
      awaitingInput: 'pin',
      context: 'transfer_verification',
      transactionDetails: {
        amount: transferAmount,
        fee: this.calculateTransferFee(transferAmount),
        recipient: recipient || phoneNumber,
        phoneNumber
      }
    };
  }

  async handleBankTransfer(user, extractedData, aiResponse) {
    const { amount, accountNumber, bankName, bankCode } = extractedData;
    
    if (!amount || !accountNumber) {
      return {
        intent: 'BANK_TRANSFER',
        message: "To transfer to a bank account, I need the amount, bank name, and account number.\n\n📝 Example: 'Transfer 10000 to GTBank 0123456789'",
        awaitingInput: 'bank_transfer_details',
        context: 'bank_transfer'
      };
    }

    // Start bank transfer process
    return await bankTransferService.initiateBankTransfer(user, {
      amount: this.parseAmount(amount),
      accountNumber,
      bankName,
      bankCode
    });
  }

  async handleAirtimePurchase(user, extractedData, aiResponse) {
    const { amount, phoneNumber, network } = extractedData;
    
    if (!amount) {
      return {
        intent: 'BUY_AIRTIME',
        message: "How much airtime would you like to buy?\n\n📝 Example: 'Buy 1000 airtime for 08123456789'",
        awaitingInput: 'airtime_amount',
        context: 'airtime_purchase'
      };
    }

    const targetPhone = phoneNumber || user.whatsappNumber;
    const airtimeAmount = this.parseAmount(amount);
    
    return await airtimeService.purchaseAirtime(user, {
      amount: airtimeAmount,
      phoneNumber: targetPhone,
      network: network || this.detectNetwork(targetPhone)
    });
  }

  async handleDataPurchase(user, extractedData, aiResponse) {
    const { amount, dataSize, phoneNumber, network } = extractedData;
    
    if (!dataSize && !amount) {
      return {
        intent: 'BUY_DATA',
        message: "What data bundle would you like to buy?\n\n📝 Examples:\n• 'Buy 1GB data'\n• 'Buy 2000 worth of data'\n• 'Buy 1GB data for 08123456789'",
        awaitingInput: 'data_details',
        context: 'data_purchase'
      };
    }

    const targetPhone = phoneNumber || user.whatsappNumber;
    
    return await dataService.purchaseData(user, {
      dataSize,
      amount: amount ? this.parseAmount(amount) : null,
      phoneNumber: targetPhone,
      network: network || this.detectNetwork(targetPhone)
    });
  }

  async handleBillPayment(user, extractedData, aiResponse) {
    const { amount, utilityProvider, meterNumber, billType } = extractedData;
    
    if (!utilityProvider || !meterNumber) {
      return {
        intent: 'PAY_BILL',
        message: "To pay a bill, I need the utility provider and meter/account number.\n\n📝 Examples:\n• 'Pay 5000 electricity EKEDC 12345678901'\n• 'Pay 3000 cable DStv 123456789'",
        awaitingInput: 'bill_details',
        context: 'bill_payment'
      };
    }

    return await utilityService.payBill(user, {
      amount: amount ? this.parseAmount(amount) : null,
      utilityProvider,
      meterNumber,
      billType: billType || 'electricity'
    });
  }

  async handleBalanceInquiry(user) {
    return {
      intent: 'CHECK_BALANCE',
      message: '',
      requiresAction: 'SHOW_BALANCE'
    };
  }

  async handleTransactionHistory(user, extractedData) {
    const limit = extractedData?.limit || 10;
    const transactions = await transactionService.getRecentTransactions(user.id, limit);
    
    if (transactions.length === 0) {
      return {
        intent: 'TRANSACTION_HISTORY',
        message: "📊 *Transaction History*\n\nNo transactions found. Start by funding your wallet or making your first transaction!"
      };
    }

    let historyMessage = `📊 *Recent Transactions*\n\n`;
    transactions.forEach((tx, index) => {
      const icon = tx.type === 'credit' ? '✅' : '💸';
      historyMessage += `${icon} ₦${parseFloat(tx.amount).toLocaleString()} - ${tx.description}\n`;
      historyMessage += `   ${new Date(tx.createdAt).toLocaleDateString()} | ${tx.status}\n\n`;
    });

    return {
      intent: 'TRANSACTION_HISTORY',
      message: historyMessage
    };
  }

  handleHelp(user) {
    return {
      intent: 'HELP',
      message: '',
      requiresAction: 'SHOW_HELP'
    };
  }

  handleUnknownIntent(user, message, confidence) {
    if (confidence < 0.3) {
      return {
        intent: 'UNCLEAR',
        message: "I didn't quite understand that. Could you try rephrasing? Or type 'help' to see what I can do for you. 😊"
      };
    }

    return {
      intent: 'UNKNOWN',
      message: "I'm still learning! I think I understand what you want, but I'm not sure how to help with that yet. Type 'help' to see what I can currently do."
    };
  }

  async handleConversationFlow(user, message, conversationState) {
    const { intent, awaitingInput, transactionData } = conversationState;
    
    switch (awaitingInput) {
      case 'pin':
        return await this.handlePinVerification(user, message, transactionData);
        
      case 'transfer_details':
        return await this.handleTransferDetailsCollection(user, message);
        
      case 'bank_transfer_details':
        return await this.handleBankTransferDetailsCollection(user, message);
        
      default:
        // Clear conversation state and process as new message
        await user.clearConversationState();
        return await this.processUserMessage(user.whatsappNumber, message);
    }
  }

  async handlePinVerification(user, message, transactionData) {
    const pin = message.trim().replace(/\s+/g, '');
    
    if (!/^\d{4}$/.test(pin)) {
      return {
        intent: 'PIN_VERIFICATION',
        message: "Please enter your 4-digit PIN (numbers only).",
        awaitingInput: 'pin',
        context: 'pin_verification'
      };
    }

    // Verify PIN
    const isValidPin = await user.validatePin(pin);
    if (!isValidPin) {
      await user.update({ pinAttempts: user.pinAttempts + 1 });
      
      if (user.pinAttempts >= 3) {
        await user.update({ 
          pinLockedUntil: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        });
        
        return {
          intent: 'PIN_LOCKED',
          message: "❌ Too many incorrect PIN attempts. Your account is temporarily locked for 30 minutes for security."
        };
      }

      return {
        intent: 'PIN_VERIFICATION',
        message: `❌ Incorrect PIN. You have ${3 - user.pinAttempts} attempts remaining.`,
        awaitingInput: 'pin',
        context: 'pin_verification'
      };
    }

    // PIN is correct, reset attempts and execute transaction
    await user.update({ pinAttempts: 0 });
    await user.clearConversationState();

    // Execute the transaction based on intent
    return await this.executeTransaction(user, transactionData);
  }

  async executeTransaction(user, transactionData) {
    try {
      const { intent } = user.conversationState;
      
      switch (intent) {
        case 'TRANSFER_MONEY':
          return await this.executeMoneyTransfer(user, transactionData);
        default:
          throw new Error('Unknown transaction intent');
      }
    } catch (error) {
      logger.error('Transaction execution failed', { error: error.message, userId: user.id });
      return {
        intent: 'TRANSACTION_ERROR',
        message: "❌ Transaction failed. Please try again or contact support."
      };
    }
  }

  async executeMoneyTransfer(user, transactionData) {
    try {
      const result = await transactionService.executeTransfer(user, transactionData);
      
      if (result.success) {
        return {
          intent: 'TRANSFER_COMPLETED',
          message: result.message,
          transactionDetails: result.transaction
        };
      } else {
        return {
          intent: 'TRANSFER_FAILED',
          message: result.error || "Transfer failed. Please try again."
        };
      }
    } catch (error) {
      logger.error('Money transfer execution failed', { error: error.message, userId: user.id });
      return {
        intent: 'TRANSFER_FAILED',
        message: "❌ Transfer failed due to a technical error. Please try again."
      };
    }
  }

  // Helper methods
  parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Handle "k" suffix (thousands)
    if (amountStr.toString().toLowerCase().includes('k')) {
      return parseInt(amountStr.replace(/[k,\s]/gi, '')) * 1000;
    }
    
    // Handle regular numbers with commas
    return parseInt(amountStr.toString().replace(/[,\s]/g, ''));
  }

  detectNetwork(phoneNumber) {
    const number = phoneNumber.replace(/\D/g, '');
    const prefix = number.substring(0, 4);
    
    const networks = {
      'MTN': ['0803', '0806', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916'],
      'Airtel': ['0802', '0808', '0812', '0701', '0902', '0907', '0901'],
      'Glo': ['0805', '0807', '0815', '0811', '0905', '0915'],
      '9mobile': ['0809', '0817', '0818', '0908', '0909']
    };
    
    for (const [network, prefixes] of Object.entries(networks)) {
      if (prefixes.includes(prefix)) {
        return network;
      }
    }
    
    return 'MTN'; // Default fallback
  }

  calculateTransferFee(amount) {
    // Fee structure: ₦25 for amounts up to ₦5,000, ₦50 for higher amounts
    return amount <= 5000 ? 25 : 50;
  }

  isTransactionIntent(intent) {
    const transactionIntents = [
      'TRANSFER_MONEY', 'BANK_TRANSFER', 'BUY_AIRTIME', 
      'BUY_DATA', 'PAY_BILL'
    ];
    return transactionIntents.includes(intent);
  }

  // Fallback processing when AI is unavailable
  fallbackProcessing(message, user) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Handle greetings and welcome messages
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'start', 'begin'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) || lowerMessage.length < 10) {
      return { 
        success: true, 
        intent: 'GREETING', 
        extractedData: {}, 
        confidence: 0.9,
        message: `Hello ${user.fullName || 'there'}! 👋\n\nI'm MiiMii, your financial assistant. I can help you with:\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do today?`
      };
    }
    
    // Default fallback
    return { 
      success: true, 
      intent: 'UNKNOWN', 
      extractedData: {}, 
      confidence: 0.5,
      message: `I'm not sure I understood that. You can say:\n\n💰 "Check my balance"\n💸 "Send 5k to John"\n📱 "Buy 1GB data"\n💳 "Pay electricity bill"\n\nOr just say "help" for more options!`
    };
  }

  // Generate personalized welcome message for new users
  async generatePersonalizedWelcome(userName, phoneNumber) {
    try {
      if (!this.isConfigured) {
        // Fallback to template-based welcome
        return this.generateTemplateWelcome(userName);
      }

      const currentHour = new Date().getHours();
      let timeGreeting = '';
      
      if (currentHour < 12) {
        timeGreeting = '🌅 Good morning';
      } else if (currentHour < 17) {
        timeGreeting = '☀️ Good afternoon';
      } else {
        timeGreeting = '🌙 Good evening';
      }

      const prompt = `Generate a short, warm welcome message for a new MiiMii user (around 30 words).

User Details:
- Name: ${userName || 'there'}
- Time: ${timeGreeting}
- Platform: WhatsApp Financial Assistant

Requirements:
1. Start with "Hey [Name]! 👋" using the user's actual name
2. Keep it under 30 words total
3. Mention completing onboarding process
4. Briefly mention what MiiMii can do (payments, transactions, etc.)
5. Be warm and friendly
6. Use emojis sparingly but effectively
7. End with a call to action about starting setup

Example format: "Hey Designer! 👋 Before we dive in, please complete the onboarding process so I can get to know you better. Once that's done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨"

Tone: Friendly, professional, and excited about helping with finances.

Format the response as a WhatsApp message with proper formatting.`;

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: 'You are MiiMii, a friendly WhatsApp financial assistant. Create short, warm welcome messages around 30 words.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 150,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiMessage = response.data.choices[0].message.content.trim();
      
      logger.info('Generated personalized welcome message', {
        userName,
        phoneNumber,
        messageLength: aiMessage.length,
        hasAI: true
      });

      return aiMessage;

    } catch (error) {
      logger.error('Failed to generate AI welcome message', {
        error: error.message,
        userName,
        phoneNumber
      });
      
      // Fallback to template-based welcome
      return this.generateTemplateWelcome(userName);
    }
  }

  // Generate template-based welcome message as fallback
  generateTemplateWelcome(userName) {
    const currentHour = new Date().getHours();
    let timeGreeting = '';
    
    if (currentHour < 12) {
      timeGreeting = '🌅 Good morning';
    } else if (currentHour < 17) {
      timeGreeting = '☀️ Good afternoon';
    } else {
      timeGreeting = '🌙 Good evening';
    }

    const personalGreeting = userName ? `Hey ${userName}! 👋` : `Hey there! 👋`;

    return `${personalGreeting} Before we dive in, please complete the onboarding process so I can get to know you better. Once that's done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨`;
  }
}

module.exports = new AIAssistantService();
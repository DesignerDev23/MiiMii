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
    // Use ONLY AI_API_KEY - remove OPENAI_API_KEY fallback
    this.openaiApiKey = process.env.AI_API_KEY;
    this.openaiBaseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    // Use a valid default model; sanitize unsupported env values (e.g., gpt-5*)
    const envModel = (process.env.AI_MODEL || '').trim();
    this.model = envModel && !/gpt-5/i.test(envModel) ? envModel : 'gpt-4o-mini';
    
    // Enhanced logging for API key debugging
    const mask = (v) => {
      if (!v) return 'NOT_SET';
      if (v.length < 8) return 'TOO_SHORT';
      return `${v.slice(0, 4)}***${v.slice(-4)}`;
    };
    
    // Log all relevant environment variables for debugging
    logger.info('AI Assistant Environment Variables', {
      AI_API_KEY: mask(process.env.AI_API_KEY),
      AI_BASE_URL: process.env.AI_BASE_URL || 'DEFAULT',
      AI_MODEL: process.env.AI_MODEL || 'DEFAULT',
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET'
    });
    
    // Validate OpenAI configuration
    this.isConfigured = !!this.openaiApiKey;
    if (!this.isConfigured) {
      logger.warn('AI_API_KEY not configured - AI features will use fallback processing');
    } else {
      // Validate API key format
      if (!this.openaiApiKey.startsWith('sk-')) {
        logger.error('Invalid AI_API_KEY format - should start with "sk-"', {
          apiKeyPreview: mask(this.openaiApiKey),
          apiKeyLength: this.openaiApiKey.length
        });
        this.isConfigured = false;
      } else if (this.openaiApiKey.length !== 51) {
        logger.warn('AI_API_KEY length is unusual - expected 51 characters', {
          apiKeyPreview: mask(this.openaiApiKey),
          apiKeyLength: this.openaiApiKey.length,
          expectedLength: 51
        });
      }
      
      logger.info('AI assistant initialized', {
        model: this.model,
        baseUrl: this.openaiBaseUrl,
        hasKey: !!this.openaiApiKey,
        apiKeyPreview: mask(this.openaiApiKey),
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0,
        apiKeyStartsWith: this.openaiApiKey ? this.openaiApiKey.substring(0, 3) : 'N/A',
        isValidFormat: this.openaiApiKey ? this.openaiApiKey.startsWith('sk-') : false
      });
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
          /(?:show\s+)?(?:my\s+)?(?:transaction\s+)?history/i,
          /(?:view\s+)?(?:my\s+)?(?:transaction\s+)?statement/i
        ]
      },
      GREETING: {
        keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'start', 'begin'],
        patterns: [
          /^(hi|hello|hey|good\s+(morning|afternoon|evening))/i,
          /^(start|begin)/i
        ]
      },
      HELP: {
        keywords: ['help', 'support', 'assist', 'guide', 'what can you do'],
        patterns: [
          /^(help|support|assist|guide)/i,
          /what\s+can\s+you\s+do/i
        ]
      }
    };

    // System prompt for AI responses
    this.systemPrompt = `You are MiiMii, a friendly and helpful financial assistant for a Nigerian fintech platform. Your role is to:

1. Analyze user messages to understand their intent
2. Extract relevant financial data (amounts, phone numbers, account details)
3. Provide helpful responses and guide users through financial transactions
4. Maintain a warm, professional tone with appropriate emojis

Available Services:
- Money transfers (P2P)
- Bank transfers
- Airtime purchases
- Data purchases
- Bill payments (electricity, cable, water, internet)
- Balance inquiries
- Transaction history

Response Format (JSON):
{
  "intent": "intent_name",
  "confidence": 0.95,
  "extractedData": {
    "amount": 1000,
    "recipientPhone": "08012345678",
    "recipientName": "John",
    "service": "airtime",
    "network": "MTN"
  },
  "response": "I'll help you with that! Please confirm the details...",
  "requiresConfirmation": true,
  "nextStep": "confirm_transaction"
}

Be accurate, helpful, and always prioritize user security.`;

    // Test API key validity on startup
    this.validateApiKey();
  }

  // Add API key validation method
  async validateApiKey() {
    if (!this.isConfigured || !this.openaiApiKey) {
      logger.warn('Skipping API key validation - AI_API_KEY not configured');
      return false;
    }

    try {
      logger.info('Validating AI_API_KEY with OpenAI...');
      
      const response = await axios.get(`${this.openaiBaseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      if (response.status === 200) {
        logger.info('✅ AI_API_KEY validation successful', {
          apiKeyPreview: `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}`,
          availableModels: response.data.data?.length || 0
        });
        return true;
      } else {
        logger.error('❌ AI_API_KEY validation failed - unexpected status', {
          status: response.status,
          apiKeyPreview: `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}`
        });
        return false;
      }
    } catch (error) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      logger.error('❌ AI_API_KEY validation failed', {
        status: status || 'unknown',
        error: errorMessage,
        apiKeyPreview: `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}`,
        apiKeyLength: this.openaiApiKey.length
      });

      if (status === 401) {
        logger.error('🔑 AI_API_KEY is invalid or expired - AI features will use fallback processing');
        this.isConfigured = false;
      } else if (status === 429) {
        logger.warn('⚠️ Rate limit exceeded during API key validation - this is normal');
      } else {
        logger.warn('⚠️ API key validation failed due to network/connection issues');
      }
      
      return false;
    }
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

      // Log the API key being used for the request (masked for security)
      const mask = (v) => {
        if (!v) return 'NOT_SET';
        if (v.length < 8) return 'TOO_SHORT';
        return `${v.slice(0, 4)}***${v.slice(-4)}`;
      };
      
      logger.info('Making AI API request', {
        url: `${this.openaiBaseUrl}/chat/completions`,
        model: this.model,
        apiKeyUsed: mask(this.openaiApiKey),
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0,
        apiKeyStartsWith: this.openaiApiKey ? this.openaiApiKey.substring(0, 3) : 'N/A'
      });

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
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      logger.error('OpenAI API call failed', { 
        error: errorMessage, 
        status: status || 'unknown',
        phoneNumber: user.whatsappNumber,
        apiKeyPreview: this.openaiApiKey ? `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}` : 'NOT_SET',
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0
      });
      
      if (status === 401) {
        logger.error('🔑 AI_API_KEY is invalid or expired - check your OpenAI API key', {
          apiKeyPreview: this.openaiApiKey ? `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}` : 'NOT_SET',
          apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0,
          expectedLength: 51,
          suggestion: 'Generate a new API key from OpenAI dashboard'
        });
      } else if (status === 429) {
        logger.warn('⚠️ Rate limit exceeded - this is normal for high usage');
      } else if (status === 400) {
        logger.warn('⚠️ Bad request - check the model and request format');
      }
      
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
      const timeGreeting = this.getTimeGreeting();
      
      const prompt = `Generate a short, warm welcome message for a new MiiMii user (around 30 words).

User Details:
- Name: ${userName || 'there'}
- Time: ${timeGreeting}
- Platform: WhatsApp Financial Assistant

Requirements:
1. Start with "Hey [Name]! 👋" using the user's actual WhatsApp profile name
2. Introduce yourself as "I'm MiiMii, your financial assistant"
3. Keep it under 30 words total
4. Mention completing onboarding process
5. Briefly mention what MiiMii can do (payments, transactions, etc.)
6. Be warm and friendly
7. Use emojis sparingly but effectively
8. End with a call to action about starting setup

Example format: "Hey Designer! 👋 I'm MiiMii, your financial assistant. Before we dive in, please complete the onboarding process so I can get to know you better. Once that's done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨"

Tone: Friendly, professional, and excited about helping with finances.

Format the response as a WhatsApp message with proper formatting.`;

      // Log the API key being used for welcome message generation
      const mask = (v) => {
        if (!v) return 'NOT_SET';
        if (v.length < 8) return 'TOO_SHORT';
        return `${v.slice(0, 4)}***${v.slice(-4)}`;
      };
      
      logger.info('Generating personalized welcome message', {
        url: `${this.openaiBaseUrl}/chat/completions`,
        model: this.model,
        apiKeyUsed: mask(this.openaiApiKey),
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0,
        apiKeyStartsWith: this.openaiApiKey ? this.openaiApiKey.substring(0, 3) : 'N/A'
      });

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are MiiMii, a friendly financial assistant. Generate personalized welcome messages that are concise, warm, and professional. Always use the user\'s actual WhatsApp profile name in the greeting.'
            },
            {
              role: 'user',
              content: prompt
            }
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

      const personalizedMessage = response.data.choices[0]?.message?.content?.trim();
      
      if (personalizedMessage) {
        logger.info('Generated personalized welcome message', {
          userName,
          phoneNumber,
          messageLength: personalizedMessage.length,
          message: personalizedMessage.substring(0, 100) + '...'
        });
        return personalizedMessage;
      }

      // Fallback to template message
      return this.generateTemplateWelcome(userName, timeGreeting);
      
    } catch (error) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      logger.error('Failed to generate personalized welcome message', {
        error: errorMessage,
        status: status || 'unknown',
        userName,
        phoneNumber,
        apiKeyPreview: this.openaiApiKey ? `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}` : 'NOT_SET',
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0
      });
      
      if (status === 401) {
        logger.error('🔑 AI_API_KEY is invalid or expired for welcome message generation');
      }
      
      // Fallback to template message
      return this.generateTemplateWelcome(userName, this.getTimeGreeting());
    }
  }

  generateTemplateWelcome(userName, timeGreeting) {
    const name = userName || 'there';
    return `Hey ${name}! 👋 I'm MiiMii, your financial assistant. Before we dive in, please complete the onboarding process so I can get to know you better. Once that's done, I can help you with all sorts of things like managing payments, tracking transactions, and more! 💰✨`;
  }

  getTimeGreeting() {
    const currentHour = new Date().getHours();
    if (currentHour < 12) {
      return '🌅 Good morning';
    } else if (currentHour < 17) {
      return '☀️ Good afternoon';
    } else {
      return '🌙 Good evening';
    }
  }

  /**
   * Analyze user message to determine intent
   */
  async analyzeUserIntent(message, user) {
    try {
      if (!this.isConfigured) {
        // Fallback to basic keyword matching
        return this.basicIntentAnalysis(message);
      }

      const prompt = `Analyze this WhatsApp message and determine the user's intent.

Message: "${message}"

User Context:
- Onboarding Status: ${user.onboardingStep || 'unknown'}
- Account Status: ${user.onboardingStep === 'completed' ? 'completed' : 'incomplete'}

Possible Intents:
1. onboarding/setup_account - User wants to start or continue account setup
2. balance/check_balance - User wants to check account balance
3. transfer/send_money - User wants to transfer money
4. airtime/buy_airtime - User wants to buy airtime
5. data/buy_data - User wants to buy data
6. bills/pay_bills - User wants to pay bills
7. help/support - User needs help or support
8. menu/services - User wants to see available services
9. account_details - User wants account information
10. greeting - General greeting or hello
11. unknown - Cannot determine intent

Instructions:
- Analyze the message content and context
- Consider user's onboarding status
- Return the most likely intent
- Provide confidence level (0-1)
- Suggest appropriate action

Response format:
{
  "intent": "intent_name",
  "confidence": 0.95,
  "suggestedAction": "action_description",
  "reasoning": "why this intent was chosen"
}`;

      // Log the API key being used for intent analysis
      const mask = (v) => {
        if (!v) return 'NOT_SET';
        if (v.length < 8) return 'TOO_SHORT';
        return `${v.slice(0, 4)}***${v.slice(-4)}`;
      };
      
      logger.info('Analyzing user intent with AI', {
        url: `${this.openaiBaseUrl}/chat/completions`,
        model: this.model,
        apiKeyUsed: mask(this.openaiApiKey),
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0,
        apiKeyStartsWith: this.openaiApiKey ? this.openaiApiKey.substring(0, 3) : 'N/A'
      });

      const response = await axios.post(`${this.openaiBaseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that analyzes WhatsApp messages to determine user intent for a financial services bot. Be accurate and concise.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      }, {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const analysisText = response.data.choices[0]?.message?.content?.trim();
      
      if (analysisText) {
        try {
          const analysis = JSON.parse(analysisText);
          logger.info('AI intent analysis completed', {
            message: message.substring(0, 50) + '...',
            intent: analysis.intent,
            confidence: analysis.confidence
          });
          return analysis;
        } catch (parseError) {
          logger.warn('Failed to parse AI intent analysis, using fallback', {
            error: parseError.message,
            analysisText
          });
          return this.basicIntentAnalysis(message);
        }
      }

      return this.basicIntentAnalysis(message);
      
    } catch (error) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      logger.error('AI intent analysis failed', {
        error: errorMessage,
        status: status || 'unknown',
        message: message.substring(0, 50) + '...',
        apiKeyPreview: this.openaiApiKey ? `${this.openaiApiKey.substring(0, 4)}***${this.openaiApiKey.substring(this.openaiApiKey.length - 4)}` : 'NOT_SET',
        apiKeyLength: this.openaiApiKey ? this.openaiApiKey.length : 0
      });
      
      if (status === 401) {
        logger.error('🔑 AI_API_KEY is invalid or expired for intent analysis');
      } else if (status === 429) {
        logger.warn('⚠️ Rate limit exceeded during intent analysis');
      }
      
      return this.basicIntentAnalysis(message);
    }
  }

  /**
   * Basic keyword-based intent analysis as fallback
   */
  basicIntentAnalysis(message) {
    const lowerMessage = (message || '').toLowerCase();

    // Highest priority: explicit account details requests
    if (/(virtual\s+account|account\s+(details|detail|info|information|number|no)|bank\s+details)/i.test(message)) {
      return { intent: 'account_details', confidence: 0.95, suggestedAction: 'Show virtual account details' };
    }

    // Onboarding keywords (do NOT match generic 'account')
    if (/(start|setup|set\s*up|onboard|register|create\s+account|open\s+account)/i.test(message)) {
      return { intent: 'onboarding', confidence: 0.85, suggestedAction: 'Start onboarding flow' };
    }

    // Balance keywords (avoid generic 'money')
    if (/(balance|how\s+much\s+(do\s+)?i\s+have)/i.test(message)) {
      return { intent: 'balance', confidence: 0.9, suggestedAction: 'Check account balance' };
    }

    // Transfer keywords
    if (/(transfer|send)(\s|$)/i.test(message)) {
      return { intent: 'transfer', confidence: 0.9, suggestedAction: 'Initiate money transfer' };
    }

    // Airtime keywords
    if (/(airtime|recharge|top\s*up)/i.test(message)) {
      return { intent: 'airtime', confidence: 0.9, suggestedAction: 'Buy airtime' };
    }

    // Data keywords
    if (/(\bdata\b|internet|\bmb\b|\bgb\b)/i.test(message)) {
      return { intent: 'data', confidence: 0.85, suggestedAction: 'Buy data bundle' };
    }

    // Bills keywords (ensure presence of bill-like terms)
    if (/(bill|electric|electricity|cable|tv|water)/i.test(message)) {
      return { intent: 'bills', confidence: 0.8, suggestedAction: 'Pay utility bills' };
    }

    // Help keywords
    if (/(help|support|problem|issue)/i.test(message)) {
      return { intent: 'help', confidence: 0.9, suggestedAction: 'Provide help and support' };
    }

    // Menu keywords
    if (/(menu|services?|options?)/i.test(message)) {
      return { intent: 'menu', confidence: 0.8, suggestedAction: 'Show available services' };
    }

    // Greeting keywords
    if (/(^|\b)(hi|hello|hey)(\b|$)/i.test(message)) {
      return { intent: 'greeting', confidence: 0.9, suggestedAction: 'Send welcome message' };
    }

    return { intent: 'unknown', confidence: 0.5, suggestedAction: 'Ask for clarification' };
  }
}

module.exports = new AIAssistantService();
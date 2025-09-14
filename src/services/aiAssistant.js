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
          /send\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\w+\s*bank|\w+)\s+(\d{10})/i,
          /send\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\d{8,11})\s+(\w+\s*bank|\w+)/i,
          /transfer\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\d{8,11})\s+(\w+\s*bank|\w+)/i,
          /send\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\d{8,11})\s+(\w+)/i,
          /transfer\s+(\d+k?|\d+(?:,\d{3})*)\s+to\s+(\d{8,11})\s+(\w+)/i
        ]
      },
      BUY_AIRTIME: {
        keywords: ['airtime', 'recharge', 'top up', 'credit', 'load', 'buy airtime', 'purchase airtime'],
        patterns: [
          /buy\s+(\d+k?|\d+(?:,\d{3})*)\s+airtime(?:\s+for)?\s*(\d{11})?/i,
          /(\d+k?|\d+(?:,\d{3})*)\s+airtime(?:\s+for)?\s*(\d{11})?/i,
          /recharge\s+(\d{11})?\s*(?:with)?\s*(\d+k?|\d+(?:,\d{3})*)/i,
          /top\s+up\s+(\d{11})?\s*(?:with)?\s*(\d+k?|\d+(?:,\d{3})*)/i,
          /load\s+(\d{11})?\s*(?:with)?\s*(\d+k?|\d+(?:,\d{3})*)/i,
          /credit\s+(\d{11})?\s*(?:with)?\s*(\d+k?|\d+(?:,\d{3})*)/i
        ]
      },
      BUY_DATA: {
        keywords: ['data', 'internet', 'mb', 'gb', 'buy data', 'purchase data', 'data bundle', 'internet bundle'],
        patterns: [
          /buy\s+(\d+(?:\.\d+)?(?:mb|gb))\s+data(?:\s+for)?\s*(\d{11})?/i,
          /(\d+(?:\.\d+)?(?:mb|gb))\s+data(?:\s+for)?\s*(\d{11})?/i,
          /(\d+k?|\d+(?:,\d{3})*)\s+worth\s+of\s+data(?:\s+for)?\s*(\d{11})?/i,
          /buy\s+(\d+(?:\.\d+)?(?:mb|gb))\s+(?:internet|bundle)(?:\s+for)?\s*(\d{11})?/i,
          /(\d+(?:\.\d+)?(?:mb|gb))\s+(?:internet|bundle)(?:\s+for)?\s*(\d{11})?/i,
          /data\s+bundle\s+(\d+(?:\.\d+)?(?:mb|gb))(?:\s+for)?\s*(\d{11})?/i
        ]
      },
      PAY_BILL: {
        keywords: ['bill', 'electric', 'electricity', 'cable', 'tv', 'water', 'internet bill', 'pay bill', 'utility', 'disco'],
        patterns: [
          /pay\s+(\d+k?|\d+(?:,\d{3})*)\s+(electricity|electric|cable|tv|water|internet)\s+(?:bill\s+)?(?:for\s+)?(\w+)?\s*(\d+)/i,
          /(electricity|electric|cable|tv|water|internet)\s+bill\s+(\d+k?|\d+(?:,\d{3})*)\s+(\w+)?\s*(\d+)/i,
          /pay\s+(\d+k?|\d+(?:,\d{3})*)\s+(?:for\s+)?(ikeja|eko|kano|port\s+harcourt|joss|ibadan|enugu|kaduna|abuja|benin|phed)\s+(?:electricity|electric)\s+(?:bill\s+)?(?:for\s+)?(\d+)/i,
          /(ikeja|eko|kano|port\s+harcourt|joss|ibadan|enugu|kaduna|abuja|benin|phed)\s+(?:electricity|electric)\s+bill\s+(\d+k?|\d+(?:,\d{3})*)\s+(?:for\s+)?(\d+)/i,
          /pay\s+(\d+k?|\d+(?:,\d{3})*)\s+(?:for\s+)?(dstv|gotv|startime)\s+(?:subscription|bill)\s+(?:for\s+)?(\d+)/i,
          /(dstv|gotv|startime)\s+(?:subscription|bill)\s+(\d+k?|\d+(?:,\d{3})*)\s+(?:for\s+)?(\d+)/i
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
    this.systemPrompt = `You are MiiMii, a friendly financial assistant. Talk like a real person - warm, casual, and natural. Use proper English, not pidgin!

🚨 CRITICAL OVERRIDE RULES (MUST FOLLOW):
1. ALL transfers are "bank_transfer" - NO P2P transfers
2. If message contains "opay" or "opay bank" → intent MUST be "bank_transfer"
3. All phone numbers and account numbers are treated as bank accounts
4. Opay is ALWAYS a bank_transfer

CRITICAL RULE: Any message containing "opay" or "opay bank" MUST be classified as "bank_transfer" intent, regardless of the account number format. Opay is a digital bank, not a P2P transfer.

OVERRIDE RULE: If the message contains "opay" or "opay bank", the intent MUST be "bank_transfer" - this overrides all other rules.

Your personality:
- Friendly and approachable like a helpful friend
- Use natural, proper English (not Nigerian pidgin)
- Keep responses short and to the point
- Be conversational, not formal
- Use emojis naturally (not too many)
- Sound human, not like an AI

Available Services:
- Money transfers (P2P)
- Bank transfers
- Airtime purchases (MTN, Airtel, Glo, 9mobile)
- Data purchases (MTN, Airtel, Glo, 9mobile)
- Bill payments (Electricity, Cable TV)
- Balance inquiries
- Transaction history

IMPORTANT: Use these exact intent names:
- "transfer" for P2P money transfers (to phone numbers only)
- "bank_transfer" for bank transfers (when bank name is mentioned)
- "airtime" for airtime purchases
- "data" for data purchases
- "bills" for bill payments
- "balance" for balance inquiries
- "help" for help requests
- "menu" for service menu
- "greeting" for greetings

TRANSFER INTENT RULES:
- ALL transfers are "bank_transfer" - NO P2P transfers
- Use "bank_transfer" for ALL money transfers (phone numbers, account numbers, any bank)
- CRITICAL: If "opay" or "opay bank" appears anywhere in the message, it's ALWAYS "bank_transfer"
- ALL NUMBERS RULE: All numbers (10-digit, 11-digit, any format) are treated as bank accounts
- Examples:
  * "Send 100 to 9072874728 opay bank" → "bank_transfer" (Opay account)
  * "Send 100 naira to 9072874728 Opay bank" → "bank_transfer" (Opay account)
  * "Transfer 5k to 9072874728 opay" → "bank_transfer" (Opay account)
  * "Send 100 to 9072874728" → "bank_transfer" (bank account)
  * "Transfer 5k to GTBank 1234567890" → "bank_transfer" (bank account)
  * "Send 5k to John 08123456789" → "bank_transfer" (bank account)
  * "Send 1000 to 9072874728 opay" → "bank_transfer" (Opay account)
  * "Transfer 2k to 9072874728 opay bank" → "bank_transfer" (Opay account)
  * "Send 500 to 9072874728 opay" → "bank_transfer" (Opay account)
  * "Transfer 1k to 9072874728 opay bank" → "bank_transfer" (Opay account)

Response Style Examples:
❌ DON'T SAY: "I understand you want to transfer funds. Please provide your PIN to authorize this transaction."
✅ SAY: "Got it! Sending ₦5k to John. Just need your PIN 🔐"

❌ DON'T SAY: "I am processing your request for airtime purchase."
✅ SAY: "Cool! ₦1k airtime coming up. PIN please?"

❌ DON'T SAY: "Your balance inquiry has been processed successfully."
✅ SAY: "You've got ₦25,000 in your wallet 💰"

❌ DON'T SAY: "Make I send money give you" (pidgin)
✅ SAY: "Ready to send the money to you"

For ALL transfers (bank transfers only), extract:
- amount (convert "5k" to 5000, "10k" to 10000, etc.)
- accountNumber (any number format - 8-11 digits)
- bankName (bank name like "keystone", "gtb", "access", "opay", etc.)
- recipientName (if provided)

EXTRACTION RULES:
1. Amount: Look for numbers followed by "k" (5k = 5000) or plain numbers
2. Account Number: Look for 8-11 digit numbers (for ALL transfers)
3. Bank Name: Look for bank names in the message (GTBank, Access, Opay, etc.)
4. Recipient Name: Look for names before account numbers or bank names

ALL TRANSFERS ARE BANK TRANSFERS:
- ALL transfers use "bank_transfer" intent
- ALL transfers need: amount + accountNumber + bankName
- ALL numbers are treated as bank account numbers
- SPECIAL RULE: Opay account numbers often look like phone numbers (10-11 digits), but if "opay" or "opay bank" is mentioned, it's ALWAYS a bank_transfer
- Examples of ALL transfers:
  * "Send 100 to 9072874728 opay bank" → bank_transfer (9072874728 is Opay account number)
  * "Transfer 5k to 9072874728 opay" → bank_transfer
  * "Send 1000 to 9072874728 opay bank" → bank_transfer
  * "Send 5k to John 08123456789" → bank_transfer (bank account)

Response Format (JSON):

For Bank Transfer (including Opay):
{
  "intent": "bank_transfer",
  "confidence": 0.95,
  "extractedData": {
    "amount": 5000,
    "accountNumber": "6035745691",
    "bankName": "keystone",
    "recipientName": null
  },
  "response": "Perfect! Sending ₦5k to Keystone Bank. Just need your PIN 🔐",
  "suggestedAction": "Process bank transfer"
}

For ALL Transfers (Bank Transfers Only):
{
  "intent": "bank_transfer",
  "confidence": 0.95,
  "extractedData": {
    "amount": 5000,
    "accountNumber": "08123456789",
    "bankName": "unknown",
    "recipientName": "John"
  },
  "response": "Got it! Sending ₦5k to John. Just need your PIN 🔐",
  "suggestedAction": "Process bank transfer"
}

FINAL CHECK: ALL transfers are "bank_transfer" - NO P2P transfers. If the message contains "opay" or "opay bank", the intent MUST be "bank_transfer".

Keep responses natural, friendly, and human-like. Use proper English, not pidgin!`;

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
        case 'greeting':
          return {
            intent: 'greeting',
            message: aiResponse.message || `Hello ${user.fullName || 'there'}! 👋\n\nI'm MiiMii, your financial assistant. I can help you with:\n\n💰 Check Balance\n💸 Send Money\n📱 Buy Airtime/Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do today?`,
            requiresAction: 'NONE'
          };
          
        case 'transfer':
          return await this.handleMoneyTransfer(user, extractedData, aiResponse);
          
        case 'bank_transfer':
          return await this.handleBankTransfer(user, extractedData, aiResponse, originalMessage);
          
        case 'airtime':
          return await this.handleAirtimePurchase(user, extractedData, aiResponse);
          
        case 'data':
          return await this.handleDataPurchase(user, extractedData, aiResponse);
          
        case 'bills':
          return await this.handleBillPayment(user, extractedData, aiResponse);
          
        case 'balance':
          return await this.handleBalanceInquiry(user);
          
        case 'wallet_details':
        case 'account_info':
        case 'account_details':
          return await this.handleWalletDetails(user);
      
        case 'transaction_history':
          return await this.handleTransactionHistory(user, extractedData);
          
        case 'transfer_limits':
          return await this.handleTransferLimits(user);
      
        case 'balance_inquiry':
          return await this.handleBalanceInquiry(user);
          
        case 'help':
          return this.handleHelp(user);
          
        case 'menu':
          return {
            intent: 'menu',
            message: aiResponse.message || "📱 *Available Services*\n\n💰 Check Balance\n💸 Send Money\n🏦 Bank Transfer\n📱 Buy Airtime\n🌐 Buy Data\n💳 Pay Bills\n📊 Transaction History\n\nWhat would you like to do?",
            requiresAction: 'NONE'
          };
          
        case 'unknown':
        default:
          return {
            intent: 'unknown',
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
        intent: 'transfer',
        message: "To send money, I need the amount and recipient's phone number.\n\n📝 Example: 'Send 5000 to John 08123456789'",
        awaitingInput: 'transfer_details',
        context: 'money_transfer'
      };
    }

    // Validate amount
    const transferAmount = this.parseAmount(amount);
    if (transferAmount < 100) {
      return {
        intent: 'transfer',
        message: "Minimum transfer amount is ₦100. Please specify a valid amount.",
        awaitingInput: 'transfer_details',
        context: 'money_transfer'
      };
    }

    // Check wallet balance
    const wallet = await walletService.getUserWallet(user.id);
    if (!wallet.canDebit(transferAmount)) {
      return {
        intent: 'transfer',
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
      intent: 'transfer',
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

  async handleBankTransfer(user, extractedData, aiResponse, originalMessage = '') {
    const { amount, accountNumber, bankName, bankCode } = extractedData;
    
    // Debug: Log the extracted data
    logger.info('handleBankTransfer called with extracted data', {
      extractedData,
      amount,
      accountNumber,
      bankName,
      bankCode,
      aiResponse
    });
    
    if (!amount || !accountNumber) {
      logger.warn('Missing required data for bank transfer', {
        hasAmount: !!amount,
        hasAccountNumber: !!accountNumber,
        extractedData
      });
      return {
        intent: 'bank_transfer',
        message: "To transfer to a bank account, I need the amount, bank name, and account number.\n\n📝 Example: 'Transfer 10000 to GTBank 0123456789' or 'Send 4k to 9072874728 Opay Bank'",
        awaitingInput: 'bank_transfer_details',
        context: 'bank_transfer'
      };
    }

    try {
      const transferAmount = this.parseAmount(amount);
      
      // Validate amount
      if (transferAmount < 100) {
        return {
          intent: 'bank_transfer',
          message: "Minimum transfer amount is ₦100. Please specify a valid amount.",
          awaitingInput: 'bank_transfer_details',
          context: 'bank_transfer'
        };
      }

      // Check wallet balance with auto-sync
      const wallet = await walletService.getUserWallet(user.id);
      
      const totalBalance = parseFloat(wallet.balance || 0);
      const availableBalance = parseFloat(wallet.availableBalance || 0);
      const pendingBalance = parseFloat(wallet.pendingBalance || 0);
      
      // Auto-sync available balance if it's 0 but total balance is sufficient
      if (availableBalance === 0 && totalBalance >= transferAmount) {
        await wallet.update({
          availableBalance: totalBalance
        });
        logger.info('Auto-synced available balance for transfer', {
          userId: user.id,
          oldAvailableBalance: availableBalance,
          newAvailableBalance: totalBalance,
          totalBalance
        });
      }
      
      // Check if user can perform the transfer
      const canPerformTransfer = !wallet.isFrozen && 
                                wallet.isActive && 
                                wallet.complianceStatus === 'compliant' &&
                                (availableBalance >= transferAmount || totalBalance >= transferAmount);
      
      if (!canPerformTransfer) {
        let errorMessage = `❌ *Transfer Not Allowed*\n\n`;
        errorMessage += `💰 You need: ₦${transferAmount.toLocaleString()}\n`;
        errorMessage += `💵 Available: ₦${availableBalance.toLocaleString()}\n`;
        
        if (pendingBalance > 0) {
          errorMessage += `⏳ Pending: ₦${pendingBalance.toLocaleString()}\n`;
        }
        
        errorMessage += `📊 Total: ₦${totalBalance.toLocaleString()}\n\n`;
        
        if (wallet.isFrozen) {
          errorMessage += `❄️ Your wallet is frozen. Please contact support.`;
        } else if (!wallet.isActive) {
          errorMessage += `🚫 Your wallet is inactive. Please contact support.`;
        } else if (wallet.complianceStatus !== 'compliant') {
          errorMessage += `⚠️ Your account needs verification. Please complete KYC.`;
        } else if (pendingBalance > 0) {
          errorMessage += `You have ₦${pendingBalance.toLocaleString()} in pending transactions. Please wait for them to complete.`;
        } else if (totalBalance >= transferAmount) {
          errorMessage += `You have sufficient total balance but some funds may be held. Please contact support if this persists.`;
        } else {
          errorMessage += `Please fund your wallet to continue.`;
        }
        
        return {
          intent: 'bank_transfer',
          message: errorMessage,
          requiresAction: 'FUND_WALLET'
        };
      }

      // Resolve bank code with flexible prefix/synonym detection (BellBank API mapping first)
      let resolvedBankCode = bankCode;
      let resolvedBankName = bankName;
      const bellbankService = require('./bellbank');

      // 1) If we already have a bankName, try resolve directly
      if (!resolvedBankCode && bankName) {
        const bellbankService = require('./bellbank');
        // Try new resolver which supports 3-letter prefixes and synonyms
        resolvedBankCode = await bellbankService.resolveInstitutionCode(bankName);
        
        if (!resolvedBankCode) {
          // Fallback: try explicit bank list scanning
          try {
            logger.info('Fallback: scanning BellBank bank list for bank name', { bankName });
            const bankListResponse = await bellbankService.getBankList();
            if (bankListResponse.success && bankListResponse.banks) {
              const bankNameLower = bankName.toLowerCase().trim();
              const matchingBank = bankListResponse.banks.find(bank => {
                const institutionName = bank.institutionName.toLowerCase();
                return institutionName.includes(bankNameLower) || bankNameLower.includes(institutionName);
              });
              if (matchingBank) {
                resolvedBankCode = matchingBank.institutionCode;
                resolvedBankName = matchingBank.institutionName;
              }
            }
          } catch (e) {
            logger.warn('Fallback bank list scan failed', { error: e.message });
          }
        }
      }

      // 2) If bankName missing or 'unknown', try inferring from message tokens
      if (!resolvedBankCode && originalMessage) {
        try {
          const lower = originalMessage.toLowerCase();
          const tokens = lower.split(/[^a-z0-9]+/).filter(t => t && t.length >= 3);
          for (const token of tokens) {
            const code = await bellbankService.resolveInstitutionCode(token);
            if (code) {
              resolvedBankCode = code;
              resolvedBankName = token;
              break;
            }
          }
        } catch (err) {
          logger.warn('Bank inference from original message failed', { error: err.message });
        }
      }
      
      if (!resolvedBankCode) {
        return {
          intent: 'bank_transfer',
          message: `I couldn't identify the bank "${bankName}". Please specify a valid bank name like GTBank, Access, UBA, Zenith, Keystone, Opay, etc.`,
          awaitingInput: 'bank_transfer_details',
          context: 'bank_transfer'
        };
      }

      // Validate account and get recipient name via BellBank name enquiry
      const bankTransferService = require('./bankTransfer');
      const validation = await bankTransferService.validateBankAccount(accountNumber, resolvedBankCode);
      
      if (!validation.valid) {
        return {
          intent: 'bank_transfer',
          message: `❌ Invalid account details. Please check the account number and bank name.`,
          awaitingInput: 'bank_transfer_details',
          context: 'bank_transfer'
        };
      }

      // Calculate fees
      const feeInfo = bankTransferService.calculateTransferFee(transferAmount, bankTransferService.transferTypes.WALLET_TO_BANK);
      
      // Store transaction details and request confirmation
      await user.updateConversationState({
        intent: 'bank_transfer',
        awaitingInput: 'confirm_transfer',
        context: 'bank_transfer_confirmation',
        step: 1,
        data: {
          accountNumber,
          bankCode: resolvedBankCode,
          bankName: resolvedBankName,
          amount: transferAmount,
          totalFee: feeInfo.totalFee,
          totalAmount: feeInfo.totalAmount,
          narration: 'Wallet transfer',
          reference: this.generateReference(),
          recipientName: validation.accountName
        }
      });

      // Generate AI confirmation message
      const confirmationMessage = await this.generateTransferConfirmationMessage({
        amount: transferAmount,
        fee: feeInfo.totalFee,
        totalAmount: feeInfo.totalAmount,
        recipientName: validation.accountName,
        bankName: resolvedBankName,
        accountNumber
      });

      return {
        intent: 'bank_transfer',
        message: confirmationMessage,
        awaitingInput: 'confirm_transfer',
        context: 'bank_transfer_confirmation',
        transactionDetails: {
          amount: transferAmount,
          fee: feeInfo.totalFee,
          totalAmount: feeInfo.totalAmount,
          recipientName: validation.accountName,
          bankName: resolvedBankName,
          accountNumber
        }
      };

    } catch (error) {
      logger.error('Bank transfer handling failed', { 
        error: error.message, 
        stack: error.stack,
        userId: user.id,
        extractedData 
      });
      
      // Surface provider or validation error to user for clarity
      const safeMessage = error.message && typeof error.message === 'string'
        ? error.message
        : 'I encountered an unexpected error. Please try again.';
      
      return {
        intent: 'bank_transfer',
        message: `❌ ${safeMessage}`,
        awaitingInput: 'bank_transfer_details',
        context: 'bank_transfer'
      };
    }
  }

  // Add comprehensive static bank code mapping method
  getStaticBankCodeMapping() {
    return {
      // Traditional Banks
      'keystone': '000082', 'keystone bank': '000082',
      'gtb': '000058', 'gtbank': '000058', 'guaranty trust': '000058',
      'access': '000014', 'access bank': '000014',
      'uba': '000033', 'united bank for africa': '000033',
      'fidelity': '000070', 'fidelity bank': '000070',
      'wema': '000035', 'wema bank': '000035',
      'union': '000032', 'union bank': '000032',
      'fcmb': '000214', 'first city monument bank': '000214',
      'first': '000016', 'first bank': '000016', 'firstbank': '000016',
      'fbn': '000016', 'first bank of nigeria': '000016',
      'zenith': '000057', 'zenith bank': '000057',
      'stanbic': '000221', 'stanbic ibtc': '000221', 'ibtc': '000221',
      'sterling': '000232', 'sterling bank': '000232',
      'ecobank': '000050', 'eco bank': '000050',
      'heritage': '000030', 'heritage bank': '000030',
      'unity': '000215', 'unity bank': '000215',
      'citibank': '000023', 'citi bank': '000023',
      'standard': '000068', 'standard chartered': '000068', 'standard chartered bank': '000068',
      'enterprise': '000084', 'enterprise bank': '000084',
      
      // Digital Banks and Fintech
      'opay': '000090', 'palmpay': '000091', 'kuda': '000092', 'carbon': '000093',
      'alat': '000094', 'v bank': '000095', 'vbank': '000095', 'rubies': '000096',
      'fintech': '000097', 'mintyn': '000098', 'fairmoney': '000099', 'branch': '000100',
      'eyowo': '000101', 'flutterwave': '000102', 'paystack': '000103', 'moniepoint': '000104',
      '9psb': '000105', 'providus': '000106', 'polaris': '000107', 'titan': '000108',
      'titan trust': '000108', 'tcf': '000109', 'covenant': '000110', 'nova': '000111',
      'optimus': '000112', 'bowen': '000113', 'sparkle': '000114', 'mutual': '000115',
      'npf': '000116', 'signature': '000117', 'globus': '000118', 'jaiz': '000119',
      'taj': '000120', 'vfd': '000121', 'parallex': '000122', 'premiumtrust': '000123',
      'coronation': '000124', 'rand merchant': '000125', 'fbnquest': '000126', 'suntrust': '000127',
      'diamond': '000129',
      
      // Test Bank
      'test': '000010', 'testbank': '000010', 'test bank': '000010'
    };
  }

  async handleAirtimePurchase(user, extractedData, aiResponse) {
    const { amount, phoneNumber, network } = extractedData;
    
    if (!amount) {
      return {
        intent: 'airtime',
        message: "How much airtime would you like to buy?\n\n📝 Example: 'Buy 1000 airtime for 08123456789'",
        awaitingInput: 'airtime_amount',
        context: 'airtime_purchase'
      };
    }

    const targetPhone = phoneNumber || user.whatsappNumber;
    const airtimeAmount = this.parseAmount(amount);
    const detectedNetwork = network || this.detectNetwork(targetPhone);
    
    // Store airtime purchase data and request PIN verification
    await user.updateConversationState({
      intent: 'airtime',
      awaitingInput: 'airtime_pin_verification',
      context: 'airtime_purchase',
      data: {
        amount: airtimeAmount,
        phoneNumber: targetPhone,
        network: detectedNetwork
      }
    });

    // Send PIN verification flow
    return await this.sendPinVerificationFlow(user, {
      service: 'airtime',
      amount: airtimeAmount,
      phoneNumber: targetPhone,
      network: detectedNetwork
    });
  }

  async handleDataPurchase(user, extractedData, aiResponse) {
    const { amount, dataSize, phoneNumber, network } = extractedData;
    
    if (!dataSize && !amount) {
      return {
        intent: 'data',
        message: "What data bundle would you like to buy?\n\n📝 Examples:\n• 'Buy 1GB data'\n• 'Buy 2000 worth of data'\n• 'Buy 1GB data for 08123456789'",
        awaitingInput: 'data_details',
        context: 'data_purchase'
      };
    }

    const targetPhone = phoneNumber || user.whatsappNumber;
    
    // Use bilal service for data purchase
    const bilalService = require('./bilal');
    
    // Get data plans for the network
    const dataPlans = await bilalService.getDataPlans(network || this.detectNetwork(targetPhone));
    
    // Find the appropriate data plan
    let selectedPlan = null;
    if (dataSize) {
      selectedPlan = dataPlans.find(plan => 
        plan.dataplan.toLowerCase().includes(dataSize.toLowerCase())
      );
    } else if (amount) {
      const amountValue = this.parseAmount(amount);
      selectedPlan = dataPlans.find(plan => 
        parseFloat(plan.amount) === amountValue
      );
    }
    
    if (!selectedPlan) {
      return {
        intent: 'data',
        message: `I couldn't find a matching data plan. Available plans for ${network || 'your network'}:\n\n${dataPlans.slice(0, 5).map(plan => `• ${plan.dataplan} - ₦${plan.amount}`).join('\n')}\n\nPlease specify a valid plan.`,
        awaitingInput: 'data_plan_selection',
        context: 'data_purchase'
      };
    }
    
    const detectedNetwork = network || this.detectNetwork(targetPhone);
    
    // Use the complete data purchase flow
    const whatsappService = require('./whatsapp');
    await whatsappService.sendDataPurchaseFlow(user.whatsappNumber, {
      id: user.id,
      phoneNumber: targetPhone,
      network: detectedNetwork,
      dataPlan: selectedPlan
    });

    // Mark conversation as awaiting the flow completion
    await user.updateConversationState({
      intent: 'data',
      awaitingInput: 'data_purchase_flow',
      context: 'data_purchase',
      data: {
        phoneNumber: targetPhone,
        network: detectedNetwork,
        dataPlan: selectedPlan
      }
    });

    return {
      intent: 'data',
      message: 'Data purchase flow sent. Please complete the purchase in the flow.',
      awaitingInput: 'data_purchase_flow',
      context: 'data_purchase'
    };
  }

  async handleBillPayment(user, extractedData, aiResponse) {
    const { amount, utilityProvider, meterNumber, billType, disco, provider } = extractedData;
    
    if (!amount) {
      return {
        intent: 'bills',
        message: "How much would you like to pay for your bill?\n\n📝 Examples:\n• 'Pay 5000 electricity Ikeja 12345678901'\n• 'Pay 3000 DSTV 123456789'",
        awaitingInput: 'bill_amount',
        context: 'bill_payment'
      };
    }

    const billAmount = this.parseAmount(amount);
    
    // Determine bill type and provider
    let actualBillType = billType;
    let actualProvider = utilityProvider || disco || provider;
    
    if (!actualProvider) {
      return {
        intent: 'bills',
        message: "I need to know which service provider you want to pay.\n\n📝 Examples:\n• 'Pay 5000 electricity Ikeja 12345678901'\n• 'Pay 3000 DSTV 123456789'",
        awaitingInput: 'bill_provider',
        context: 'bill_payment'
      };
    }

    // Store bill payment data and request PIN verification
    await user.updateConversationState({
      intent: 'bills',
      awaitingInput: 'bills_pin_verification',
      context: 'bill_payment',
      data: {
        amount: billAmount,
        provider: actualProvider,
        meterNumber: meterNumber,
        billType: actualBillType
      }
    });

    // Send PIN verification flow
    return await this.sendPinVerificationFlow(user, {
      service: 'bills',
      amount: billAmount,
      provider: actualProvider,
      meterNumber: meterNumber,
      billType: actualBillType
    });
  }

  async handleBalanceInquiry(user) {
    return {
      intent: 'CHECK_BALANCE',
      message: '',
      requiresAction: 'SHOW_BALANCE'
    };
  }

  async sendPinVerificationFlow(user, transactionData) {
    try {
      const whatsappFlowService = require('./whatsappFlowService');
      const whatsappService = require('./whatsapp');
      const redisClient = require('../utils/redis');
      const appConfig = require('../config');

      const flowToken = whatsappFlowService.generateFlowToken(user.id);
      
      // Store transaction data in Redis for the Flow endpoint to read
      const flowSession = {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        ...transactionData
      };
      await redisClient.setSession(flowToken, flowSession, 900);

      // Create service-specific messages
      let serviceMessage = '';
      let serviceTitle = '';
      
      switch (transactionData.service) {
        case 'airtime':
          serviceMessage = `Enter your 4-digit PIN to authorize airtime purchase.\n\nAmount: ₦${transactionData.amount}\nPhone: ${transactionData.phoneNumber}\nNetwork: ${transactionData.network}`;
          serviceTitle = '🔐 Authorize Airtime Purchase';
          break;
        case 'data':
          serviceMessage = `Enter your 4-digit PIN to authorize data purchase.\n\nPlan: ${transactionData.dataPlan?.dataplan || 'Data Plan'}\nPhone: ${transactionData.phoneNumber}\nNetwork: ${transactionData.network}`;
          serviceTitle = '🔐 Authorize Data Purchase';
          break;
        case 'bills':
          serviceMessage = `Enter your 4-digit PIN to authorize bill payment.\n\nAmount: ₦${transactionData.amount}\nProvider: ${transactionData.provider}\nAccount: ${transactionData.meterNumber}`;
          serviceTitle = '🔐 Authorize Bill Payment';
          break;
        default:
          serviceMessage = `Enter your 4-digit PIN to authorize this transaction.`;
          serviceTitle = '🔐 Authorize Transaction';
      }

      const flowData = {
        flowId: appConfig.getWhatsappConfig().transferPinFlowId,
        flowToken,
        flowCta: 'Authorize with PIN',
        header: { type: 'text', text: serviceTitle },
        body: serviceMessage,
        flowAction: 'navigate',
        flowActionPayload: {
          screen: 'PIN_VERIFICATION_SCREEN',
          data: transactionData
        }
      };

      logger.info('Sending PIN verification flow', {
        userId: user.id,
        phoneNumber: user.whatsappNumber,
        service: transactionData.service,
        flowId: flowData.flowId,
        flowToken: flowToken
      });

      try {
        await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);
        
        logger.info('PIN verification flow sent successfully', {
          userId: user.id,
          phoneNumber: user.whatsappNumber,
          service: transactionData.service
        });
      } catch (error) {
        logger.error('Failed to send PIN verification flow', {
          error: error.message,
          userId: user.id,
          phoneNumber: user.whatsappNumber,
          service: transactionData.service,
          flowId: flowData.flowId
        });
        throw error;
      }

      // Mark conversation as awaiting the flow completion
      await user.updateConversationState({
        intent: transactionData.service,
        awaitingInput: `${transactionData.service}_pin_flow`,
        context: `${transactionData.service}_purchase`,
        data: { ...transactionData, flowToken }
      });

      return {
        intent: transactionData.service,
        message: 'PIN verification flow sent. Please complete the authorization.',
        awaitingInput: `${transactionData.service}_pin_flow`,
        context: `${transactionData.service}_purchase`
      };
    } catch (error) {
      logger.error('Failed to send PIN verification flow', {
        error: error.message,
        userId: user.id,
        service: transactionData.service
      });
      
      // Fallback to asking PIN in chat if Flow fails
      await user.updateConversationState({
        intent: transactionData.service,
        awaitingInput: `${transactionData.service}_pin`,
        context: `${transactionData.service}_purchase`,
        data: transactionData
      });
      
      return {
        intent: transactionData.service,
        message: 'Enter your 4-digit PIN to authorize this transaction.',
        awaitingInput: `${transactionData.service}_pin`,
        context: `${transactionData.service}_purchase`
      };
    }
  }

  async handleTransactionHistory(user, extractedData) {
    try {
      const transactionService = require('./transaction');
      const limit = extractedData?.limit || 5;
      
      await transactionService.sendTransactionHistory(user, user.whatsappNumber, limit);
      
      logger.info('Transaction history sent', {
        userId: user.id,
        limit
      });
    } catch (error) {
      logger.error('Failed to send transaction history', {
        error: error.message,
        userId: user.id
      });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve transaction history right now. Please try again later.");
    }
  }

  async handleWalletDetails(user) {
    try {
      const walletService = require('./wallet');
      const whatsappService = require('./whatsapp');
      
      const walletDetails = await walletService.getWalletDetails(user.id);
      
      const message = `🏦 *Wallet Details*\n\n` +
        `👤 *Account Name:* ${walletDetails.user.accountName}\n` +
        `🔢 *Account Number:* ${walletDetails.user.accountNumber}\n` +
        `📱 *Phone:* ${walletDetails.user.whatsappNumber}\n\n` +
        `💰 *Current Balance:* ₦${walletDetails.wallet.balance.toLocaleString()}\n` +
        `💳 *Currency:* ${walletDetails.wallet.currency}\n` +
        `📊 *Status:* ${walletDetails.wallet.status}\n\n` +
        `📈 *Transaction Limits*\n` +
        `• Daily Limit: ₦${walletDetails.limits.daily.toLocaleString()}\n` +
        `• Monthly Limit: ₦${walletDetails.limits.monthly.toLocaleString()}\n` +
        `• Single Transaction: ₦${walletDetails.limits.single.toLocaleString()}\n\n` +
        `📊 *Usage This Period*\n` +
        `• Daily Used: ₦${walletDetails.limits.dailyUsed.toLocaleString()}\n` +
        `• Monthly Used: ₦${walletDetails.limits.monthlyUsed.toLocaleString()}\n\n` +
        `💡 Type "transactions" to see your transaction history`;

      await whatsappService.sendTextMessage(user.whatsappNumber, message);
      
      logger.info('Wallet details sent', {
        userId: user.id
      });
    } catch (error) {
      logger.error('Failed to send wallet details', {
        error: error.message,
        userId: user.id
      });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve wallet details right now. Please try again later.");
    }
  }

  async handleTransferLimits(user) {
    try {
      const walletService = require('./wallet');
      const whatsappService = require('./whatsapp');
      
      const limits = await walletService.getTransactionLimits(user.id);
      
      const message = `📈 *Transfer Limits*\n\n` +
        `💰 *Daily Limit:* ₦${limits.daily.toLocaleString()}\n` +
        `📅 *Monthly Limit:* ₦${limits.monthly.toLocaleString()}\n` +
        `💸 *Single Transaction:* ₦${limits.single.toLocaleString()}\n\n` +
        `📊 *Current Usage*\n` +
        `• Daily Used: ₦${limits.dailyUsed.toLocaleString()}\n` +
        `• Monthly Used: ₦${limits.monthlyUsed.toLocaleString()}\n\n` +
        `✅ *Remaining*\n` +
        `• Daily Remaining: ₦${limits.dailyRemaining.toLocaleString()}\n` +
        `• Monthly Remaining: ₦${limits.monthlyRemaining.toLocaleString()}\n\n` +
        `💡 These limits help keep your account secure!`;

      await whatsappService.sendTextMessage(user.whatsappNumber, message);
      
      logger.info('Transfer limits sent', {
        userId: user.id
      });
    } catch (error) {
      logger.error('Failed to send transfer limits', {
        error: error.message,
        userId: user.id
      });
      
      const whatsappService = require('./whatsapp');
      await whatsappService.sendTextMessage(user.whatsappNumber, 
        "❌ Unable to retrieve transfer limits right now. Please try again later.");
    }
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
      case 'list_reply': {
        try {
          const whatsappService = require('./whatsapp');
          const { DATA_PLANS } = require('../routes/flowEndpoint');
          const redisClient = require('../utils/redis');

          // Expect a stored list reply from interactive message
          const listReply = conversationState?.data?.listReply || {};
          const sessionId = conversationState?.data?.sessionId || null;
          const selectionId = (listReply.id || '').trim();
          const selectionTitle = (listReply.title || '').trim();

          // Detect network selection
          if (selectionId.startsWith('network_')) {
            const rawNetwork = selectionId.split('_')[1] || selectionTitle;
            const network = (rawNetwork || '').toUpperCase();

            // Persist next step
            const nextState = {
              intent: 'data',
              awaitingInput: 'data_plan',
              context: 'data_purchase',
              step: 2,
              data: { network, sessionId }
            };
            await user.updateConversationState(nextState);
            if (sessionId) {
              const session = await redisClient.getSession(sessionId);
              if (session) {
                session.state = 'select_plan';
                session.data.network = network;
                await redisClient.setSession(sessionId, session, 900);
              }
            }

            // Allowed plans (provider IDs) per network as requested
            const ALLOWED_PLAN_IDS = {
              MTN: [1, 2, 3, 4, 5, 6],
              AIRTEL: [7, 8, 9, 10],
              GLO: [11, 12, 13, 14, 15],
              '9MOBILE': [25, 27, 28, 46, 47, 48, 49, 50, 51, 52]
            };

            const plans = (DATA_PLANS[network] || []).filter(p => ALLOWED_PLAN_IDS[network]?.includes(p.id));

            if (!plans.length) {
              await whatsappService.sendTextMessage(user.whatsappNumber, 'No plans available for the selected network. Please try another network.');
              return;
            }

            const sections = [
              {
                title: `${network} Plans`,
                rows: plans.slice(0, 20).map(p => ({
                  id: `plan_${network}_${p.id}`,
                  title: `${p.title} - ₦${p.price}`,
                  description: p.validity || ''
                }))
              }
            ];

            await whatsappService.sendListMessage(
              user.whatsappNumber,
              `Select a data plan for ${network}:`,
              'Select Plan',
              sections
            );
            return;
          }

          // Detect plan selection
          if (selectionId.startsWith('plan_')) {
            const parts = selectionId.split('_');
            const network = (parts[1] || '').toUpperCase();
            const planId = parseInt(parts[2], 10);

            // Persist next step
            const nextState2 = {
              intent: 'data',
              awaitingInput: 'data_phone',
              context: 'data_purchase',
              step: 3,
              data: { network, planId, sessionId }
            };
            await user.updateConversationState(nextState2);
            if (sessionId) {
              const session = await redisClient.getSession(sessionId);
              if (session) {
                session.state = 'enter_phone';
                session.data.network = network;
                session.data.planId = planId;
                await redisClient.setSession(sessionId, session, 900);
              }
            }

            await whatsappService.sendTextMessage(
              user.whatsappNumber,
              'Please enter the recipient phone number (11 digits). Reply "self" to use your WhatsApp number.'
            );
            return;
          }

          // If unrelated list reply, ignore
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please use the options provided to continue.');
          return;
        } catch (error) {
          const whatsappService = require('./whatsapp');
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Something went wrong handling your selection. Please try again.');
          return;
        }
      }

      case 'data_network': {
        const whatsappService = require('./whatsapp');
        const redisClient = require('../utils/redis');
        const raw = (message || '').trim();
        // Global CANCEL handling in data flow
        if (/^(cancel|stop|quit|exit|abort|end)$/i.test(raw)) {
          const sessionId = conversationState?.data?.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
          await user.clearConversationState();
          await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Data purchase cancelled.');
          return;
        }
        const input = raw.toUpperCase();
        const map = { 'MTN': 'MTN', 'AIRTEL': 'AIRTEL', 'GLO': 'GLO', '9MOBILE': '9MOBILE', '9M': '9MOBILE', '9-MOBILE': '9MOBILE' };
        const network = map[input] || null;
        if (!network) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please reply with one of: MTN, AIRTEL, GLO, 9MOBILE');
          return;
        }

        // Reuse list-based plan selection for consistency
        const { DATA_PLANS } = require('../routes/flowEndpoint');
        const ALLOWED_PLAN_IDS = {
          MTN: [1, 2, 3, 4, 5, 6],
          AIRTEL: [7, 8, 9, 10],
          GLO: [11, 12, 13, 14, 15],
          '9MOBILE': [25, 27, 28, 46, 47, 48, 49, 50, 51, 52]
        };
        const plans = (DATA_PLANS[network] || []).filter(p => ALLOWED_PLAN_IDS[network]?.includes(p.id));

        const sessionId = conversationState?.data?.sessionId || null;
        const nextState = { intent: 'data', awaitingInput: 'data_plan', context: 'data_purchase', step: 2, data: { network, sessionId } };
        await user.updateConversationState(nextState);
        if (sessionId) {
          const session = await redisClient.getSession(sessionId);
          if (session) {
            session.state = 'select_plan';
            session.data.network = network;
            await redisClient.setSession(sessionId, session, 900);
          }
        }

        const sections = [
          { title: `${network} Plans`, rows: plans.slice(0, 20).map(p => ({ id: `plan_${network}_${p.id}`, title: `${p.title} - ₦${p.price}`, description: p.validity || '' })) }
        ];
        await whatsappService.sendListMessage(user.whatsappNumber, `Select a data plan for ${network}:`, 'Select Plan', sections);
        return;
      }

      case 'data_plan': {
        const whatsappService = require('./whatsapp');
        const { DATA_PLANS } = require('../routes/flowEndpoint');
        const redisClient = require('../utils/redis');
        const state = conversationState?.data || {};
        // Global CANCEL handling in data flow
        if (/^(cancel|stop|quit|exit|abort|end)$/i.test((message || '').trim())) {
          const sessionId = state.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
          await user.clearConversationState();
          await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Data purchase cancelled.');
          return;
        }
        const network = (state.network || '').toUpperCase();
        if (!network) {
          await user.updateConversationState({ intent: 'data', awaitingInput: 'data_network', context: 'data_purchase', step: 1, data: {} });
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please choose a network: MTN, AIRTEL, GLO, 9MOBILE');
          return;
        }

        // Try to parse plan selection from free text (fallback)
        const input = (message || '').trim();
        const plans = DATA_PLANS[network] || [];
        let planId = null;
        if (/^\d+$/.test(input)) {
          const numeric = parseInt(input, 10);
          if (plans.some(p => p.id === numeric)) planId = numeric;
        } else {
          const match = plans.find(p => p.title.toLowerCase().includes(input.toLowerCase()));
          if (match) planId = match.id;
        }

        if (!planId) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please select a valid plan from the list.');
          return;
        }

        const sessionId = conversationState?.data?.sessionId || null;
        const nextState = { intent: 'data', awaitingInput: 'data_phone', context: 'data_purchase', step: 3, data: { network, planId, sessionId } };
        await user.updateConversationState(nextState);
        if (sessionId) {
          const session = await redisClient.getSession(sessionId);
          if (session) {
            session.state = 'enter_phone';
            session.data.network = network;
            session.data.planId = planId;
            await redisClient.setSession(sessionId, session, 900);
          }
        }
        await whatsappService.sendTextMessage(user.whatsappNumber, 'Enter the recipient phone number (11 digits). Reply "self" to use your WhatsApp number.');
        return;
      }

      case 'data_phone': {
        const whatsappService = require('./whatsapp');
        const { DATA_PLANS } = require('../routes/flowEndpoint');
        const redisClient = require('../utils/redis');
        const state = conversationState?.data || {};
        // Global CANCEL handling in data flow
        if (/^(cancel|stop|quit|exit|abort|end)$/i.test((message || '').trim())) {
          const sessionId = state.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
          await user.clearConversationState();
          await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Data purchase cancelled.');
          return;
        }
        const network = (state.network || '').toUpperCase();
        const planId = state.planId;
        if (!network || !planId) {
          await user.updateConversationState({ intent: 'data', awaitingInput: 'data_network', context: 'data_purchase', step: 1, data: {} });
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Let’s start over. Which network? MTN, AIRTEL, GLO, 9MOBILE');
          return;
        }

        let phone = (message || '').trim();
        if (phone.toLowerCase() === 'self') {
          phone = user.whatsappNumber;
        }
        // Normalize to 11-digit local format starting with 0
        phone = phone.replace(/\D/g, '');
        if (phone.startsWith('234') && phone.length === 13) phone = `0${phone.slice(3)}`;
        if (phone.length === 10) phone = `0${phone}`;
        if (!/^0[789][01]\d{8}$/.test(phone)) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please enter a valid 11-digit Nigerian phone number (e.g., 08012345678).');
          return;
        }

        const plan = (DATA_PLANS[network] || []).find(p => p.id === planId);
        const price = plan?.price || 0;
        const title = plan?.title || '';

        const sessionId = conversationState?.data?.sessionId || null;
        const nextState = { intent: 'data', awaitingInput: 'data_confirm', context: 'data_purchase', step: 4, data: { network, planId, phone, sessionId } };
        await user.updateConversationState(nextState);
        if (sessionId) {
          const session = await redisClient.getSession(sessionId);
          if (session) {
            session.state = 'confirm';
            session.data.phone = phone;
            await redisClient.setSession(sessionId, session, 900);
          }
        }

        await whatsappService.sendTextMessage(
          user.whatsappNumber,
          `Confirm purchase:\n\nNetwork: ${network}\nPlan: ${title}\nAmount: ₦${price}\nPhone: ${phone}\n\nReply YES to confirm or NO to cancel.`
        );
        return;
      }

      case 'data_confirm': {
        const whatsappService = require('./whatsapp');
        const whatsappFlowService = require('./whatsappFlowService');
        const redisClient = require('../utils/redis');
        const appConfig = require('../config');
        const decisionRaw = (message || '').trim();
        if (/^(cancel|stop|quit|exit|abort|end)$/i.test(decisionRaw)) {
          const sessionId = conversationState?.data?.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
          await user.clearConversationState();
          await whatsappService.sendTextMessage(user.whatsappNumber, '✅ Data purchase cancelled.');
          return;
        }
        const decision = decisionRaw.toLowerCase();
        if (!['yes', 'y', 'no', 'n'].includes(decision)) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please reply YES to proceed or NO to cancel.');
          return;
        }
        if (decision.startsWith('n')) {
          const sessionId = conversationState?.data?.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
          await user.clearConversationState();
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Cancelled ✅');
          return;
        }
        // Send PIN verification Flow (navigate to PIN_VERIFICATION_SCREEN)
        const sessionId = conversationState?.data?.sessionId || null;
        const { network, planId, phone } = conversationState.data || {};
        try {
          const flowToken = whatsappFlowService.generateFlowToken(user.id);
          // Store data in Redis under flow token for the Flow endpoint to read
          const flowSession = {
            userId: user.id,
            phoneNumber: user.whatsappNumber,
            network,
            phoneNumberInput: phone,
            dataPlan: planId,
            confirm: 'yes'
          };
          await redisClient.setSession(flowToken, flowSession, 900);

          const flowData = {
            flowId: appConfig.getWhatsappConfig().dataPurchaseFlowId,
            flowToken,
            flowCta: 'Authorize with PIN',
            header: { type: 'text', text: '🔐 Authorize Purchase' },
            body: `Enter your 4-digit PIN to authorize data purchase.\n\nNetwork: ${network}\nPlan ID: ${planId}\nPhone: ${phone}`,
            flowAction: 'navigate',
            flowActionPayload: {
              screen: 'PIN_VERIFICATION_SCREEN',
              data: {
                network,
                phoneNumber: phone,
                dataPlan: planId,
                confirm: 'yes'
              }
            }
          };

          await whatsappService.sendFlowMessage(user.whatsappNumber, flowData);

          // Mark conversation as awaiting the flow completion
          await user.updateConversationState({
            intent: 'data',
            awaitingInput: 'data_pin_flow',
            context: 'data_purchase',
            step: 5,
            data: { ...conversationState.data, flowToken }
          });

          return;
        } catch (err) {
          // Fallback to asking PIN in chat if Flow fails
          await user.updateConversationState({ intent: 'data', awaitingInput: 'data_pin', context: 'data_purchase', step: 5, data: conversationState.data });
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Enter your 4-digit PIN to authorize this purchase.');
          return;
        }
      }

      case 'data_pin_verification': {
        // Handle PIN verification for data purchase after confirmation
        const whatsappService = require('./whatsapp');
        const bilalService = require('./bilal');
        
        if (!/^\d{4}$/.test(message)) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Please enter your 4-digit PIN (numbers only).');
          return;
        }

        // Verify PIN
        const isValidPin = await user.validatePin(message);
        if (!isValidPin) {
          await user.update({ pinAttempts: user.pinAttempts + 1 });
          
          if (user.pinAttempts >= 3) {
            await user.update({ isBlocked: true, pinAttempts: 0 });
            await user.clearConversationState();
            await whatsappService.sendTextMessage(user.whatsappNumber, '❌ Account temporarily blocked due to multiple incorrect PIN attempts. Please contact support.');
            return;
          }

          await whatsappService.sendTextMessage(user.whatsappNumber, `❌ Incorrect PIN. You have ${3 - user.pinAttempts} attempts remaining.`);
          return;
        }

        // PIN is correct, execute data purchase
        await user.update({ pinAttempts: 0 });
        
        const { phoneNumber, network, dataPlan, amount } = conversationState.data;
        
        try {
          const result = await bilalService.purchaseData(user, {
            phoneNumber,
            network,
            dataPlan,
            pin: message
          }, user.whatsappNumber);

          if (result.success) {
            await user.clearConversationState();
            await whatsappService.sendTextMessage(user.whatsappNumber, `✅ Data purchase successful! ${dataPlan.dataplan} for ${phoneNumber} on ${network} network.`);
          } else {
            await whatsappService.sendTextMessage(user.whatsappNumber, `❌ Data purchase failed: ${result.message || 'Please try again.'}`);
          }
        } catch (error) {
          logger.error('Data purchase failed', { error: error.message, userId: user.id });
          await whatsappService.sendTextMessage(user.whatsappNumber, '❌ Data purchase failed. Please try again.');
        }
        
        return;
      }

      case 'data_pin': {
        const whatsappService = require('./whatsapp');
        const { DATA_PLANS } = require('../routes/flowEndpoint');
        const bilalService = require('./bilal');
        const redisClient = require('../utils/redis');
        const pin = (message || '').trim();
        if (!/^\d{4}$/.test(pin)) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'PIN must be exactly 4 digits.');
          return;
        }

        // Validate PIN against user
        const isValid = await user.validatePin(pin);
        if (!isValid) {
          await whatsappService.sendTextMessage(user.whatsappNumber, '❌ Incorrect PIN. Please try again.');
          return;
        }

        const { network, planId, phone } = conversationState.data || {};
        const plan = (DATA_PLANS[(network || '').toUpperCase()] || []).find(p => p.id === planId);
        if (!plan) {
          await whatsappService.sendTextMessage(user.whatsappNumber, 'Unable to find the selected plan. Please start again.');
          await user.clearConversationState();
          return;
        }

        try {
          await bilalService.purchaseData(
            user,
            { phoneNumber: phone, network: (network || '').toUpperCase(), dataPlan: { id: plan.id, price: plan.price }, pin },
            user.whatsappNumber
          );
          await user.clearConversationState();
          const sessionId = conversationState?.data?.sessionId || null;
          if (sessionId) await redisClient.deleteSession(sessionId);
        } catch (err) {
          await whatsappService.sendTextMessage(user.whatsappNumber, `❌ Data purchase failed: ${err.message}`);
        }
        return;
      }
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
  extractAmount(message) {
    if (!message) return null;
    
    // Look for amount patterns like "100", "1000", "1k", "1.5k", etc.
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*k\b/i,  // 1k, 1.5k, etc.
      /₦\s*(\d+(?:\.\d+)?)/,    // ₦100, ₦1,000, etc.
      /(\d+(?:,\d{3})*)/,       // 1,000, 10,000, etc.
      /(\d+)\s*(?:naira|naira|ngn)/i,  // 100 naira, 1000 naira, etc.
      /(\d+)/                   // plain numbers
    ];
    
    for (const pattern of amountPatterns) {
      const match = message.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0) return amount;
      }
    }
    
    return null;
  }

  extractPhoneNumber(message) {
    if (!message) return null;
    
    // Look for phone number patterns
    const phonePatterns = [
      /(\d{11})/,           // 11-digit numbers
      /(\d{10})/,           // 10-digit numbers (without country code)
      /(\+234\d{10})/,      // +234 followed by 10 digits
      /(0\d{9})/            // 0 followed by 9 digits
    ];
    
    for (const pattern of phonePatterns) {
      const match = message.match(pattern);
      if (match) {
        let phoneNumber = match[1];
        
        // Normalize to 11 digits
        if (phoneNumber.startsWith('+234')) {
          phoneNumber = '0' + phoneNumber.substring(4);
        } else if (phoneNumber.length === 10) {
          phoneNumber = '0' + phoneNumber;
        }
        
        // Validate Nigerian phone number format
        if (phoneNumber.length === 11 && phoneNumber.startsWith('0')) {
          return phoneNumber;
        }
      }
    }
    
    return null;
  }

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
      'transfer', 'bank_transfer', 'airtime', 
      'data', 'bills'
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
        intent: 'greeting', 
        extractedData: {}, 
        confidence: 0.9,
        message: `Hey ${user.fullName || 'there'}! 👋\n\nWhat's up? I can help you with:\n\n💰 Check balance\n💸 Send money\n📱 Buy airtime/data\n💳 Pay bills\n\nWhat do you need?`
      };
    }
    
    // Default fallback
      return { 
        success: true, 
      intent: 'unknown', 
        extractedData: {}, 
      confidence: 0.5,
      message: `Hmm, not sure what you mean. Try:\n\n💰 "Check my balance"\n💸 "Send 5k to John"\n📱 "Buy 1GB data"\n💳 "Pay electricity"\n\nOr just say "help" for options!`
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

  async generateWelcomeMessage(user, accountDetails) {
    try {
      const prompt = `Generate a warm, welcoming message for a newly onboarded user on MiiMii. 

User Details:
- Name: ${user.firstName} ${user.lastName}
- Phone: ${user.whatsappNumber}

Bank Account Details:
- Account Number: ${accountDetails?.accountNumber || 'N/A'}
- Account Name: ${accountDetails?.accountName || `${user.firstName} ${user.lastName}`}
- Bank: ${accountDetails?.bankName || 'BellBank'}

Requirements:
1. Be warm, friendly, and welcoming
2. Include emojis to make it engaging
3. Mention their successful onboarding
4. Include their bank account details clearly
5. Welcome them to MiiMii's financial services
6. Keep it conversational and not too formal
7. Mention they can now receive money and make transfers
8. Include a call to action to explore features

Format the response as a friendly WhatsApp message with proper formatting.`;

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a friendly AI assistant for MiiMii, a financial services platform. Generate warm, welcoming messages with emojis and clear formatting.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const welcomeMessage = response.data.choices[0]?.message?.content?.trim();
      
      if (!welcomeMessage) {
        // Fallback message if AI fails
        return `🎉 *Welcome to MiiMii!* 🎉

Congratulations ${user.firstName}! You have been successfully onboarded on MiiMii.

🏦 *Your Bank Details:*
• Account Number: \`${accountDetails?.accountNumber || 'N/A'}\`
• Account Name: ${accountDetails?.accountName || `${user.firstName} ${user.lastName}`}
• Bank: ${accountDetails?.bankName || 'BellBank'}

💰 You can now:
• Receive money from anyone
• Make transfers to other banks
• Check your balance anytime
• View transaction history

Type "help" to see all available features or "balance" to check your current balance.

Welcome to the future of banking! 🚀`;
      }

      return welcomeMessage;
    } catch (error) {
      logger.error('Failed to generate AI welcome message', { error: error.message, userId: user.id });
      
      // Fallback message
      return `🎉 *Welcome to MiiMii!* 🎉

Congratulations ${user.firstName}! You have been successfully onboarded on MiiMii.

🏦 *Your Bank Details:*
• Account Number: \`${accountDetails?.accountNumber || 'N/A'}\`
• Account Name: ${accountDetails?.accountName || `${user.firstName} ${user.lastName}`}
• Bank: ${accountDetails?.bankName || 'BellBank'}

💰 You can now:
• Receive money from anyone
• Make transfers to other banks
• Check your balance anytime
• View transaction history

Type "help" to see all available features or "balance" to check your current balance.

Welcome to the future of banking! 🚀`;
    }
  }

  /**
   * Analyze user message to determine intent
   */
  async analyzeUserIntent(message, user) {
    try {
      // HARD OVERRIDE: Force ALL transfers to be bank_transfer (NO P2P)
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('send') || lowerMessage.includes('transfer') || lowerMessage.includes('give')) {
        // Check if it's a transfer message
        const amountMatch = message.match(/\b(\d+(?:k|000)?)\b/i);
        const accountMatch = message.match(/\b(\d{8,11})\b/);
        
        if (amountMatch && accountMatch) {
          logger.info('Hard override: Transfer detected, forcing bank_transfer intent', {
            originalMessage: message,
            userId: user.id
          });
          
          // Extract basic data for bank transfer
          const amount = amountMatch[1].toLowerCase().includes('k') ? 
            parseInt(amountMatch[1].toLowerCase().replace('k', '')) * 1000 : 
            parseInt(amountMatch[1]);

          // Try to resolve bank from tokens (supports 3-letter prefixes like "mon" for Moniepoint)
          let detectedBankName = null;
          let detectedBankCode = null;
          try {
            const bellbankService = require('./bellbank');
            const tokens = lowerMessage.split(/[^a-z0-9]+/).filter(t => t && t.length >= 3 && /^[a-z]+$/.test(t));
            for (const token of tokens) {
              const code = await bellbankService.resolveInstitutionCode(token);
              if (code) {
                detectedBankName = token; // keep original token; proper name will be set after validation
                detectedBankCode = code;  // 6-digit institution code
                break;
              }
            }
          } catch (e) {
            logger.warn('Bank detection during hard override failed', { error: e.message });
          }

          return {
            intent: 'bank_transfer',
            confidence: 0.99,
            extractedData: {
              amount: amount,
              accountNumber: accountMatch[1],
              bankName: detectedBankName || (lowerMessage.includes('opay') ? 'opay' : 'unknown'),
              bankCode: detectedBankCode || undefined,
              recipientName: null
            },
            response: `Perfect! I can see you want to send money. Let me verify the account details and get the recipient name for you. 🔍`,
            suggestedAction: 'Process bank transfer',
            reasoning: 'Hard override: Transfer detected - all transfers are bank transfers'
          };
        }
      }
      
      if (!this.isConfigured) {
        // Fallback to basic keyword matching
        return this.basicIntentAnalysis(message);
      }

      const prompt = `Analyze this WhatsApp message and determine the user's intent.

Message: "${message}"

User Context:
- Onboarding Status: ${user.onboardingStep || 'unknown'}
- Account Status: ${user.onboardingStep === 'completed' ? 'completed' : 'incomplete'}

IMPORTANT: Use these exact intent names:
1. "bank_transfer" - User wants to transfer money to a bank account (ALL transfers)
3. "balance" - User wants to check account balance (NOT balance_inquiry)
4. "airtime" - User wants to buy airtime
5. "data" - User wants to buy data
6. "bills" - User wants to pay bills
7. "help" - User needs help or support
8. "menu" - User wants to see available services
9. "account_details" - User wants account information
10. "wallet_details" - User wants to see wallet information, account details, balance, and transaction limits
11. "transaction_history" - User wants to see transaction history, past transactions, or financial records
12. "account_info" - User wants to see account information, account number, account name, or account details
13. "transfer_limits" - User wants to know transfer limits, daily limits, monthly limits, or transaction limits
14. "greeting" - General greeting or hello
15. "unknown" - Cannot determine intent

NATURAL LANGUAGE UNDERSTANDING:
- "what's my current balance" → balance
- "how much do I have" → balance
- "check my balance" → balance
- "show my balance" → balance
- "my balance" → balance
- "what's my balance" → balance
- "send 5k to Abdulkadir Musa 6035745691 keystone bank" → bank_transfer
- "transfer 2000 to GTB 0123456789" → bank_transfer
- "send 4k to 9072874728 Opay Bank" → bank_transfer
- "send money to John" → bank_transfer
- "send 100 to 9072874728 Musa Abdulkadir opay" → bank_transfer
- "buy airtime" → airtime
- "recharge my phone" → airtime
- "buy data" → data
- "internet bundle" → data
- "pay electricity" → bills
- "pay cable" → bills
- "show transactions" → transaction_history
- "my history" → transaction_history
- "account details" → account_details
- "my account" → account_details

For bank transfers, look for:
- Amount (e.g., "5k", "5000", "10k", "2k", "4k")
- Account number (8-11 digits, can be phone number format for digital banks)
- Bank name (e.g., "keystone", "gtb", "access", "opay", "test bank")
- Recipient name (optional)

For ALL transfers (bank transfers only), look for:
- Amount
- Account number (any format - 8-11 digits)
- Bank name (if mentioned)
- Recipient name (if mentioned)

EXTRACTION RULES:
1. Amount: Convert "5k" to 5000, "10k" to 10000, "2k" to 2000, "4k" to 4000, etc.
2. Account Number: Find 8-11 digit numbers (traditional banks use 10 digits, digital banks may use phone number format)
3. Bank Name: Look for bank names in the message (keystone, gtb, access, uba, opay, test bank, etc.)
4. Recipient Name: Look for names before account numbers or bank names
5. Test Bank: "test bank" is a valid bank name for testing purposes
6. Phone Number: Look for 11-digit numbers starting with 0 or 10-digit numbers

NEW SIMPLIFIED BANK TRANSFER FORMAT:
Users can now send messages like:
- "send 4k to 9072874728 Opay Bank"
- "send 4000 to 9072874728 Opay"
- "transfer 5k to 1001011000 test bank"

The system will automatically:
1. Extract amount, account number, and bank name
2. Get the bank code from the BellBank API bank list
3. Use name enquiry to get the recipient name
4. Show confirmation with recipient name

CONVERSATIONAL RESPONSES:
- Be friendly and conversational, like talking to a friend
- Confirm the transfer details in a natural way
- Use emojis appropriately (💰, 🔐, ✅, etc.)
- Ask for PIN in a friendly, secure way
- Make the user feel confident about the transaction
- Keep responses concise but warm
- When transfer details are incomplete, guide the user naturally
- Provide clear examples of what information is needed

Example: "Send 5k to Abdulkadir Musa 6035745691 keystone bank"
Should extract:
- amount: 5000
- accountNumber: "6035745691"
- bankName: "keystone"
- recipientName: "Abdulkadir Musa"

And respond with something like:
"Perfect! I can see you want to send ₦5,000 to Abdulkadir Musa at Keystone Bank. That's amazing! Let me help you out - just give me your PIN to authorize your transfer. 🔐"

Example: "Send 100 naira to 6035745691 keystone bank"
Should extract:
- amount: 100
- accountNumber: "6035745691"
- bankName: "keystone"
- recipientName: null (will be fetched via name enquiry)

And respond with something like:
"Great! I can see you want to send ₦100 to Keystone Bank. Let me verify the account details and get the recipient name for you. 🔍"

Example: "Send 4k to 9072874728 Opay Bank"
Should extract:
- amount: 4000
- accountNumber: "9072874728"
- bankName: "opay"
- recipientName: null (will be fetched via name enquiry)

And respond with something like:
"Great! I can see you want to send ₦4,000 to Opay Bank. Let me verify the account details and get the recipient name for you. 🔍"

Example: "Send 5k to 1001011000 test bank"
Should extract:
- amount: 5000
- accountNumber: "1001011000"
- bankName: "test bank"
- recipientName: null

And respond with something like:
"Great! I can see you want to send ₦5,000 to the test account. Perfect for testing! Just provide your PIN to authorize this transfer. 🔐"

Instructions:
- Analyze the message content and context
- Consider user's onboarding status
- Return the most likely intent using the exact names above
- Provide confidence level (0-1)
- For transfer intents: Generate a conversational response that confirms details and asks for PIN
- For non-transfer intents: Generate a friendly response that acknowledges the request
- Extract relevant data if present

Response format:
{
  "intent": "bank_transfer",
  "confidence": 0.95,
  "extractedData": {
    "amount": 100,
    "accountNumber": "6035745691",
    "bankName": "keystone",
    "recipientName": null
  },
  "response": "Great! I can see you want to send ₦100 to Keystone Bank. Let me verify the account details and get the recipient name for you. 🔍",
  "suggestedAction": "Process bank transfer",
  "reasoning": "Message contains bank transfer keywords and account details"
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
            content: 'You are an AI assistant that analyzes WhatsApp messages to determine user intent for a financial services bot. Be accurate and concise. Use the exact intent names specified.'
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
          
          // Debug: Log the raw AI response
          logger.info('Raw AI response for intent analysis', {
            rawResponse: analysisText,
            parsedAnalysis: analysis,
            hasExtractedData: !!analysis.extractedData,
            extractedDataKeys: analysis.extractedData ? Object.keys(analysis.extractedData) : []
          });
          
          // Fix intent mapping
          if (analysis.intent === 'balance_inquiry') {
            analysis.intent = 'balance';
          }
          
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
        this.isConfigured = false; // Disable AI for future requests
      } else if (status === 429) {
        logger.warn('⚠️ Rate limit exceeded during intent analysis');
        // Don't disable AI for rate limits, just use fallback
      }
      
      // Return fallback analysis and disable AI temporarily for rate limits
      if (status === 429) {
        this.isConfigured = false;
        setTimeout(() => {
          this.isConfigured = true;
          logger.info('Re-enabling AI analysis after rate limit cooldown');
        }, 60000); // 1 minute cooldown
      }
      
      return this.basicIntentAnalysis(message);
    }
  }

  /**
   * Basic keyword-based intent analysis as fallback
   */
  basicIntentAnalysis(message) {
    const lowerMessage = (message || '').toLowerCase();

    // Handle common responses in flows
    if (['yes', 'no', 'cancel', 'ok', 'okay', 'confirm', 'proceed'].includes(lowerMessage)) {
      return { 
        intent: 'unknown', 
        confidence: 0.5, 
        suggestedAction: 'Ask for clarification',
        response: "I'm not sure what you'd like to do. Could you please tell me what you need help with? You can say things like:\n\n• Check balance\n• Send money\n• Buy airtime\n• Buy data\n• Pay bills\n• View transactions"
      };
    }

    // Highest priority: explicit account details requests
    if (/(virtual\s+account|account\s+(details|detail|info|information|number|no)|bank\s+details)/i.test(message)) {
      return { intent: 'account_details', confidence: 0.95, suggestedAction: 'Show virtual account details' };
    }

    // Balance keywords - improved to catch more natural language
    if (/(balance|how\s+much\s+(do\s+)?i\s+have|what'?s?\s+my\s+(current\s+)?balance|check\s+my\s+balance|show\s+my\s+balance|my\s+balance)/i.test(message)) {
      return { intent: 'balance', confidence: 0.9, suggestedAction: 'Check account balance' };
    }

    // Transaction history keywords
    if (/(transaction\s+history|history|transactions?|statement|records?|my\s+history)/i.test(message)) {
      return { intent: 'transaction_history', confidence: 0.9, suggestedAction: 'Show transaction history' };
    }

    // Wallet details keywords
    if (/(wallet\s+details?|wallet\s+info|wallet\s+information)/i.test(message)) {
      return { intent: 'wallet_details', confidence: 0.9, suggestedAction: 'Show wallet details' };
    }

    // Transfer limits keywords
    if (/(transfer\s+limits?|daily\s+limits?|monthly\s+limits?|transaction\s+limits?|limits?)/i.test(message)) {
      return { intent: 'transfer_limits', confidence: 0.9, suggestedAction: 'Show transfer limits' };
    }

    // Onboarding keywords (do NOT match generic 'account')
    if (/(start|setup|set\s*up|onboard|register|create\s+account|open\s+account)/i.test(message)) {
      return { intent: 'onboarding', confidence: 0.85, suggestedAction: 'Start onboarding flow' };
    }

    // Transfer keywords - improved to catch bank transfers
    if (/(send\s+\d+[k]?\s+(?:naira\s+)?to\s+.*\d{8,11}|transfer\s+\d+[k]?\s+(?:naira\s+)?to\s+.*\d{8,11}|send\s+\d+[k]?\s+(?:naira\s+)?to\s+.*\s+(bank|gtb|access|keystone|opay|test\s+bank)|transfer\s+\d+[k]?\s+(?:naira\s+)?to\s+.*\s+(bank|gtb|access|keystone|opay|test\s+bank))/i.test(message)) {
      // Try to extract data from the message
      const amountMatch = message.match(/(\d+[k]?)/i);
      const accountMatch = message.match(/(\d{8,11})/);
      const bankMatch = message.match(/(bank|gtb|access|keystone|opay|test\s+bank)/i);
      
      const extractedData = {
        amount: amountMatch ? amountMatch[1] : null,
        accountNumber: accountMatch ? accountMatch[1] : null,
        bankName: bankMatch ? bankMatch[1].toLowerCase() : null
      };
      
      return { 
        intent: 'bank_transfer', 
        confidence: 0.9, 
        extractedData,
        suggestedAction: 'Initiate bank transfer' 
      };
    }

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

  // Generate AI-powered transfer confirmation message
  async generateTransferConfirmationMessage(transferData) {
    try {
      const { amount, recipientName, bankName, accountNumber } = transferData;
      
      // Ensure all values are properly defined
      const safeAmount = amount || 0;
      const safeRecipientName = recipientName || 'Recipient';
      const safeBankName = bankName || 'Bank';
      const safeAccountNumber = accountNumber || 'Account';
      
      const prompt = `Generate a short, friendly bank transfer confirmation message (max 2 lines).

Transfer details:
- Amount: ₦${safeAmount.toLocaleString()}
- Recipient: ${safeRecipientName}
- Bank: ${safeBankName}
- Account: (${safeAccountNumber})

Requirements:
- Sound like a real person, not AI
- Keep it casual and friendly
- Use proper English (not Nigerian pidgin)
- Ask for YES/NO confirmation
- Don't mention fees
- Keep it under 2 lines
- Make recipient name and bank name BOLD using *text*
- Include account number in brackets (1234567890)

Examples:
❌ "I am ready to process your transfer request. Please confirm with YES or NO."
✅ "Ready to send ₦5k to *John* at *GTB* (0123456789)? Reply YES or NO"

❌ "Please confirm the transfer details above."
✅ "Looks good! Send ₦2k to *Sarah* at *Access* (9876543210)? YES/NO"

❌ "Make I send money give you" (pidgin)
✅ "Ready to send the money to you"`;

      const response = await axios.post(`${this.openaiBaseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a friendly Nigerian financial assistant. Generate natural, human-like messages. No robotic language!'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const aiMessage = response.data.choices[0]?.message?.content?.trim();
      
      if (aiMessage) {
        return aiMessage;
      }
      
      // Fallback message if AI fails
      return `Ready to send ₦${safeAmount.toLocaleString()} to *${safeRecipientName}* at *${safeBankName}* (${safeAccountNumber})? Reply YES or NO`;
      
    } catch (error) {
      logger.error('Failed to generate AI confirmation message', { error: error.message, transferData });
      
      // Fallback message with safe values
      const { amount, recipientName, bankName } = transferData;
      const safeAmount = amount || 0;
      const safeRecipientName = recipientName || 'Recipient';
      const safeBankName = bankName || 'Bank';
      
      return `Ready to send ₦${safeAmount.toLocaleString()} to *${safeRecipientName}* at *${safeBankName}* (${safeAccountNumber})? Reply YES or NO`;
    }
  }

  // Generate reference for transactions
  generateReference() {
    return `TXN${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
}

module.exports = new AIAssistantService();
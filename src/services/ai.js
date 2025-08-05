const OpenAI = require('openai');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.AI_API_KEY
    });
    this.model = process.env.AI_MODEL || 'gpt-4-turbo';
  }

  async analyzeIntent(text, user, extractedData = null) {
    try {
      const context = this.buildContext(user, extractedData);
      const prompt = this.buildIntentPrompt(text, context);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      logger.info('AI intent analysis completed', {
        originalText: text,
        detectedIntent: result.action,
        confidence: result.confidence,
        userId: user.id
      });

      return result;
    } catch (error) {
      logger.error('AI intent analysis failed', { error: error.message, text });
      
      // Fallback to rule-based intent detection
      return this.fallbackIntentDetection(text);
    }
  }

  getSystemPrompt() {
    return `You are MiiMii, an AI assistant for a WhatsApp-based fintech platform in Nigeria. 

Your role is to analyze user messages and extract intent with parameters for financial operations.

AVAILABLE ACTIONS:
- welcome: First-time user greeting
- balance_inquiry: Check wallet balance
- transfer_money: Send money to another user
- buy_airtime: Purchase mobile airtime
- buy_data: Purchase mobile data
- pay_utility: Pay bills (electricity, cable TV, internet)
- transaction_history: View past transactions
- start_kyc: Begin KYC verification process
- set_pin: Set transaction PIN
- menu: Show main menu
- help: Get help or list commands
- complaint: User complaint or issue

NIGERIAN CONTEXT:
- Currency: Naira (₦) - amounts can be written as "5000", "5k", "five thousand"
- Phone numbers: Usually 11 digits starting with 0 (080, 081, 090, 070, etc.)
- Networks: MTN, Glo, Airtel, 9mobile
- Utilities: PHCN/EKEDC (electricity), DStv/GOtv/Startimes (cable), Spectranet/Swift (internet)
- Data bundles: MB, GB (e.g., "500MB", "2GB", "5GB")

RESPONSE FORMAT (JSON only):
{
  "action": "detected_action",
  "confidence": 0.95,
  "parameters": {
    "amount": "extracted_amount",
    "phoneNumber": "extracted_phone",
    "recipient": "recipient_name",
    "dataSize": "data_amount",
    "utilityType": "utility_provider",
    "meterNumber": "meter_account_number",
    "pin": "4_digit_pin"
  },
  "reasoning": "Brief explanation"
}

EXAMPLES:
"Send 5000 to John 08012345678" → {"action": "transfer_money", "confidence": 0.95, "parameters": {"amount": "5000", "phoneNumber": "08012345678", "recipient": "John"}}
"Buy 1000 airtime" → {"action": "buy_airtime", "confidence": 0.90, "parameters": {"amount": "1000"}}
"What's my balance" → {"action": "balance_inquiry", "confidence": 0.95, "parameters": {}}
"Buy 2GB data for 08098765432" → {"action": "buy_data", "confidence": 0.90, "parameters": {"dataSize": "2GB", "phoneNumber": "08098765432"}}`;
  }

  buildContext(user, extractedData) {
    const context = {
      userVerified: user.isKycComplete(),
      hasPin: !!user.pin,
      accountActive: user.isActive && !user.isBanned
    };

    if (extractedData?.ocrData) {
      context.hasImageData = true;
      context.extractedText = extractedData.ocrData.text;
    }

    return context;
  }

  buildIntentPrompt(text, context) {
    let prompt = `Analyze this message and extract the user's intent:\n\n`;
    prompt += `Message: "${text}"\n\n`;
    
    if (context.hasImageData) {
      prompt += `Additional context: User sent an image with text: "${context.extractedText}"\n\n`;
    }

    prompt += `User context:\n`;
    prompt += `- KYC verified: ${context.userVerified}\n`;
    prompt += `- Has PIN: ${context.hasPin}\n`;
    prompt += `- Account active: ${context.accountActive}\n\n`;

    prompt += `Respond with JSON only. Be precise with number and phone number extraction.`;

    return prompt;
  }

  fallbackIntentDetection(text) {
    const lowercaseText = text.toLowerCase();
    
    // Balance inquiry patterns
    if (/\b(balance|bal|check balance|my balance|wallet|account balance)\b/.test(lowercaseText)) {
      return {
        action: 'balance_inquiry',
        confidence: 0.8,
        parameters: {},
        reasoning: 'Rule-based fallback'
      };
    }

    // Transfer patterns
    if (/\b(send|transfer|give)\b.*\d+.*\b(to|for)\b/.test(lowercaseText)) {
      const amountMatch = text.match(/\b(\d+(?:,\d{3})*(?:\.\d{2})?)\b/);
      const phoneMatch = text.match(/\b(0[789][01]\d{8})\b/);
      
      return {
        action: 'transfer_money',
        confidence: 0.7,
        parameters: {
          amount: amountMatch ? amountMatch[1].replace(',', '') : null,
          phoneNumber: phoneMatch ? phoneMatch[1] : null
        },
        reasoning: 'Rule-based fallback'
      };
    }

    // Airtime patterns
    if (/\b(airtime|credit|recharge)\b/.test(lowercaseText)) {
      const amountMatch = text.match(/\b(\d+(?:,\d{3})*(?:\.\d{2})?)\b/);
      
      return {
        action: 'buy_airtime',
        confidence: 0.7,
        parameters: {
          amount: amountMatch ? amountMatch[1].replace(',', '') : null
        },
        reasoning: 'Rule-based fallback'
      };
    }

    // Data patterns
    if (/\b(data|internet)\b/.test(lowercaseText)) {
      const dataSizeMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(gb|mb)\b/i);
      
      return {
        action: 'buy_data',
        confidence: 0.7,
        parameters: {
          dataSize: dataSizeMatch ? dataSizeMatch[0] : null
        },
        reasoning: 'Rule-based fallback'
      };
    }

    // KYC patterns
    if (/\b(kyc|verification|verify|identity|id)\b/.test(lowercaseText)) {
      return {
        action: 'start_kyc',
        confidence: 0.7,
        parameters: {},
        reasoning: 'Rule-based fallback'
      };
    }

    // Help patterns
    if (/\b(help|commands|what can|how to|menu)\b/.test(lowercaseText)) {
      return {
        action: 'help',
        confidence: 0.8,
        parameters: {},
        reasoning: 'Rule-based fallback'
      };
    }

    // Transaction history patterns
    if (/\b(history|transactions|statement|previous)\b/.test(lowercaseText)) {
      return {
        action: 'transaction_history',
        confidence: 0.7,
        parameters: {},
        reasoning: 'Rule-based fallback'
      };
    }

    // Greeting patterns
    if (/\b(hi|hello|hey|start|begin)\b/.test(lowercaseText)) {
      return {
        action: 'welcome',
        confidence: 0.6,
        parameters: {},
        reasoning: 'Rule-based fallback'
      };
    }

    // Default unknown intent
    return {
      action: 'unknown',
      confidence: 0.2,
      parameters: {},
      reasoning: 'No pattern matched'
    };
  }

  async enhanceErrorMessage(originalError, context) {
    try {
      const prompt = `A user encountered this error: "${originalError}"
      
Context: ${JSON.stringify(context)}

Please rewrite this error message to be:
1. User-friendly and non-technical
2. Helpful with next steps
3. Empathetic
4. Under 160 characters

Respond with just the improved message, no quotes.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a customer service expert helping to improve error messages for a Nigerian fintech app.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Failed to enhance error message', { error: error.message });
      return originalError;
    }
  }

  async generateTransactionSummary(transactions) {
    try {
      const prompt = `Generate a brief summary of these transactions for a user:
      
${JSON.stringify(transactions, null, 2)}

Format:
- Use Nigerian context (₦ symbol)
- Group by type if multiple
- Include total amounts
- Keep it conversational and under 300 characters
- Use emojis appropriately`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are MiiMii, helping users understand their transaction history in a friendly way.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 150
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Failed to generate transaction summary', { error: error.message });
      return 'Here are your recent transactions:';
    }
  }
}

module.exports = new AIService();
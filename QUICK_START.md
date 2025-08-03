# WhatsApp Business API - Quick Start Guide

Get your MiiMii WhatsApp integration up and running in 5 minutes!

## 🚀 Quick Setup

### Step 1: Configure Environment
```bash
# Copy the environment template
cp .env.example .env
```

### Step 2: Add Your Gupshup Credentials
Edit `.env` and add your Gupshup credentials:
```bash
# Gupshup WhatsApp Configuration
GUPSHUP_API_KEY=your-gupshup-api-key
GUPSHUP_APP_NAME=your-app-name
GUPSHUP_SOURCE_NUMBER=your-whatsapp-business-number
GUPSHUP_NAMESPACE=your-namespace
GUPSHUP_WEBHOOK_VERIFY_TOKEN=your-webhook-token

# Optional: Add test phone number
TEST_PHONE_NUMBER=+1234567890
```

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Test the Integration
```bash
# Test with your phone number
node test-whatsapp.js +1234567890

# Or use environment variable
node test-whatsapp.js
```

## 📱 What You'll Receive

After running the test, you'll receive these WhatsApp messages:

1. **Opt-in Confirmation** - Welcome message
2. **Interactive Welcome** - Buttons for registration, info, support
3. **Services Menu** - List of financial services
4. **Button Test** - Interactive button selection
5. **List Test** - Banking and investment options
6. **Verification Code** - 6-digit security code
7. **Transaction Alert** - Credit notification
8. **Payment Reminder** - Bill payment reminder
9. **Onboarding Flow** *(if configured)* - Interactive form

## 🔧 Start Development Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## 📋 API Endpoints

### Send Messages
```bash
# Welcome message
curl -X POST http://localhost:3000/api/whatsapp/send/welcome \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "userName": "John"}'

# Button message
curl -X POST http://localhost:3000/api/whatsapp/send/buttons \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "text": "Choose an option:",
    "buttons": [
      {"id": "opt1", "title": "Option 1"},
      {"id": "opt2", "title": "Option 2"}
    ]
  }'

# Onboarding flow
curl -X POST http://localhost:3000/api/whatsapp/send/onboarding-flow \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "userType": "individual"}'
```

### Webhook Testing
Your webhook endpoint: `http://localhost:3000/api/whatsapp/webhook`

For production, use your public domain:
`https://your-domain.com/api/whatsapp/webhook`

## 🎯 Flow Messages Setup

### 1. Create Flows in Gupshup Console
1. Login to [Gupshup Console](https://gupshup.io/)
2. Go to "Bot Studio"
3. Create new flows using the JSON templates in `/flows/` directory:
   - `onboarding-flow.json` - User registration
   - `kyc-verification-flow.json` - Identity verification

### 2. Get Flow IDs
After creating flows, add their IDs to `.env`:
```bash
GUPSHUP_ONBOARDING_FLOW_ID=your-onboarding-flow-id
GUPSHUP_KYC_FLOW_ID=your-kyc-flow-id
GUPSHUP_TRANSACTION_FLOW_ID=your-transaction-flow-id
```

## 🔒 Webhook Security

Set up webhook verification in `.env`:
```bash
GUPSHUP_WEBHOOK_VERIFY_TOKEN=your-secure-token
```

Configure this token in your Gupshup dashboard webhook settings.

## 📊 Testing Interactive Features

### Button Responses
When users tap buttons, they'll trigger webhook events:
```json
{
  "type": "message",
  "payload": {
    "from": "+1234567890",
    "message": {
      "type": "interactive",
      "interactive": {
        "type": "button_reply",
        "button_reply": {
          "id": "register",
          "title": "📝 Register"
        }
      }
    }
  }
}
```

### Flow Responses
Flow completions send structured data:
```json
{
  "type": "flow-response",
  "payload": {
    "from": "+1234567890",
    "flow_token": "onboarding_1234567890",
    "response_data": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "user_type": "individual"
    }
  }
}
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Messages Not Sending
```bash
# Check API credentials
curl -X GET http://localhost:3000/api/whatsapp/status

# Verify phone number format
# ✅ Correct: +1234567890
# ❌ Wrong: 1234567890, +1 234 567 890
```

#### 2. Webhook Not Working
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "test", "payload": {}}'

# Should return: {"success": true}
```

#### 3. Flow Messages Not Appearing
- Verify `GUPSHUP_ONBOARDING_FLOW_ID` is set
- Check flow is published in Gupshup console
- Ensure flow JSON structure is valid

#### 4. Rate Limiting
```bash
# Check your phone number tier in Gupshup dashboard
# Tier 1: 1,000 messages/24h
# Tier 2: 10,000 messages/24h
# Tier 3: 100,000 messages/24h
# Tier 4: Unlimited
```

## 🌐 Production Deployment

### 1. Environment Setup
```bash
# Production environment variables
NODE_ENV=production
PORT=3000

# Your production domain
WEBHOOK_URL=https://your-domain.com/api/whatsapp/webhook
```

### 2. SSL Certificate
Ensure your webhook URL has a valid SSL certificate:
```bash
# Test SSL
curl -I https://your-domain.com/api/whatsapp/webhook
```

### 3. Update Gupshup Webhook
In Gupshup dashboard, update webhook URL to your production domain.

## 📈 Features Overview

### ✅ Implemented Features
- ✅ Text messaging
- ✅ Interactive buttons (up to 3)
- ✅ List messages (up to 10 options)
- ✅ Flow messages (multi-screen forms)
- ✅ Template messages
- ✅ Media sharing
- ✅ Webhook processing
- ✅ User opt-in/opt-out
- ✅ Message delivery status
- ✅ Error handling & logging

### 🎯 Flow Features
- ✅ Multi-screen navigation
- ✅ Form inputs (text, email, phone, date)
- ✅ Photo/document upload
- ✅ Dropdown selections
- ✅ Checkbox groups
- ✅ Radio buttons
- ✅ Data validation
- ✅ Conditional logic

### 🏦 Fintech-Specific Features
- ✅ User onboarding flows
- ✅ KYC verification flows
- ✅ Transaction confirmations
- ✅ Balance inquiries
- ✅ Payment reminders
- ✅ Security verification codes
- ✅ Account notifications

## 📚 Next Steps

1. **Complete Setup**: Follow `GUPSHUP_WHATSAPP_SETUP_GUIDE.md` for full setup
2. **Customize Flows**: Modify flow JSON files for your use case
3. **Database Integration**: Connect with your user database
4. **Production Deploy**: Set up production environment
5. **Monitor Analytics**: Track message delivery and user engagement

## 🆘 Support

- **Documentation**: See `GUPSHUP_WHATSAPP_SETUP_GUIDE.md`
- **API Reference**: Check `/api/whatsapp/status` endpoint
- **Gupshup Support**: [support.gupshup.io](https://support.gupshup.io/)
- **WhatsApp Business API**: [developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)

## 🎉 You're Ready!

Your WhatsApp Business API integration is now ready for testing and development. Start sending messages and exploring the interactive features!
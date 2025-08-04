# WhatsApp Business API Webhook Setup for MiiMii

This guide will help you configure the WhatsApp Business Cloud API webhook for your MiiMii fintech assistant platform.

## 🔗 Current Webhook Configuration

Your webhook is already properly implemented with:
- **Webhook URL**: `https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp`
- **Verify Token**: `Verify_MiiMii`
- **Direct Meta API Integration** (not third-party)

## 📋 Prerequisites

✅ **Already Configured:**
- WhatsApp Business Account ID: `1722871389103605`
- Phone Number ID: `755450640975332`
- Access Token: Configured in environment
- Webhook verification endpoint implemented
- Message processing with AI integration

## 🚀 Setup Steps

### 1. Meta Developer Console Configuration

1. **Go to Meta for Developers**: https://developers.facebook.com/
2. **Navigate to your WhatsApp Business App**
3. **Go to WhatsApp > Configuration**

### 2. Configure Webhook Settings

In the Meta Developer Console:

```
Webhook URL: https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp
Verify Token: Verify_MiiMii
```

**Subscribe to webhook fields:**
- ✅ `messages` - For incoming messages
- ✅ `message_deliveries` - For delivery status
- ✅ `message_reads` - For read receipts
- ✅ `message_echoes` - For sent message confirmations

### 3. Webhook Verification Process

Your webhook supports Meta's verification process:

```bash
# Meta will send a GET request like this:
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=RANDOM_CHALLENGE

# Your server responds with the challenge if token matches
HTTP 200: RANDOM_CHALLENGE
```

### 4. Test Webhook Connectivity

```bash
# Test webhook verification locally
curl -X GET "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"

# Test webhook verification on production
curl -X GET "https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"
```

## 📨 Message Flow

### Incoming Message Processing

1. **WhatsApp → Your Webhook**
   ```json
   POST /webhook/whatsapp
   {
     "entry": [{
       "changes": [{
         "value": {
           "messages": [{
             "id": "MESSAGE_ID",
             "from": "PHONE_NUMBER",
             "type": "text",
             "text": { "body": "send 5k to John 08012345678" }
           }]
         }
       }]
     }]
   }
   ```

2. **Message Processing Chain**:
   - ✅ Webhook receives message
   - ✅ Parse message content (text/voice/image)
   - ✅ Mark message as read
   - ✅ Extract text using OCR (for images)
   - ✅ Transcribe audio (for voice notes)
   - ✅ AI/NLP processes intent
   - ✅ Execute banking operations
   - ✅ Send response to user

## 🔐 Security Features

Your implementation includes:

- ✅ **Webhook logging** - All webhooks logged to database
- ✅ **Rate limiting** - 100 requests per 15 minutes
- ✅ **HTTPS only** - Secure communication
- ✅ **Token verification** - Meta webhook verification
- ✅ **Error handling** - Graceful error responses

## 🤖 AI-Powered Message Understanding

Your MiiMii assistant can understand:

### Natural Language Commands
```
✅ "send 5k to Musa 9091234567 Opay"
✅ "buy 1000 airtime for 08012345678"
✅ "check my balance"
✅ "pay PHCN bill for meter 12345"
✅ "buy 2GB data"
```

### Voice Notes
- Auto-transcription using Google Speech API
- Intent recognition from transcribed text

### Images
- OCR text extraction using Tesseract
- Bank detail recognition
- ID document processing for KYC

## 📱 Supported Message Types

Your webhook handles:

| Type | Description | AI Processing |
|------|-------------|---------------|
| `text` | Regular text messages | ✅ Direct processing |
| `audio` | Voice notes | ✅ Transcription → Text processing |
| `image` | Photos with bank details/IDs | ✅ OCR → Text processing |
| `document` | PDF/Document files | ✅ Text extraction |
| `interactive` | Button/List replies | ✅ Menu selections |

## 🔧 Environment Variables

Ensure these are set in your DigitalOcean environment:

```bash
# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=EAAXQZBHvBuxgBPHJu57ZBLQfZA6RrbiEzZCEIBTUm54HVyfIZBzeqE3u6NoF0rCpYZAp44yZCySPbGexkuZBxC8SNoE0732WSEdWftudrltAcdh9ZAoh5YOpl2XB0FSvnWRryOZCZC3vtXVWLWJQnuwjLoe10KC1YfvoUhDQpHLSI3i5aZA3rNEX6zv6T7fZC837ZCZAgOSWsxpotRWaw06KbU2XZBfHfCtbaVcyMTIPgw2zTtYP1HCZCGwkKdqbqhvKAuqqExwZDZD
WHATSAPP_PHONE_NUMBER_ID=755450640975332
WHATSAPP_BUSINESS_ACCOUNT_ID=1722871389103605
WHATSAPP_WEBHOOK_VERIFY_TOKEN=Verify_MiiMii
```

## ✅ Verification Checklist

Before going live:

- [ ] **Webhook URL verified** in Meta Developer Console
- [ ] **Server deployed** on DigitalOcean and accessible
- [ ] **Database connected** and migrations run
- [ ] **Environment variables** properly set
- [ ] **Test message sent** and received response
- [ ] **AI processing** working for common commands
- [ ] **KYC flow** tested
- [ ] **Transaction flows** tested

## 📊 Monitoring & Logs

Your system logs:
- All incoming webhooks in `webhook_logs` table
- Message processing in application logs
- Transaction activities
- AI processing results

Monitor via:
```bash
# Check webhook logs
SELECT * FROM webhook_logs WHERE provider = 'whatsapp' ORDER BY created_at DESC LIMIT 10;

# Check recent user messages
SELECT * FROM users ORDER BY last_seen DESC LIMIT 10;
```

## 🚨 Troubleshooting

### Common Issues:

1. **Webhook Verification Fails**
   - Check `WHATSAPP_WEBHOOK_VERIFY_TOKEN` matches Meta console
   - Ensure HTTPS is working on your domain

2. **Messages Not Received**
   - Check webhook subscription fields in Meta console
   - Verify webhook URL is accessible from internet

3. **AI Not Understanding Commands**
   - Check OpenAI API key is valid
   - Review message processing logs

4. **Database Connection Issues**
   - Verify `DATABASE_URL` is correct
   - Check SSL requirements for DigitalOcean managed database

## 🎯 Next Steps

Your MiiMii platform is ready for:
1. **Production deployment** ✅
2. **User onboarding** via WhatsApp
3. **KYC verification** through Dojah
4. **Financial transactions** via BellBank & Bilal
5. **AI-powered assistance** for all operations

## 📞 Support

For issues:
- Check logs in DigitalOcean App Platform
- Review webhook logs in admin dashboard
- Monitor transaction status in database

Your WhatsApp Business API integration is production-ready! 🚀
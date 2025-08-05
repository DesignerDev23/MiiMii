# 🚀 MiiMii WhatsApp Webhook Deployment Instructions

## Current Status
Your WhatsApp Business API integration is code-complete but needs proper deployment configuration.

## ⚠️ Issues Detected
1. **Server not responding** (504 Gateway Timeout)
2. **Webhook verification returning 403 Forbidden**
3. **Environment variable mismatch**

## 🔧 Fix Steps

### 1. Update Environment Variables on DigitalOcean

Go to your DigitalOcean App Platform dashboard and update these environment variables:

```bash
# Fix the Phone Number ID variable name
WHATSAPP_PHONE_NUMBER_ID=755450640975332

# Ensure the BASE_URL is correct
BASE_URL=miimii-app-p8gzu.ondigitalocean.app

# Add missing protocol
WEBHOOK_URL=https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp
```

### 2. Deploy Latest Code

```bash
# Commit and push your latest changes
git add .
git commit -m "Update WhatsApp webhook configuration"
git push origin main
```

### 3. Configure Meta Developer Console

1. **Go to**: https://developers.facebook.com/
2. **Navigate to**: Your WhatsApp Business App
3. **Go to**: WhatsApp > Configuration
4. **Set Webhook URL**: `https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp`
5. **Set Verify Token**: `Verify_MiiMii`
6. **Subscribe to fields**:
   - ✅ messages
   - ✅ message_deliveries  
   - ✅ message_reads
   - ✅ message_echoes

### 4. Test Webhook After Deployment

```bash
# Test webhook verification
curl -X GET "https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"

# Should return: test123
```

### 5. Monitor Deployment

Check DigitalOcean App Platform logs for:
- ✅ "Database connection established successfully"
- ✅ "Server listening on port 3000"
- ✅ "Redis connection established"

## 🎯 Meta Developer Console Setup

### Step-by-Step Configuration:

1. **Login to Meta for Developers**
   - URL: https://developers.facebook.com/
   - Use your Facebook Business account

2. **Select Your WhatsApp Business App**
   - App ID should match: `1722871389103605`

3. **Configure Webhook**
   ```
   Webhook URL: https://miimii-app-p8gzu.ondigitalocean.app/webhook/whatsapp
   Verify Token: Verify_MiiMii
   ```

4. **Subscribe to Webhook Fields**
   - Navigate to WhatsApp > Configuration
   - Click "Subscribe" next to webhook fields:
     - ✅ `messages` - Incoming messages
     - ✅ `message_deliveries` - Delivery receipts
     - ✅ `message_reads` - Read receipts  
     - ✅ `message_echoes` - Sent message confirmations

5. **Verify Webhook**
   - Click "Verify and Save"
   - Meta will send GET request to your webhook
   - Should return success ✅

## 🔐 Security Configuration

Your webhook already includes:
- ✅ Token verification
- ✅ HTTPS enforcement
- ✅ Rate limiting
- ✅ Request logging
- ✅ Error handling

## 📱 Test Message Flow

Once deployed and configured:

1. **Send test message** to your WhatsApp Business number
2. **Check logs** in DigitalOcean for message processing
3. **Verify response** from MiiMii assistant

### Example Test Messages:
```
"Hello MiiMii" → Welcome message
"Check balance" → Balance inquiry  
"Send 1000 to John 08012345678" → Transfer command
"Buy 500 airtime" → Airtime purchase
```

## 🚨 Troubleshooting

### Common Issues:

**1. 504 Gateway Timeout**
- Check DigitalOcean app is running
- Verify environment variables are set
- Check database connection

**2. 403 Forbidden**  
- Verify webhook token matches exactly
- Check HTTPS is working
- Ensure no extra spaces in token

**3. Messages Not Processing**
- Check webhook subscriptions in Meta console
- Verify AI/OpenAI API key is valid
- Check database connection

### Debug Commands:
```bash
# Check deployment status
doctl apps list

# Check app logs  
doctl apps logs YOUR_APP_ID

# Test health endpoint
curl https://miimii-app-p8gzu.ondigitalocean.app/health
```

## ✅ Production Checklist

Before going live:
- [ ] Server responding (200 on /health)
- [ ] Webhook verification working
- [ ] Meta Developer Console configured
- [ ] Environment variables set correctly
- [ ] Database connected
- [ ] AI/OpenAI integration working
- [ ] Test message sent and processed
- [ ] Logs showing successful processing

## 🎉 Success Criteria

When everything is working:
1. ✅ Webhook verification returns challenge
2. ✅ Test messages trigger AI responses
3. ✅ Commands execute (balance, transfer, etc.)
4. ✅ Logs show successful processing
5. ✅ Users can interact with MiiMii assistant

Your WhatsApp Business API integration is **architecturally complete** and just needs proper deployment! 🚀
# MiiMii WhatsApp Troubleshooting Guide

## 🚨 Current Status Analysis

Based on the debug tests performed, here's what we found:

### ✅ **What's Working:**
- ✅ Server is running and accessible at `https://api.chatmiimii.com`
- ✅ Health endpoint is responding (Status: DEGRADED but operational)
- ✅ Environment variables are configured correctly
- ✅ Webhook endpoint is accepting POST requests
- ✅ Application is running in production mode
- ✅ Node.js version is up to date (v22.18.0)

### ❌ **What Needs Attention:**
- ❌ Database is disconnected
- ❌ Redis is disconnected  
- ❌ WhatsApp webhook verification fails (403 error)
- ❌ Some environment variables may be missing

## 🔧 **Step-by-Step Troubleshooting**

### Step 1: Check DigitalOcean Runtime Logs

1. **Access DigitalOcean Dashboard:**
   - Go to [DigitalOcean Dashboard](https://cloud.digitalocean.com/apps)
   - Navigate to your `miimii-app` application
   - Click on **"Runtime Logs"** tab

2. **Look for these specific log entries:**
   ```
   Configuration loaded for Digital Ocean App Platform
   Starting MiiMii Fintech Platform...
   Server started successfully on 0.0.0.0:3000
   ```

3. **Check for error messages related to:**
   - Database connection errors
   - WhatsApp API token validation
   - Missing environment variables

### Step 2: Verify Critical Environment Variables

In your DigitalOcean App Platform settings, ensure these are set:

#### **Required WhatsApp Variables:**
```bash
BOT_ACCESS_TOKEN=your_whatsapp_access_token
BOT_PHONE_NUMBER_ID=your_phone_number_id
BOT_BUSINESS_ACCOUNT_ID=your_business_account_id
BOT_WEBHOOK_VERIFY_TOKEN=your_verify_token
```

#### **Database Variables:**
```bash
DB_CONNECTION_URL=your_database_url
# OR individual components:
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
```

#### **Other Critical Variables:**
```bash
APP_SECRET=your_jwt_secret
BASE_URL=https://api.chatmiimii.com
NODE_ENV=production
```

### Step 3: Fix WhatsApp Business API Configuration

1. **Meta Developer Console Setup:**
   - Go to [Meta for Developers](https://developers.facebook.com)
   - Navigate to your WhatsApp Business App
   - Go to **WhatsApp > Configuration**

2. **Set Webhook URL:**
   ```
   Webhook URL: https://api.chatmiimii.com/webhook/whatsapp
   Verify Token: [same as BOT_WEBHOOK_VERIFY_TOKEN]
   ```

3. **Subscribe to Webhook Events:**
   - ✅ messages
   - ✅ message_deliveries  
   - ✅ message_reads
   - ✅ message_reactions

### Step 4: Test WhatsApp Configuration

#### **Test 1: Webhook Verification**
```bash
# Run this from your local machine
curl -X GET "https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```
**Expected Result:** Should return `test123`

#### **Test 2: Send Test Message**
```bash
# Use the monitoring script
node monitor_logs.js test-message 2349XXXXXXXXX "Test message"
```

#### **Test 3: Manual Webhook Test**
```bash
curl -X POST https://api.chatmiimii.com/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "test_id",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "YOUR_PHONE_NUMBER_ID"
          },
          "messages": [{
            "from": "2349123456789",
            "id": "test_msg_123",
            "timestamp": "1609459200",
            "text": { "body": "Test message" },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

### Step 5: Monitor Real-time Activity

1. **Start the monitoring script:**
   ```bash
   node monitor_logs.js
   ```

2. **Send a WhatsApp message to your business number**

3. **Watch for these logs in DigitalOcean:**
   ```
   WhatsApp webhook processing...
   Message received from: [phone_number]
   Processing incoming message...
   ```

## 🔍 **Common Issues and Solutions**

### Issue 1: No Logs When Sending WhatsApp Messages

**Cause:** Webhook URL not properly configured in Meta Developer Console

**Solution:**
1. Double-check webhook URL: `https://api.chatmiimii.com/webhook/whatsapp`
2. Verify the verify token matches exactly
3. Ensure webhook is enabled and saved

### Issue 2: 403 Error on Webhook Verification

**Cause:** `BOT_WEBHOOK_VERIFY_TOKEN` doesn't match the token in Meta Developer Console

**Solution:**
1. Check the exact value in DigitalOcean environment variables
2. Update Meta Developer Console with the same token
3. Re-save the webhook configuration

### Issue 3: Database Connection Issues

**Cause:** Database environment variables are missing or incorrect

**Solution:**
1. Verify database credentials in DigitalOcean
2. Check if database service is running
3. Test database connection independently

### Issue 4: WhatsApp Access Token Issues

**Cause:** Token expired or has insufficient permissions

**Solution:**
1. Generate a new permanent token in Meta Developer Console
2. Ensure token has `whatsapp_business_messaging` permission
3. Update `BOT_ACCESS_TOKEN` in DigitalOcean

## 📊 **Monitoring Commands**

### Debug Your Deployment
```bash
node debug_deployment.js
```

### Real-time Monitoring
```bash
node monitor_logs.js
```

### Send Test Message
```bash
node monitor_logs.js test-message YOUR_PHONE_NUMBER "Test message"
```

### Check Health Status
```bash
curl https://api.chatmiimii.com/health
```

## 🆘 **Emergency Troubleshooting**

If nothing is working:

1. **Redeploy the application:**
   - Push a small change to trigger redeployment
   - Check if environment variables are properly loaded

2. **Check DigitalOcean App Platform status:**
   - Verify the app is in "Running" state
   - Check for any platform-wide issues

3. **Validate WhatsApp Business Account:**
   - Ensure account is verified and active
   - Check if phone number is properly connected

4. **Test with a fresh webhook:**
   - Temporarily use a webhook testing service like webhook.site
   - See if Meta is sending webhooks at all

## 📞 **Next Steps**

1. **Start monitoring:** Run `node monitor_logs.js`
2. **Send a test message** to your WhatsApp Business number
3. **Check DigitalOcean logs** for incoming webhook activity
4. **Verify environment variables** are correctly set
5. **Test webhook verification** manually

**If you're still not seeing logs after following this guide, the issue is likely in the WhatsApp Business API configuration rather than your application code.**
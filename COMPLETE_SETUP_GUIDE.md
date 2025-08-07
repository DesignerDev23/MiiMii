# Complete WhatsApp Flow Setup Guide for MiiMii

## 🎯 Overview
This guide will walk you through setting up WhatsApp Flows for MiiMii from start to finish, including RSA key generation, Flow creation, and testing.

## 📋 Prerequisites
- WhatsApp Business Manager access
- Digital Ocean App Platform access
- Terminal/Command Prompt access

---

## 🔐 Step 1: Generate RSA Keys

### 1.1 Run the Key Generation Script
```bash
node generate_flow_keys.js
```

This will create:
- `flow-keys/private_key.pem` - Your private key
- `flow-keys/public_key.pem` - Your public key
- `.env.flow` - Environment variables file

### 1.2 Check Generated Files
```bash
ls flow-keys/
cat .env.flow
```

You should see:
- `private_key.pem` and `public_key.pem` files
- `.env.flow` with your private key and passphrase

---

## 🌐 Step 2: Update Digital Ocean Environment Variables

### 2.1 Add Flow Configuration
Go to your Digital Ocean App Platform:
1. Navigate to your MiiMii app
2. Go to **Settings** > **Environment Variables**
3. Add these new variables:

```env
# Flow Endpoint Configuration
FLOW_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[Your private key from .env.flow]\n-----END PRIVATE KEY-----"
FLOW_PASSPHRASE="miimii-flow-secure-passphrase-2024"
FLOW_ENDPOINT_URL="https://api.chatmiimii.com/api/flow/endpoint"
```

### 2.2 Copy Private Key
1. Open `.env.flow` file
2. Copy the entire `FLOW_PRIVATE_KEY` value
3. Paste it into Digital Ocean's `FLOW_PRIVATE_KEY` variable

---

## 📱 Step 3: Create Flows in WhatsApp Business Manager

### 3.1 Access WhatsApp Business Manager
1. Go to [business.facebook.com](https://business.facebook.com)
2. Navigate to your WhatsApp Business Account
3. Go to **Message Templates** > **Flows**

### 3.2 Create Onboarding Flow
1. Click **Create Flow**
2. Name: `MiiMii Onboarding Flow`
3. Copy the entire content from `flow-json/onboarding-flow.json`
4. Paste into the Flow JSON editor
5. Click **Save**
6. **Note the Flow ID** (you'll need this)

### 3.3 Create Login Flow
1. Click **Create Flow** again
2. Name: `MiiMii Login Flow`
3. Copy the entire content from `flow-json/login-flow.json`
4. Paste into the Flow JSON editor
5. Click **Save**
6. **Note the Flow ID** (you'll need this)

---

## 🔑 Step 4: Upload Public Key Using WhatsApp Business API

### 4.1 Prepare Your Public Key
1. Open `flow-keys/public_key.pem`
2. Copy the entire content (including BEGIN and END lines)
3. Remove any line breaks and extra spaces

### 4.2 Upload Public Key via API
According to the [official WhatsApp documentation](https://developers.facebook.com/docs/whatsapp/on-premises/reference/settings/business-whatsapp-business-encryption), you need to make a POST request to sign your business public key:

```bash
curl -X POST "https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/settings/business/whatsapp_business_encryption" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "public_key=YOUR_PUBLIC_KEY_CONTENT"
```

**Replace:**
- `YOUR_PHONE_NUMBER_ID` with your actual phone number ID (755450640975332)
- `YOUR_ACCESS_TOKEN` with your WhatsApp access token
- `YOUR_PUBLIC_KEY_CONTENT` with your public key content

### 4.3 Expected Response
```json
{
  "meta": {
    "api_status": "stable",
    "version": "v18.0"
  }
}
```

### 4.4 Verify Public Key Upload
```bash
curl -X GET "https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/settings/business/whatsapp_business_encryption" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "business_public_key": "YOUR_PUBLIC_KEY",
  "business_public_key_signature_status": "VALID"
}
```

---

## ⚙️ Step 5: Update Environment Variables with Flow IDs

### 5.1 Add Flow IDs
Go back to Digital Ocean and add these variables:

```env
# WhatsApp Flow IDs (replace with your actual Flow IDs)
WHATSAPP_ONBOARDING_FLOW_ID="your_onboarding_flow_id_here"
WHATSAPP_LOGIN_FLOW_ID="your_login_flow_id_here"
```

### 5.2 Get Your Flow IDs
1. In WhatsApp Business Manager, go to your Flows
2. Click on each Flow to see its ID
3. Copy the Flow IDs and paste them in Digital Ocean

---

## 🧪 Step 6: Test Your Setup

### 6.1 Test Flow JSON Endpoint
```bash
curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"
```

**Expected Response:**
```json
{
  "success": true,
  "flowJson": { ... },
  "instructions": "Copy this JSON and paste it into WhatsApp Business Manager"
}
```

### 6.2 Test Flow Health Check
```bash
curl -X GET "https://api.chatmiimii.com/api/flow/health"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "3.0",
  "endpoint": "https://api.chatmiimii.com/api/flow/endpoint",
  "services": {
    "database": "connected",
    "encryption": true,
    "userService": "available",
    "onboardingService": "available"
  }
}
```

### 6.3 Test Flow Endpoint
```bash
curl -X POST "https://api.chatmiimii.com/api/flow/endpoint" \
  -H "Content-Type: application/json" \
  -d '{
    "encrypted_flow_data": "test",
    "encrypted_aes_key": "test",
    "initial_vector": "test"
  }'
```

---

## 🔗 Step 7: Configure Webhook URL

### 7.1 Set Webhook URL
In WhatsApp Business Manager:
1. Go to **Webhooks**
2. Set the webhook URL to: `https://api.chatmiimii.com/api/webhook/whatsapp`
3. Verify the webhook is working

### 7.2 Test Webhook
Send a test message to your WhatsApp number to verify the webhook is receiving data.

---

## 📊 Step 8: Monitor and Debug

### 8.1 Check Application Logs
Monitor your Digital Ocean app logs for:
- Flow endpoint requests
- Data processing results
- Error messages
- User completion events

### 8.2 Debug Endpoints
```bash
# Test Flow JSON
curl "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"

# Test Flow Creation
curl -X POST "https://api.chatmiimii.com/api/whatsapp/test-flow-creation" \
  -H "Content-Type: application/json" \
  -d '{"type": "onboarding"}'

# Health Check
curl "https://api.chatmiimii.com/api/flow/health"
```

---

## 🚀 Step 9: Test Complete Flow

### 9.1 Test with Real WhatsApp Number
1. Send a message to your WhatsApp number
2. The system should send the onboarding Flow
3. Complete the Flow steps
4. Verify data is saved to database

### 9.2 Verify Data Persistence
Check your database to ensure:
- User data is saved
- BVN verification works
- Virtual account is created
- PIN is properly hashed

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Flow ID Invalid
**Problem:** `(#131009) Parameter value is not valid`
**Solution:**
- Ensure you're using the correct Flow ID from WhatsApp Business Manager
- Check that the Flow is published and active
- Verify the Flow ID is correctly set in environment variables

#### 2. Encryption Errors
**Problem:** `Decryption failed` or `Encryption failed`
**Solution:**
- Verify your private key is correctly formatted in environment variables
- Check that the passphrase matches exactly
- Ensure the public key is uploaded using the correct API method
- Verify the public key signature status is "VALID"

#### 3. Public Key Upload Issues
**Problem:** Public key upload fails
**Solution:**
- Ensure you're using the correct API endpoint: `/v1/settings/business/whatsapp_business_encryption`
- Use `x-www-form-urlencoded` content type
- Verify your access token has the required permissions
- Check that the phone number is successfully registered

#### 4. Data Not Persisting
**Problem:** User data not saved to database
**Solution:**
- Check database connectivity
- Verify user service is working
- Check onboarding service logs
- Ensure all required environment variables are set

#### 5. Webhook Not Receiving Data
**Problem:** No webhook data received
**Solution:**
- Verify webhook URL is correct: `https://api.chatmiimii.com/api/webhook/whatsapp`
- Check webhook verification token
- Ensure HTTPS is enabled
- Verify the webhook is verified in WhatsApp Business Manager

#### 6. Flow Not Sending
**Problem:** Flow message not sent to user
**Solution:**
- Check WhatsApp API credentials
- Verify phone number ID is correct
- Ensure access token is valid
- Check message template approval status

### Debug Commands

```bash
# Test WhatsApp API credentials
curl -X GET "https://graph.facebook.com/v18.0/755450640975332" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Test public key upload
curl -X POST "https://graph.facebook.com/v18.0/755450640975332/settings/business/whatsapp_business_encryption" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "public_key=YOUR_PUBLIC_KEY"

# Verify public key status
curl -X GET "https://graph.facebook.com/v18.0/755450640975332/settings/business/whatsapp_business_encryption" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Test Flow JSON validation
curl "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"

# Test endpoint health
curl "https://api.chatmiimii.com/api/flow/health"

# Check environment variables
curl "https://api.chatmiimii.com/api/whatsapp/test-config"
```

---

## 📋 Environment Variables Checklist

Make sure these are set in Digital Ocean:

```env
# WhatsApp API
BOT_ACCESS_TOKEN=your_access_token
BOT_PHONE_NUMBER_ID=755450640975332
BOT_BUSINESS_ACCOUNT_ID=1722871389103605
WEBHOOK_SECRET=bd39e45bd67e5cee631eb014550ff6b3e4acba897ee066a65d45c2c43395a7bd

# Flow Configuration
FLOW_PRIVATE_KEY=your_private_key
FLOW_PASSPHRASE=miimii-flow-secure-passphrase-2024
FLOW_ENDPOINT_URL=https://api.chatmiimii.com/api/flow/endpoint
WHATSAPP_ONBOARDING_FLOW_ID=your_onboarding_flow_id
WHATSAPP_LOGIN_FLOW_ID=your_login_flow_id

# External Services
FINCRA_API_KEY=pk_test_Njc3ODcwOGI2MTEzZDM1MWMwOWM4ZDBkOjoxMzQ0NDc=
FINCRA_SECRET_KEY=E9v9JlE1NNm4z14t9lzFU2FAg26qN1Sk
FINCRA_BUSINESS_ID=your_fincra_business_id

# Database
DB_CONNECTION_URL=postgresql://doadmin:AVNS_J9gjpWqQnV9WTaTwtXH@miimiidb-do-user-20025867-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require

# AI Service
AI_API_KEY=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
AI_MODEL=gpt-4-turbo
```

---

## 📁 Files Provided

- `flow-json/onboarding-flow.json` - Complete onboarding Flow JSON
- `flow-json/login-flow.json` - Complete login Flow JSON
- `generate_flow_keys.js` - RSA key generation script
- `src/routes/flowEndpoint.js` - Flow endpoint implementation
- `src/routes/whatsapp.js` - WhatsApp API routes
- `WHATSAPP_FLOW_SETUP_GUIDE.md` - Detailed setup guide

---

## ✅ Success Checklist

- [ ] RSA keys generated and uploaded
- [ ] Environment variables set in Digital Ocean
- [ ] Flows created in WhatsApp Business Manager
- [ ] Public key uploaded via WhatsApp Business API
- [ ] Public key signature status verified as "VALID"
- [ ] Flow IDs added to environment variables
- [ ] Webhook URL configured
- [ ] Health check endpoint working
- [ ] Flow JSON validation passing
- [ ] Test message sent successfully
- [ ] Data persistence verified
- [ ] Virtual account creation working

---

## 🆘 Support

If you encounter issues:
1. Check the application logs in Digital Ocean
2. Verify all environment variables are set correctly
3. Test the health check endpoint
4. Ensure WhatsApp Business Manager configuration is correct
5. Check the troubleshooting section above

**All files are ready for production use!**

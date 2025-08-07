# WhatsApp Flow Setup Guide for MiiMii

## Overview
This guide will help you set up WhatsApp Flows for the MiiMii platform. The Flows handle user onboarding and login processes with proper data collection and validation.

## Prerequisites
- WhatsApp Business Manager access
- Admin permissions to create Flows
- Your MiiMii API endpoint ready: `https://api.chatmiimii.com/api/flow/endpoint`

## Step 1: Generate RSA Keys (if not already done)

Run the key generation script:
```bash
node generate_flow_keys.js
```

This will create:
- `flow-keys/private_key.pem` - Your private key
- `flow-keys/public_key.pem` - Your public key
- `.env.flow` - Environment variables to add to your server

## Step 2: Update Environment Variables

Add these to your Digital Ocean environment variables:

```env
# Flow Endpoint Configuration
FLOW_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[Your private key content]\n-----END PRIVATE KEY-----"
FLOW_PASSPHRASE="miimii-flow-secure-passphrase-2024"
FLOW_ENDPOINT_URL="https://api.chatmiimii.com/api/flow/endpoint"
```

## Step 3: Create Flows in WhatsApp Business Manager

### 3.1 Create Onboarding Flow

1. Go to WhatsApp Business Manager
2. Navigate to **Flows** section
3. Click **Create Flow**
4. Name it: `MiiMii Onboarding Flow`
5. Copy the entire content from `flow-json/onboarding-flow.json`
6. Paste it into the Flow JSON editor
7. Save the Flow
8. Note the **Flow ID** (you'll need this later)

### 3.2 Create Login Flow

1. Create another Flow
2. Name it: `MiiMii Login Flow`
3. Copy the entire content from `flow-json/login-flow.json`
4. Paste it into the Flow JSON editor
5. Save the Flow
6. Note the **Flow ID** (you'll need this later)

## Step 4: Upload Public Key to WhatsApp

1. In WhatsApp Business Manager, go to **Settings** > **Flows**
2. Upload your public key (`flow-keys/public_key.pem`)
3. This enables encrypted data exchange between WhatsApp and your endpoint

## Step 5: Update Environment Variables with Flow IDs

Add these to your Digital Ocean environment variables:

```env
# WhatsApp Flow IDs (replace with your actual Flow IDs)
WHATSAPP_ONBOARDING_FLOW_ID="your_onboarding_flow_id_here"
WHATSAPP_LOGIN_FLOW_ID="your_login_flow_id_here"
```

## Step 6: Test the Setup

### 6.1 Test Flow JSON Endpoint
```bash
curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"
```

### 6.2 Test Flow Health Check
```bash
curl -X GET "https://api.chatmiimii.com/api/flow/health"
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

## Step 7: Configure Webhook URL

In WhatsApp Business Manager:
1. Go to **Webhooks**
2. Set the webhook URL to: `https://api.chatmiimii.com/api/webhook/whatsapp`
3. Verify the webhook is working

## Flow Structure

### Onboarding Flow
1. **Welcome Screen** - Introduction and start button
2. **Personal Details** - Collect user information
3. **BVN Verification** - Verify Bank Verification Number
4. **PIN Setup** - Create account PIN and complete setup

### Login Flow
1. **PIN Input** - Enter 4-digit PIN to access account

## Data Flow

1. User starts Flow via WhatsApp
2. Data is collected through Flow screens
3. Data is encrypted and sent to your endpoint
4. Your endpoint processes the data and responds
5. User completes the Flow with account setup

## Security Features

- **RSA Encryption**: All data is encrypted using your private/public key pair
- **AES-GCM**: Additional encryption layer for data transmission
- **Token Verification**: Flow tokens ensure session integrity
- **Data Validation**: Server-side validation of all collected data

## Monitoring

### Health Check Endpoint
- URL: `https://api.chatmiimii.com/api/flow/health`
- Returns: Service status, encryption status, database connectivity

### Logs
Monitor your application logs for:
- Flow endpoint requests
- Data processing results
- Error messages
- User completion events

## Troubleshooting

### Common Issues

1. **Flow ID Invalid**
   - Ensure you're using the correct Flow ID from WhatsApp Business Manager
   - Check that the Flow is published and active

2. **Encryption Errors**
   - Verify your private key is correctly formatted
   - Check that the passphrase matches
   - Ensure the public key is uploaded to WhatsApp

3. **Data Not Persisting**
   - Check database connectivity
   - Verify user service is working
   - Check onboarding service logs

4. **Webhook Not Receiving Data**
   - Verify webhook URL is correct
   - Check webhook verification token
   - Ensure HTTPS is enabled

### Debug Endpoints

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

## Next Steps

1. **Deploy the updated code** to your production server
2. **Test the complete flow** with a real WhatsApp number
3. **Monitor the logs** for any issues
4. **Verify data persistence** in your database
5. **Test the virtual account creation** process

## Support

If you encounter issues:
1. Check the application logs
2. Verify all environment variables are set
3. Test the health check endpoint
4. Ensure WhatsApp Business Manager configuration is correct

## Files Provided

- `flow-json/onboarding-flow.json` - Complete onboarding Flow JSON
- `flow-json/login-flow.json` - Complete login Flow JSON
- `generate_flow_keys.js` - RSA key generation script
- `src/routes/flowEndpoint.js` - Flow endpoint implementation
- `src/routes/whatsapp.js` - WhatsApp API routes

All files are ready for production use!

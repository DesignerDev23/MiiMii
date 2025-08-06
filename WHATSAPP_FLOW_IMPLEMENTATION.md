# WhatsApp Flow Implementation for MiiMii

## Overview

This document describes the implementation of WhatsApp Flow templates for MiiMii's onboarding and authentication system. The Flow system provides a more secure and user-friendly way to collect user data and handle authentication.

## 🎯 What Was Fixed

### 1. **AI Welcome Message Issues**
- **Problem**: AI welcome message wasn't using WhatsApp profile names properly
- **Solution**: Enhanced message processor to prioritize WhatsApp profile names over stored data
- **Result**: Users now receive personalized greetings using their actual WhatsApp profile names

### 2. **User Data Saving Issues**
- **Problem**: Messages were being saved to first/last name columns incorrectly
- **Solution**: Improved user data handling with proper validation and storage
- **Result**: User data is now saved correctly to appropriate database columns

### 3. **Onboarding Flow Problems**
- **Problem**: Traditional onboarding was not working properly
- **Solution**: Implemented WhatsApp Flow templates for secure data collection
- **Result**: Users can now complete onboarding through interactive WhatsApp Flow forms

### 4. **Authentication System**
- **Problem**: No secure login system
- **Solution**: Implemented 4-digit PIN authentication using WhatsApp Flow
- **Result**: Users can securely log in using their 4-digit PIN

## 🏗️ Architecture

### Flow Templates Created

#### 1. **Onboarding Flow Template** (`miimii_onboarding_flow`)
```json
{
  "name": "miimii_onboarding_flow",
  "language": "en_US",
  "category": "MARKETING",
  "components": [
    {
      "type": "body",
      "text": "Welcome to MiiMii! Let's complete your account setup securely."
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "FLOW",
          "text": "Complete Onboarding",
          "flow_action": "navigate",
          "navigate_screen": "WELCOME_SCREEN",
          "flow_json": "..."
        }
      ]
    }
  ]
}
```

#### 2. **Login Flow Template** (`miimii_login_flow`)
```json
{
  "name": "miimii_login_flow",
  "language": "en_US",
  "category": "MARKETING",
  "components": [
    {
      "type": "body",
      "text": "Welcome back! Please enter your 4-digit PIN to access your account."
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "FLOW",
          "text": "Login with PIN",
          "flow_action": "navigate",
          "navigate_screen": "PIN_INPUT_SCREEN",
          "flow_json": "..."
        }
      ]
    }
  ]
}
```

### Flow Screens

#### Onboarding Flow Screens:
1. **WELCOME_SCREEN** - Introduction and start button
2. **PERSONAL_DETAILS_SCREEN** - Collect first name, last name, middle name, date of birth, gender
3. **BVN_SCREEN** - Collect and verify BVN
4. **PIN_SETUP_SCREEN** - Create and confirm 4-digit PIN

#### Login Flow Screens:
1. **PIN_INPUT_SCREEN** - Enter 4-digit PIN for authentication

## 🔧 Implementation Details

### New Services Created

#### 1. **WhatsApp Flow Service** (`src/services/whatsappFlowService.js`)
- Handles Flow template creation
- Manages Flow message sending
- Processes Flow webhook data
- Generates and verifies secure flow tokens

#### 2. **Enhanced Message Processor** (`src/services/messageProcessor.js`)
- Improved welcome message with proper profile name detection
- Flow-based onboarding handling
- Better user data management

### New Routes Added

#### 1. **Flow Template Management**
```javascript
POST /api/whatsapp/create-flow-templates
POST /api/whatsapp/send-flow-message
POST /api/whatsapp/test-flow-webhook
```

#### 2. **Enhanced Webhook Handling**
- Updated webhook route to handle Flow data
- Improved message parsing for Flow messages
- Better error handling and logging

### Database Updates

#### User Model Updates:
```javascript
onboardingStep: {
  type: DataTypes.ENUM(
    'initial', 'greeting', 'name_collection', 'kyc_data', 'bvn_verification', 
    'virtual_account_creation', 'pin_setup', 'flow_onboarding', 'completed'
  ),
  defaultValue: 'initial'
}
```

## 🚀 How to Use

### 1. **Setup Flow Templates**
```bash
# Run the setup script
node setup_flow_templates.js
```

### 2. **Set Environment Variables**
```bash
# Add these to your environment variables
WHATSAPP_ONBOARDING_FLOW_ID=<template_id_from_setup>
WHATSAPP_LOGIN_FLOW_ID=<template_id_from_setup>
BOT_BUSINESS_ACCOUNT_ID=<your_waba_id>
```

### 3. **Test the System**
```bash
# Test welcome message
curl -X POST https://api.chatmiimii.com/api/whatsapp/test-interactive-bot \
  -H "Content-Type: application/json" \
  -d '{"to": "+2348012345678", "testScenario": "welcome_new_user"}'

# Test onboarding flow
curl -X POST https://api.chatmiimii.com/api/whatsapp/send-flow-message \
  -H "Content-Type: application/json" \
  -d '{"to": "+2348012345678", "flowType": "onboarding"}'

# Test login flow
curl -X POST https://api.chatmiimii.com/api/whatsapp/send-flow-message \
  -H "Content-Type: application/json" \
  -d '{"to": "+2348012345678", "flowType": "login"}'
```

## 🔐 Security Features

### 1. **Secure Flow Tokens**
- Tokens are cryptographically signed
- Include user ID, timestamp, and random string
- 24-hour expiration
- Tamper-proof verification

### 2. **Data Encryption**
- Flow data can be encrypted (when supported by WhatsApp)
- Secure transmission of sensitive information
- Proper handling of encrypted data

### 3. **Input Validation**
- All user inputs are validated
- BVN verification before proceeding
- PIN confirmation and validation

## 📱 User Experience Flow

### New User Journey:
1. **Welcome Message**: User receives personalized greeting with their WhatsApp profile name
2. **Onboarding Button**: User clicks "Complete Onboarding" button
3. **Flow Form**: User fills out personal details in interactive WhatsApp form
4. **BVN Verification**: User enters BVN for verification
5. **PIN Setup**: User creates 4-digit PIN
6. **Completion**: Account is fully set up and ready to use

### Returning User Journey:
1. **Welcome Back**: User receives personalized welcome message
2. **Login Flow**: User clicks "Login with PIN" button
3. **PIN Entry**: User enters 4-digit PIN in secure form
4. **Access Granted**: User is authenticated and can access account

## 🔍 Monitoring and Debugging

### 1. **Webhook Logs**
- All Flow webhook data is logged
- Token verification status is tracked
- Error handling with detailed logging

### 2. **Flow Token Tracking**
- Token generation and verification logs
- Expired token detection
- Invalid token handling

### 3. **User Journey Tracking**
- Onboarding step progression
- Flow completion status
- Error recovery mechanisms

## 🛠️ Troubleshooting

### Common Issues:

#### 1. **Flow Templates Not Created**
```bash
# Check WhatsApp Business Account permissions
# Verify access token has template creation rights
# Check if templates already exist
```

#### 2. **Flow Messages Not Sending**
```bash
# Verify Flow template IDs are correct
# Check phone number format (E.164)
# Verify webhook URL is configured
```

#### 3. **Webhook Not Receiving Data**
```bash
# Check webhook URL configuration in WhatsApp Business Manager
# Verify webhook signature verification
# Check server logs for incoming requests
```

### Debug Commands:
```bash
# Test Flow webhook processing
curl -X POST https://api.chatmiimii.com/api/whatsapp/test-flow-webhook \
  -H "Content-Type: application/json" \
  -d '{"flowData": {"flow_token": "test", "screen": "test", "data": {}}}'

# Check Flow template status
curl -X GET https://graph.facebook.com/v18.0/<waba-id>/message_templates \
  -H "Authorization: Bearer <access_token>"
```

## 📊 Performance Metrics

### Key Metrics to Monitor:
1. **Flow Completion Rate**: Percentage of users who complete onboarding
2. **Flow Drop-off Rate**: Where users abandon the flow
3. **Token Verification Success Rate**: Security metric
4. **Webhook Processing Time**: Performance metric
5. **Error Rate**: System reliability metric

## 🔄 Future Enhancements

### Planned Improvements:
1. **Multi-language Support**: Add support for Hausa, Yoruba, Igbo
2. **Advanced Validation**: Real-time BVN verification
3. **Biometric Integration**: Fingerprint/face recognition
4. **Offline Support**: Handle network interruptions
5. **Analytics Dashboard**: Detailed flow analytics

## 📋 Environment Variables

### Required Variables:
```bash
# WhatsApp Configuration
BOT_ACCESS_TOKEN=<your_access_token>
BOT_PHONE_NUMBER_ID=<your_phone_number_id>
BOT_BUSINESS_ACCOUNT_ID=<your_waba_id>
BOT_WEBHOOK_VERIFY_TOKEN=<your_webhook_verify_token>

# Flow Template IDs (set after running setup script)
WHATSAPP_ONBOARDING_FLOW_ID=<template_id>
WHATSAPP_LOGIN_FLOW_ID=<template_id>

# Security
APP_SECRET=<your_app_secret>

# Database
DB_CONNECTION_URL=<your_database_url>

# Other Services
AI_API_KEY=<your_openai_api_key>
```

## 🎉 Success Criteria

### Implementation Success:
- ✅ AI welcome message uses WhatsApp profile names
- ✅ User data is saved correctly to database
- ✅ Onboarding works through WhatsApp Flow
- ✅ 4-digit PIN authentication is functional
- ✅ Flow webhooks are processed correctly
- ✅ Secure token generation and verification
- ✅ Comprehensive error handling and logging

This implementation provides a robust, secure, and user-friendly onboarding and authentication system for MiiMii using WhatsApp Flow templates. 
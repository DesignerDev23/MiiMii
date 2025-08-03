# Gupshup WhatsApp Business API Setup Guide

This guide will help you implement WhatsApp Business API using Gupshup with flow messages for onboarding and interactive features for your MiiMii fintech platform.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Gupshup Account Setup](#gupshup-account-setup)
3. [WhatsApp Business API Configuration](#whatsapp-business-api-configuration)
4. [Environment Configuration](#environment-configuration)
5. [Creating WhatsApp Flows](#creating-whatsapp-flows)
6. [Testing Your Integration](#testing-your-integration)
7. [Production Deployment](#production-deployment)
8. [API Documentation](#api-documentation)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+ installed
- WhatsApp Business Account
- Domain for webhook URL
- SSL certificate for webhook endpoints
- Basic understanding of WhatsApp Business API concepts

## Gupshup Account Setup

### Step 1: Create Gupshup Account
1. Visit [https://www.gupshup.io/](https://www.gupshup.io/)
2. Click on "Sign Up" or "Get Started"
3. Create your account using email or social login
4. Verify your email address

### Step 2: Access WhatsApp Self-Serve Platform
1. Login to your Gupshup account
2. Navigate to WhatsApp Self-Serve Platform
3. Click on "Create Your First App"

### Step 3: Onboard Your Business
Choose your onboarding path:

#### For Direct Customers:
- Use the Embedded Sign-up guide
- Complete business verification
- Provide business documents as required

#### For ISVs/Tech Providers:
- Follow the Gupshup Partner Onboarding process
- Complete Meta's Tech Provider Program requirements

## WhatsApp Business API Configuration

### Step 4: Get Your API Credentials
1. In your Gupshup dashboard, go to "App Dashboard"
2. Find your API credentials:
   - **API Key**: Your unique Gupshup API key
   - **App Name**: Your WhatsApp Business app name
   - **Source Number**: Your WhatsApp Business phone number
   - **Namespace**: Your template namespace

### Step 5: Set Up Phone Number
1. Navigate to "Settings" in your app dashboard
2. Register your business phone number
3. Complete phone number verification via SMS/call
4. Choose your phone number tier (affects messaging limits)

### Step 6: Business Profile Setup
1. Go to "Profile" section
2. Complete your business profile:
   - Business name and description
   - Profile photo
   - Website URL
   - Business address
   - Contact email

## Environment Configuration

### Step 7: Configure Environment Variables
Copy `.env.example` to `.env` and update with your Gupshup credentials:

```bash
# Gupshup WhatsApp Configuration
GUPSHUP_API_KEY=your-actual-gupshup-api-key
GUPSHUP_APP_NAME=your-app-name
GUPSHUP_SOURCE_NUMBER=your-whatsapp-business-number
GUPSHUP_NAMESPACE=your-namespace
GUPSHUP_WEBHOOK_VERIFY_TOKEN=secure-webhook-token

# WhatsApp Flow IDs (to be created)
GUPSHUP_ONBOARDING_FLOW_ID=
GUPSHUP_KYC_FLOW_ID=
GUPSHUP_TRANSACTION_FLOW_ID=
```

### Step 8: Install Dependencies
```bash
npm install
```

## Creating WhatsApp Flows

WhatsApp Flows are interactive forms that appear as bottom drawer interfaces. Here's how to create them:

### Step 9: Create Onboarding Flow

#### Using Gupshup Console:
1. Go to "Bot Studio" in your Gupshup dashboard
2. Create a new journey for onboarding
3. Add WhatsApp Flow node
4. Configure the flow with these screens:

#### Personal Information Screen:
```json
{
  "version": "3.0",
  "screens": [
    {
      "id": "personal_info",
      "title": "Personal Information",
      "terminal": false,
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "personal_form",
            "children": [
              {
                "type": "TextInput",
                "name": "first_name",
                "label": "First Name",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "TextInput",
                "name": "last_name",
                "label": "Last Name",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "TextInput",
                "name": "email",
                "label": "Email Address",
                "required": true,
                "input-type": "email"
              },
              {
                "type": "DatePicker",
                "name": "date_of_birth",
                "label": "Date of Birth",
                "required": true
              },
              {
                "type": "RadioButtonsGroup",
                "name": "user_type",
                "label": "Account Type",
                "required": true,
                "data-source": [
                  {"id": "individual", "title": "Individual"},
                  {"id": "business", "title": "Business"}
                ]
              },
              {
                "type": "Footer",
                "label": "Continue",
                "on-click-action": {
                  "name": "navigate",
                  "next": {
                    "type": "screen",
                    "name": "address_info"
                  },
                  "payload": {}
                }
              }
            ]
          }
        ]
      }
    },
    {
      "id": "address_info",
      "title": "Address Information",
      "terminal": true,
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "address_form",
            "children": [
              {
                "type": "TextInput",
                "name": "street_address",
                "label": "Street Address",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "TextInput",
                "name": "city",
                "label": "City",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "TextInput",
                "name": "state",
                "label": "State/Province",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "TextInput",
                "name": "postal_code",
                "label": "Postal Code",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "Footer",
                "label": "Complete Registration",
                "on-click-action": {
                  "name": "complete",
                  "payload": {}
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### Step 10: Create KYC Verification Flow
Create another flow for KYC with document upload capabilities:

```json
{
  "version": "3.0",
  "screens": [
    {
      "id": "document_upload",
      "title": "Identity Verification",
      "terminal": false,
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "kyc_form",
            "children": [
              {
                "type": "Dropdown",
                "name": "document_type",
                "label": "Document Type",
                "required": true,
                "data-source": [
                  {"id": "passport", "title": "Passport"},
                  {"id": "national_id", "title": "National ID"},
                  {"id": "drivers_license", "title": "Driver's License"}
                ]
              },
              {
                "type": "TextInput",
                "name": "document_number",
                "label": "Document Number",
                "required": true,
                "input-type": "text"
              },
              {
                "type": "PhotoPicker",
                "name": "document_front",
                "label": "Document Front Photo",
                "required": true
              },
              {
                "type": "PhotoPicker",
                "name": "document_back",
                "label": "Document Back Photo",
                "required": true
              },
              {
                "type": "Footer",
                "label": "Submit for Verification",
                "on-click-action": {
                  "name": "complete",
                  "payload": {}
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### Step 11: Configure Webhook
1. In Gupshup dashboard, go to "Webhooks"
2. Set your webhook URL: `https://your-domain.com/api/whatsapp/webhook`
3. Enable the following events:
   - Message events
   - Delivery events
   - Flow response events
   - User events

## Testing Your Integration

### Step 12: Test Basic Messaging
```bash
# Start your application
npm run dev

# Test opt-in endpoint
curl -X POST http://localhost:3000/api/whatsapp/opt-in \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# Test welcome message
curl -X POST http://localhost:3000/api/whatsapp/send/welcome \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "userName": "John Doe"}'
```

### Step 13: Test Flow Messages
```bash
# Test onboarding flow
curl -X POST http://localhost:3000/api/whatsapp/send/onboarding-flow \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "userType": "individual"}'
```

### Step 14: Test Interactive Messages
```bash
# Test button message
curl -X POST http://localhost:3000/api/whatsapp/send/buttons \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "text": "Choose an option:",
    "buttons": [
      {"id": "option1", "title": "Option 1"},
      {"id": "option2", "title": "Option 2"}
    ]
  }'
```

## Production Deployment

### Step 15: Deploy to Production
1. Set up your production server with SSL
2. Update webhook URL in Gupshup dashboard
3. Set production environment variables
4. Enable webhook verification

### Step 16: Phone Number Verification
For production use:
1. Verify your business through Meta Business Verification
2. Submit required business documents
3. Complete phone number registration
4. Request higher messaging tier limits

## API Documentation

### Available Endpoints

#### Send Messages
- `POST /api/whatsapp/send/text` - Send text message
- `POST /api/whatsapp/send/buttons` - Send button message
- `POST /api/whatsapp/send/list` - Send list message
- `POST /api/whatsapp/send/welcome` - Send welcome message
- `POST /api/whatsapp/send/services-menu` - Send services menu

#### Flow Messages
- `POST /api/whatsapp/send/onboarding-flow` - Send onboarding flow
- `POST /api/whatsapp/send/kyc-flow` - Send KYC verification flow
- `POST /api/whatsapp/send/transaction-flow` - Send transaction confirmation flow

#### Templates & Notifications
- `POST /api/whatsapp/send/template` - Send template message
- `POST /api/whatsapp/send/verification-code` - Send verification code
- `POST /api/whatsapp/send/transaction-notification` - Send transaction notification
- `POST /api/whatsapp/send/payment-reminder` - Send payment reminder

#### Management
- `POST /api/whatsapp/opt-in` - Opt-in user
- `GET /api/whatsapp/status` - Check service status
- `GET /api/whatsapp/chat-history/:phoneNumber` - Get chat history

### Example Usage

#### Send Onboarding Flow
```javascript
const response = await fetch('/api/whatsapp/send/onboarding-flow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phoneNumber: '+1234567890',
    userType: 'individual'
  })
});
```

#### Handle Flow Response (Webhook)
```javascript
// In your webhook handler
app.post('/api/whatsapp/webhook', (req, res) => {
  const { type, payload } = req.body;
  
  if (type === 'flow-response') {
    const { from, flow_token, response_data } = payload;
    
    if (flow_token.startsWith('onboarding_')) {
      // Process onboarding data
      console.log('User registration data:', response_data);
      // Save to database, send confirmation, etc.
    }
  }
  
  res.status(200).json({ success: true });
});
```

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Events
- Verify webhook URL is accessible publicly
- Check SSL certificate is valid
- Ensure webhook verification token matches
- Test webhook endpoint manually

#### 2. Messages Not Sending
- Check API key and credentials
- Verify phone number is opted-in
- Ensure source number is registered
- Check message format and size limits

#### 3. Flow Messages Not Working
- Verify flow ID is correct
- Check flow JSON structure
- Ensure flow is published in Gupshup console
- Test flow configuration

#### 4. Rate Limiting Issues
- Check your phone number tier
- Monitor messaging limits
- Implement proper error handling
- Add retry mechanisms

### Debug Mode
Enable debug logging by setting:
```bash
DEBUG=whatsapp:*
LOG_LEVEL=debug
```

### Support Resources
- [Gupshup Documentation](https://docs.gupshup.io/)
- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp)
- [Gupshup Support](https://support.gupshup.io/)

## Security Best Practices

1. **Webhook Security**
   - Always verify webhook signatures
   - Use HTTPS for all webhook URLs
   - Implement rate limiting

2. **API Key Management**
   - Store API keys in environment variables
   - Rotate keys regularly
   - Never commit keys to version control

3. **User Data Protection**
   - Encrypt sensitive user data
   - Implement proper access controls
   - Follow GDPR/data protection regulations

4. **Message Content**
   - Validate all user inputs
   - Sanitize message content
   - Implement content moderation

## Flow Message Features

### Supported Input Types
- Text Input (various types: text, email, phone, number)
- Date Picker
- Photo Picker
- Document Picker
- Dropdown
- Radio Buttons
- Checkboxes
- Location Picker

### Form Validation
- Required field validation
- Input type validation
- Custom regex patterns
- Min/max length validation

### Navigation
- Multi-screen flows
- Conditional navigation
- Dynamic screen generation
- Back button support

### Data Collection
- Form data aggregation
- File upload handling
- Data validation
- Response processing

## Advanced Features

### 1. Dynamic Flows
Create flows that adapt based on user input:
```javascript
// Example: Dynamic KYC flow based on country
const kycFlowData = {
  flow_id: getKYCFlowForCountry(userCountry),
  data: {
    country: userCountry,
    required_docs: getRequiredDocs(userCountry)
  }
};
```

### 2. Flow Analytics
Track flow completion rates:
```javascript
// Monitor flow analytics
const analytics = {
  flow_started: Date.now(),
  flow_completed: null,
  completion_rate: 0,
  drop_off_points: []
};
```

### 3. A/B Testing Flows
Test different flow versions:
```javascript
// A/B test different onboarding flows
const flowVersion = Math.random() > 0.5 ? 'v1' : 'v2';
const flowId = `onboarding_${flowVersion}`;
```

This setup provides a complete WhatsApp Business API integration with Gupshup, including advanced flow messages for user onboarding and interactive features perfect for a fintech platform.
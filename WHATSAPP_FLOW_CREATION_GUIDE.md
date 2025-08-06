# Complete WhatsApp Flow Creation Guide

## Overview
This guide will help you create WhatsApp Flow templates for MiiMii's onboarding and login processes, including the warm AI welcome message.

## Step 1: Create Onboarding Flow Template

### Template Configuration
1. **Go to WhatsApp Business Manager**
2. **Navigate to Message Templates**
3. **Click "Create Template"**

### Template Details
- **Template Name**: `onboarding`
- **Language**: English
- **Category**: Marketing

### Template Content

#### Header
- **Type**: None

#### Body
```
Hey {{1}}! 👋

Welcome to MiiMii - your personal financial assistant! 

I'm here to help you manage your money, send transfers, buy airtime, and pay bills. Let's get you set up with your account in just a few steps.

Ready to get started? 🚀
```

#### Footer
```
Tap 'Complete Onboarding' to begin
```

#### Button
- **Type**: Call to Action
- **Action Type**: Complete Flow
- **Button Text**: Complete Onboarding
- **Button Icon**: Default

### Flow Configuration

After creating the template, configure the Flow with these screens:

#### Screen 1: WELCOME_SCREEN
```json
{
  "id": "WELCOME_SCREEN",
  "layout": {
    "type": "form",
    "title": "Welcome to MiiMii",
    "body": "Let's get you set up with your account. This will only take a few minutes.",
    "buttons": [
      {
        "id": "start_onboarding",
        "type": "primary",
        "text": "Start Onboarding"
      }
    ]
  }
}
```

#### Screen 2: PERSONAL_DETAILS_SCREEN
```json
{
  "id": "PERSONAL_DETAILS_SCREEN",
  "layout": {
    "type": "form",
    "title": "Personal Details",
    "body": "Please provide your personal information:",
    "fields": [
      {
        "id": "first_name",
        "type": "text",
        "label": "First Name",
        "required": true,
        "placeholder": "Enter your first name"
      },
      {
        "id": "last_name",
        "type": "text",
        "label": "Last Name",
        "required": true,
        "placeholder": "Enter your last name"
      },
      {
        "id": "middle_name",
        "type": "text",
        "label": "Middle Name",
        "required": false,
        "placeholder": "Enter your middle name (optional)"
      },
      {
        "id": "phone_number",
        "type": "phone",
        "label": "Phone Number",
        "required": true,
        "placeholder": "Enter your phone number"
      },
      {
        "id": "address",
        "type": "text",
        "label": "Address",
        "required": true,
        "placeholder": "Enter your residential address"
      },
      {
        "id": "gender",
        "type": "select",
        "label": "Gender",
        "required": true,
        "options": [
          {"id": "male", "text": "Male"},
          {"id": "female", "text": "Female"}
        ]
      },
      {
        "id": "date_of_birth",
        "type": "date",
        "label": "Date of Birth",
        "required": true
      }
    ],
    "buttons": [
      {
        "id": "next_to_bvn",
        "type": "primary",
        "text": "Next"
      }
    ]
  }
}
```

#### Screen 3: BVN_SCREEN
```json
{
  "id": "BVN_SCREEN",
  "layout": {
    "type": "form",
    "title": "BVN Verification",
    "body": "For security purposes, we need to verify your BVN:",
    "fields": [
      {
        "id": "bvn",
        "type": "text",
        "label": "BVN Number",
        "required": true,
        "placeholder": "Enter your 11-digit BVN",
        "validation": {
          "pattern": "^[0-9]{11}$",
          "message": "BVN must be exactly 11 digits"
        }
      }
    ],
    "buttons": [
      {
        "id": "verify_bvn",
        "type": "primary",
        "text": "Verify BVN"
      }
    ]
  }
}
```

#### Screen 4: PIN_SETUP_SCREEN
```json
{
  "id": "PIN_SETUP_SCREEN",
  "layout": {
    "type": "form",
    "title": "Set Your PIN",
    "body": "Create a 4-digit PIN for your account security:",
    "fields": [
      {
        "id": "pin",
        "type": "text",
        "label": "4-Digit PIN",
        "required": true,
        "placeholder": "Enter 4-digit PIN",
        "validation": {
          "pattern": "^[0-9]{4}$",
          "message": "PIN must be exactly 4 digits"
        }
      },
      {
        "id": "pin_confirmation",
        "type": "text",
        "label": "Confirm PIN",
        "required": true,
        "placeholder": "Confirm your 4-digit PIN",
        "validation": {
          "pattern": "^[0-9]{4}$",
          "message": "PIN must be exactly 4 digits"
        }
      }
    ],
    "buttons": [
      {
        "id": "complete_setup",
        "type": "primary",
        "text": "Complete Setup"
      }
    ]
  }
}
```

## Step 2: Create Login Flow Template

### Template Configuration
1. **Go to WhatsApp Business Manager**
2. **Navigate to Message Templates**
3. **Click "Create Template"**

### Template Details
- **Template Name**: `login`
- **Language**: English
- **Category**: Marketing

### Template Content

#### Header
- **Type**: None

#### Body
```
Welcome back! 🔐

Please enter your 4-digit PIN to access your MiiMii account.
```

#### Footer
```
Your PIN is required for security
```

#### Button
- **Type**: Call to Action
- **Action Type**: Complete Flow
- **Button Text**: Login
- **Button Icon**: Default

### Login Flow Configuration

#### Screen 1: PIN_INPUT_SCREEN
```json
{
  "id": "PIN_INPUT_SCREEN",
  "layout": {
    "type": "form",
    "title": "Enter Your PIN",
    "body": "Please enter your 4-digit PIN:",
    "fields": [
      {
        "id": "login_pin",
        "type": "text",
        "label": "PIN",
        "required": true,
        "placeholder": "Enter your 4-digit PIN",
        "validation": {
          "pattern": "^[0-9]{4}$",
          "message": "PIN must be exactly 4 digits"
        }
      }
    ],
    "buttons": [
      {
        "id": "verify_login",
        "type": "primary",
        "text": "Login"
      }
    ]
  }
}
```

## Step 3: Get Template IDs

After creating both templates, you'll receive Template IDs that look like:
```
12345678901234567890123456789012
```

Copy these IDs for the next step.

## Step 4: Set Environment Variables

Add these environment variables to your Digital Ocean App Platform:

```
WHATSAPP_ONBOARDING_FLOW_ID=your_onboarding_template_id_here
WHATSAPP_LOGIN_FLOW_ID=your_login_template_id_here
```

## Step 5: Test the Flow

### Test Welcome Message
```bash
curl -X POST https://api.chatmiimii.com/api/whatsapp/test-interactive-bot \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+2348012345678",
    "testScenario": "welcome_new_user"
  }'
```

### Test Onboarding Flow
```bash
curl -X POST https://api.chatmiimii.com/api/whatsapp/send-flow-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+2348012345678",
    "flowType": "onboarding"
  }'
```

### Test Login Flow
```bash
curl -X POST https://api.chatmiimii.com/api/whatsapp/send-flow-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+2348012345678",
    "flowType": "login"
  }'
```

## Step 6: Automated Setup (Alternative)

If you prefer automated setup, run:

```bash
node setup_flow_templates.js
```

This will:
1. Create the Flow templates programmatically
2. Display the Template IDs
3. Test the welcome message and flows
4. Provide the environment variables to set

## Important Notes

1. **Template Approval**: WhatsApp templates require approval (usually 24-48 hours)
2. **Variable Usage**: The `{{1}}` in the body will be replaced with the user's WhatsApp profile name
3. **Flow Validation**: Ensure all required fields have proper validation
4. **Testing**: Test thoroughly with real phone numbers before going live
5. **Webhook Configuration**: Ensure your webhook endpoint is configured to handle Flow callbacks

## Troubleshooting

### Common Issues

1. **Template Not Approved**: Wait for approval or check template guidelines
2. **Flow Not Working**: Verify Template IDs are correctly set in environment variables
3. **Welcome Message Not Personal**: Check that the user's WhatsApp profile name is being captured
4. **Webhook Errors**: Ensure webhook endpoint is accessible and properly configured

### Support

If you encounter issues:
1. Check the application logs
2. Verify environment variables are set correctly
3. Test with the provided API endpoints
4. Review the `WHATSAPP_FLOW_IMPLEMENTATION.md` documentation

## Next Steps

After setting up the Flow templates:

1. **Monitor Usage**: Track Flow completion rates
2. **Optimize UX**: Refine the Flow based on user feedback
3. **Add Features**: Consider adding more screens for additional KYC requirements
4. **Security**: Implement additional security measures for PIN validation 
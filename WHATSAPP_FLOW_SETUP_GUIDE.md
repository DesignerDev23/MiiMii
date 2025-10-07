# WhatsApp Flow Setup Guide for PIN Verification

## 📋 Overview
This guide will help you set up the PIN verification WhatsApp Flow in WhatsApp Business Manager to enable PIN enable/disable functionality.

## 🔧 Step-by-Step Setup

### 1. Access WhatsApp Business Manager
1. Go to [business.facebook.com](https://business.facebook.com)
2. Navigate to your WhatsApp Business Account
3. Go to **WhatsApp Manager** → **Flows**

### 2. Create New Flow
1. Click **"Create Flow"**
2. Select **"Custom Flow"**
3. Choose **"Security & Authentication"** as the category

### 3. Configure Flow Details
- **Flow Name**: `PIN Management Flow`
- **Flow Description**: `Secure PIN verification for enabling/disabling transaction PIN`
- **Flow Category**: `Security`
- **Flow Version**: `1.0.0`

### 4. Import Flow Configuration
Copy the contents of `pin_management_flow.json` and paste it into the Flow Builder.

### 5. Flow Configuration Details

#### Screen 1: PIN Verification Screen
- **Screen ID**: `PIN_VERIFICATION_SCREEN`
- **Components**:
  - Header: "🔐 PIN Verification"
  - Body: "Enter your 4-digit PIN to authorize this action"
  - Footer: "This action requires PIN verification for security"
  - Form with PIN input (4 digits, numbers only)
  - Verify & Continue button
  - Cancel button

#### Screen 2: Processing Screen
- **Screen ID**: `PROCESSING_SCREEN`
- **Components**:
  - Header: "⏳ Processing"
  - Body: "Verifying your PIN and processing your request..."
  - Footer: "Please wait while we process your request"
  - Spinner component

### 6. Flow Actions Configuration
Configure the following actions:

#### Submit Flow Action
- **Action Name**: `submit_flow`
- **Data to Send**:
  ```json
  {
    "pin": "{{pin}}",
    "action": "{{action}}",
    "user_id": "{{user_id}}",
    "phone_number": "{{phone_number}}"
  }
  ```

#### Close Flow Action
- **Action Name**: `close_flow`
- **Behavior**: Close flow without submitting data

### 7. Save and Publish
1. **Save** the flow configuration
2. **Test** the flow in the preview mode
3. **Publish** the flow when ready
4. **Copy the Flow ID** (you'll need this for configuration)

## 🔑 Environment Variables Setup

After creating the flow, add the Flow ID to your environment variables:

```bash
# Add this to your .env file or environment configuration
WHATSAPP_TRANSFER_PIN_FLOW_ID=YOUR_FLOW_ID_HERE
```

## 📝 Flow Data Structure

The flow expects the following data structure:

```json
{
  "user_id": "user-uuid-here",
  "phone_number": "+2349072874728",
  "action": "enable_pin", // or "disable_pin"
  "pin": "1234" // 4-digit PIN entered by user
}
```

## 🔄 Flow Completion Handling

The system will receive the following data when the flow is completed:

```json
{
  "pin": "1234",
  "action": "enable_pin",
  "user_id": "user-uuid-here",
  "phone_number": "+2349072874728"
}
```

## 🧪 Testing the Flow

### Test Scenarios:
1. **Enable PIN**: User enters "enable my pin" → Flow opens → User enters PIN → PIN gets enabled
2. **Disable PIN**: User enters "disable my pin" → Flow opens → User enters PIN → PIN gets disabled
3. **Invalid PIN**: User enters invalid PIN → Error message → Flow continues
4. **Cancel**: User clicks cancel → Flow closes → No action taken

### Expected Flow Behavior:
- ✅ PIN verification with 4-digit input
- ✅ Real-time validation
- ✅ Processing screen with spinner
- ✅ Success/error handling
- ✅ Cancel functionality

## 🚀 After Setup

Once you have the Flow ID:

1. **Update Environment Variables**: Add the Flow ID to your configuration
2. **Restart Application**: Restart your application to load the new configuration
3. **Test Commands**:
   - `"Enable my pin"` - Should open the PIN verification flow
   - `"Disable my pin"` - Should open the PIN verification flow
   - `"Buy 100 airtime"` - Should skip PIN when disabled, require PIN when enabled

## 🔧 Troubleshooting

### Common Issues:
1. **Flow ID Not Found**: Ensure the Flow ID is correctly set in environment variables
2. **Flow Not Opening**: Check if the flow is published and active
3. **PIN Validation Fails**: Ensure the PIN validation regex is correct
4. **Data Not Received**: Check the flow completion handling in the code

### Debug Steps:
1. Check application logs for flow-related errors
2. Verify Flow ID in environment variables
3. Test flow in WhatsApp Business Manager preview
4. Check webhook endpoints are working

## 📞 Support

If you encounter issues:
1. Check the application logs for detailed error messages
2. Verify the Flow ID configuration
3. Test the flow in WhatsApp Business Manager
4. Ensure all environment variables are set correctly

---

## 🎯 Next Steps

After setting up the flow:
1. **Get the Flow ID** from WhatsApp Business Manager
2. **Update your environment variables** with the Flow ID
3. **Restart your application**
4. **Test the PIN enable/disable functionality**

The system is already configured to handle the flow completion and process the PIN verification automatically!

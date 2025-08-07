# WhatsApp Template Issue Fix

## Problem Description

The MiiMii WhatsApp bot was encountering the following error:

```
Failed to send template flow message {"error":{"error":{"message":"(#132001) Template name does not exist in the translation","type":"OAuthException","code":132001,"error_data":{"messaging_product":"whatsapp","details":"template name (miimii_onboarding_flow) does not exist in en_US"},"fbtrace_id":"ADOiVCBwRuZNYQgQ8NyP9gr"}},"to":"+2349072874728","templateName":"miimii_onboarding_flow"}
```

## Root Cause

The issue was caused by:

1. **Missing Environment Variable**: The `WHATSAPP_ONBOARDING_FLOW_ID` environment variable was set to the placeholder value `"SET_THIS_IN_DO_UI"` instead of an actual WhatsApp Flow ID.

2. **Incorrect Fallback Logic**: When the Flow ID was not properly configured, the code was designed to fall back to interactive button messages. However, several methods were still attempting to send template flow messages using the hardcoded template name `'miimii_onboarding_flow'`.

3. **Missing WhatsApp Template**: The template `'miimii_onboarding_flow'` doesn't exist in the WhatsApp Business Manager, hence the error.

## Solution Applied

### 1. Fixed Fallback Logic

Updated the following methods to properly handle missing Flow IDs:

#### `messageProcessor.js`
- **`sendOnboardingFlow()`**: Now throws error early to trigger fallback to button messages
- **`startFlowBasedOnboarding()`**: Now uses `sendFlowMessage()` instead of `sendTemplateFlowMessage()`

#### `onboarding.js`  
- **`startGuidedKycFlow()`**: Now returns early with traditional onboarding when Flow ID is missing
- **`startOnboardingFlow()`**: Now returns early with traditional onboarding when Flow ID is missing

#### `whatsapp.js` routes
- **`/send-flow-message`**: Now uses `sendFlowMessage()` instead of `sendTemplateFlowMessage()`

### 2. Changed Template Flows to Interactive Flows

Instead of using WhatsApp message templates (which require approval and setup), the code now uses WhatsApp Interactive Flow messages directly when a valid Flow ID is configured.

**Before (problematic):**
```javascript
await whatsappService.sendTemplateFlowMessage(phoneNumber, 'miimii_onboarding_flow', templateFlowData);
```

**After (fixed):**
```javascript
await whatsappService.sendFlowMessage(phoneNumber, flowData);
```

### 3. Proper Environment Variable Validation

All methods now properly check for valid Flow IDs:

```javascript
const flowId = process.env.WHATSAPP_ONBOARDING_FLOW_ID;
if (!flowId || flowId === 'SET_THIS_IN_DO_UI' || flowId === 'miimii_onboarding_flow') {
  // Fallback to traditional onboarding
  return await this.fallbackToTraditionalOnboarding(user);
}
```

## Current Behavior

1. **With Missing Flow ID**: The bot falls back to sending interactive button messages for onboarding
2. **With Valid Flow ID**: The bot uses WhatsApp Interactive Flows for guided onboarding
3. **No More Template Errors**: The hardcoded template references have been removed

## Next Steps (Optional)

If you want to use WhatsApp message templates in the future:

1. **Create the template** in WhatsApp Business Manager:
   - Go to WhatsApp Business Manager
   - Create a new message template named `miimii_onboarding_flow`
   - Get it approved by WhatsApp

2. **Set the Flow ID** environment variable:
   - Create a WhatsApp Flow in the Business Manager
   - Set `WHATSAPP_ONBOARDING_FLOW_ID` to the actual Flow ID

3. **Update the code** to use templates if desired (currently unnecessary as Interactive Flows work fine)

## Files Modified

- `/src/services/messageProcessor.js`
- `/src/services/onboarding.js` 
- `/src/routes/whatsapp.js`

## Testing

The fix ensures that:
- ✅ No more template error messages
- ✅ Proper fallback to button messages when Flow ID is not configured
- ✅ Uses Interactive Flows when Flow ID is properly configured
- ✅ Maintains all existing functionality

The bot should now work correctly without the template errors.
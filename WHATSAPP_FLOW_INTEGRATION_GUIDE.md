# WhatsApp Flow Integration Guide

## Overview

Your MiiMii bot has been updated to work with your actual WhatsApp Flow created in Facebook WhatsApp Manager. The Flow JSON structure and field names now match exactly with your Flow configuration.

## Flow Structure

Your Flow has 4 screens:

1. **Welcome Screen** (`QUESTION_ONE`) - Introduction and start button
2. **Personal Details** (`screen_poawge`) - Collects user information
3. **BVN Verification** (`screen_kswuhq`) - Collects and validates BVN
4. **PIN Setup** (`screen_wkunnj`) - Sets up account PIN

## Field Mapping

### Personal Details Screen (`screen_poawge`)
The Flow collects the following fields with these exact names:

| Flow Field Name | Description | Mapped To |
|----------------|-------------|-----------|
| `First_Name_abf873` | First Name | `user.firstName` |
| `Last_Name_5487df` | Last Name | `user.lastName` |
| `Middle_Name_8abed2` | Middle Name | `user.middleName` |
| `Address_979e9b` | Address | `user.address` |
| `Gender_a12260` | Gender (Radio Button) | `user.gender` |
| `Date_of_Birth__291d3f` | Date of Birth | `user.dateOfBirth` |

### BVN Screen (`screen_kswuhq`)
| Flow Field Name | Description | Mapped To |
|----------------|-------------|-----------|
| `BVN_217ee8` | 11-digit BVN | Verified via KYC service |

### PIN Setup Screen (`screen_wkunnj`)
| Flow Field Name | Description | Mapped To |
|----------------|-------------|-----------|
| `4Digit_PIN_49b72a` | 4-digit PIN | `user.pin` (hashed) |
| `Confirm_PIN_a9ed34` | PIN confirmation | Validation only |

## Data Processing

### Gender Parsing
The Flow returns gender as radio button values (`"0_Male"` or `"1_Female"`). The code automatically parses this to standard values:
- `"0_Male"` → `"male"`
- `"1_Female"` → `"female"`

### Date Parsing
The Flow expects dates in `DD/MM/YYYY` format and converts them to `YYYY-MM-DD` for database storage.

### BVN Validation
- Must be exactly 11 digits
- Processed through the KYC verification service

### PIN Validation
- Must be exactly 4 digits
- PIN and confirmation must match
- Only numeric characters allowed

## Webhook Handler

The webhook handler in `whatsappFlowService.js` has been updated to handle your Flow's structure:

```javascript
// Extract data from each screen
switch (screen) {
  case 'screen_poawge': // Personal Details
    const firstName = data.screen_1_First_Name_0;
    const lastName = data.screen_1_Last_Name_1;
    // ... etc

  case 'screen_kswuhq': // BVN
    const bvn = data.screen_2_BVN_0;
    // ... etc

  case 'screen_wkunnj': // PIN Setup
    const pin = data.screen_3_4Digit_PIN_0;
    // ... etc
}
```

## Setting Up the Flow

### 1. Environment Variable
Set your actual Flow ID in the environment:

```bash
WHATSAPP_ONBOARDING_FLOW_ID=your_actual_flow_id_here
```

Replace `your_actual_flow_id_here` with the actual Flow ID from WhatsApp Business Manager.

### 2. Flow Creation Script
You can use the setup script to create Flow templates:

```bash
node setup_flow_templates.js
```

This will create the Flow templates and provide you with the Flow IDs.

### 3. Testing the Flow
Test the Flow integration with:

```bash
node test_interactive_bot.js
```

## Webhook Endpoint

Your webhook endpoint should be configured to receive Flow data at:

```
POST /webhook/whatsapp
```

The webhook will automatically detect Flow submissions and process them through the `handleFlowWebhook` method.

## Error Handling

The Flow handler includes comprehensive error handling:

### Validation Errors
- Invalid BVN length (not 11 digits)
- PIN mismatch
- Invalid PIN format (not 4 digits)
- Missing required fields

### Fallback Behavior
If the Flow ID is not configured or the Flow fails:
- Automatically falls back to interactive button messages
- Maintains all onboarding functionality
- Provides a seamless user experience

## Security Features

### Data Protection
- PINs are hashed before storage
- BVNs are partially masked in logs
- Full data validation at each step

### Token Verification
- Flow tokens are cryptographically signed
- Tokens expire after 24 hours
- Prevents tampering and replay attacks

## Monitoring and Logging

The system logs important events:

```javascript
// Example log output
{
  "message": "Personal details saved from Flow",
  "userId": "user_123",
  "firstName": "John",
  "lastName": "Doe",
  "gender": "male"
}
```

## Testing Checklist

- [ ] Flow ID environment variable is set
- [ ] Webhook endpoint is accessible
- [ ] Flow submission triggers correct webhook
- [ ] Personal details are saved correctly
- [ ] BVN validation works
- [ ] PIN setup completes successfully
- [ ] Error handling works for invalid data
- [ ] Fallback to buttons works when Flow ID is missing

## Troubleshooting

### Flow Not Triggering
1. Check `WHATSAPP_ONBOARDING_FLOW_ID` environment variable
2. Verify webhook URL is correct
3. Check WhatsApp Business Manager Flow status

### Data Not Saving
1. Check webhook logs for field name mismatches
2. Verify database connections
3. Check user service functionality

### Validation Errors
1. Review field validation logic
2. Check input format requirements
3. Verify error response handling

## Next Steps

1. Deploy the updated code to your server
2. Set the Flow ID environment variable
3. Test the complete Flow end-to-end
4. Monitor logs for any issues

The Flow integration is now fully compatible with your Facebook WhatsApp Manager Flow configuration!
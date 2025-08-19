# WhatsApp Flow Configuration Guide

## Data Purchase Flow Setup

### Step 1: Upload Flow to WhatsApp Business Manager

1. **Login to WhatsApp Business Manager**
   - Go to https://business.facebook.com/
   - Navigate to your WhatsApp Business Account

2. **Create New Flow**
   - Go to "Flows" section
   - Click "Create Flow"
   - Select "Custom Flow"

3. **Upload Flow JSON**
   - Copy the contents of `data_purchase_flow_config.json`
   - Paste it into the Flow JSON editor
   - Click "Validate" to check for errors
   - Click "Save" to create the flow

4. **Get Flow ID**
   - After saving, note down the Flow ID (e.g., `123456789012345`)
   - This will be used in your application

### Step 2: Update Application Configuration

Add the Flow ID to your environment variables:

```bash
# Add to your .env file
DATA_PURCHASE_FLOW_ID=your_flow_id_here
```

### Step 3: Update WhatsApp Service Configuration

The WhatsApp service has been updated to use the Flow ID and correct initial screen. The configuration is already in place:

```javascript
// In src/services/whatsapp.js, the sendDataPurchaseFlow method is configured as:
const flowData = {
  flowToken: await flowService.generateFlowToken({
    userId: userData.id,
    flowId: 'data_purchase',
    source: 'whatsapp',
    userPhone: phoneNumber
  }),
  flowId: process.env.DATA_PURCHASE_FLOW_ID,
  flowCta: 'Buy Data',
  initialScreen: 'NETWORK_SELECTION_SCREEN', // ✅ Correct initial screen
  header: {
    type: 'text',
    text: '📶 Buy Data'
  },
  body: 'Purchase data bundles for yourself or gift to friends and family. Select network, phone number, and plan.',
  footer: 'Secure payment via your MiiMii wallet'
};
```

### Step 4: Test the Flow

1. **Send Test Message**
   ```
   User: "buy data"
   Bot: Should send the data purchase flow
   ```

2. **Flow Steps**
   - Network Selection (MTN, Airtel, Glo, 9mobile)
   - Phone Number Input
   - Data Plan Selection
   - Confirmation
   - PIN Verification

3. **Expected Behavior**
   - User selects network
   - User enters phone number
   - User selects data plan
   - User confirms purchase
   - User enters PIN
   - System processes purchase via Bilal API
   - Receipt is sent via WhatsApp

### Step 5: Monitor and Debug

1. **Check Logs**
   - Monitor flow endpoint logs
   - Check Bilal service responses
   - Verify transaction processing

2. **Common Issues**
   - Flow ID not configured
   - Bilal API credentials missing
   - User wallet balance insufficient
   - Network validation failures

### Step 6: Production Deployment

1. **Environment Variables**
   ```bash
   DATA_PURCHASE_FLOW_ID=your_production_flow_id
   BILAL_BASE_URL=https://bilalsadasub.com/api
   BILAL_USERNAME=your_username
   BILAL_PASSWORD=your_password
   ```

2. **Testing Checklist**
   - [ ] Flow loads correctly
   - [ ] Network selection works
   - [ ] Phone validation works
   - [ ] Plan selection works
   - [ ] PIN verification works
   - [ ] Purchase processing works
   - [ ] Receipt generation works
   - [ ] Error handling works

## Troubleshooting

### Flow Not Loading
- Check Flow ID is correct
- Verify Flow is published in WhatsApp Business Manager
- Check WhatsApp API credentials

### "Specified screen is not allowed as first screen" Error
**Error**: `Specified screen PIN_VERIFICATION_SCREEN is not allowed as first screen of this flow. Allowed screen name is: NETWORK_SELECTION_SCREEN.`

**Solution**: 
- ✅ **FIXED**: The system now correctly starts with `NETWORK_SELECTION_SCREEN`
- Make sure your flow JSON starts with the correct screen
- Verify the `initialScreen` parameter is set correctly in the flow data

**Prevention**:
- Always ensure the `initialScreen` matches the first screen in your flow JSON
- Test flows in WhatsApp Business Manager before deploying

### Purchase Fails
- Check Bilal API credentials
- Verify user wallet balance
- Check network validation
- Monitor Bilal service logs

### Receipt Not Sent
- Check receipt service configuration
- Verify WhatsApp media upload permissions
- Check image generation service

## Support

If you encounter issues:
1. Check application logs
2. Verify all environment variables
3. Test Bilal API connectivity
4. Contact support with error details

# WhatsApp Flow Configuration Reference

## 📋 Files Created

1. **`pin_management_flow.json`** - Complete PIN verification flow with processing screen
2. **`simple_pin_flow.json`** - Simplified PIN verification flow (recommended for quick setup)
3. **`WHATSAPP_FLOW_SETUP_GUIDE.md`** - Detailed setup instructions

## 🚀 Quick Setup (Recommended)

### Step 1: Create Flow in WhatsApp Business Manager
1. Go to [business.facebook.com](https://business.facebook.com)
2. Navigate to **WhatsApp Manager** → **Flows**
3. Click **"Create Flow"** → **"Custom Flow"**
4. Copy and paste the contents of **`simple_pin_flow.json`**

### Step 2: Configure Flow Details
- **Flow Name**: `PIN Verification Flow`
- **Category**: `Security`
- **Description**: `PIN verification for transaction authorization`

### Step 3: Publish and Get Flow ID
1. **Save** the flow
2. **Publish** the flow
3. **Copy the Flow ID** (looks like: `1234567890123456`)

### Step 4: Update Environment Variables
Add the Flow ID to your environment configuration:

```bash
# In your .env file or environment variables
WHATSAPP_TRANSFER_PIN_FLOW_ID=YOUR_FLOW_ID_HERE
```

### Step 5: Restart Application
Restart your application to load the new Flow ID configuration.

## 🔧 Current Configuration Check

The system is already configured to use the Flow ID from:
```javascript
const flowId = config.getWhatsappConfig().transferPinFlowId;
```

Make sure this environment variable is set:
```bash
WHATSAPP_TRANSFER_PIN_FLOW_ID=your_flow_id_here
```

## 🧪 Test Commands

After setup, test these commands:

1. **"Enable my pin"** - Should open PIN verification flow
2. **"Disable my pin"** - Should open PIN verification flow
3. **"Buy 100 airtime to 07035437910 MTN"** - Should work without PIN when disabled
4. **"Buy 1GB data for MTN"** - Should work without PIN when disabled
5. **"Send 100 to John"** - Should work without PIN when disabled

## 📊 Expected Flow Data

The flow will send this data when completed:
```json
{
  "pin": "1234",
  "action": "enable_pin", // or "disable_pin"
  "user_id": "user-uuid-here",
  "phone_number": "+2349072874728"
}
```

## 🔍 Debug Information

If the flow doesn't work, check:
1. **Flow ID is set** in environment variables
2. **Flow is published** in WhatsApp Business Manager
3. **Application logs** for flow-related errors
4. **Webhook endpoints** are working

## 🎯 Next Steps

1. **Set up the flow** using the simple configuration
2. **Get the Flow ID** from WhatsApp Business Manager
3. **Update environment variables** with the Flow ID
4. **Restart application**
5. **Test the functionality**

The system is ready to handle PIN enable/disable once the Flow ID is configured! 🚀

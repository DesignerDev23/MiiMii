# Transfer PIN Verification Flow Setup Guide

## 🎯 **Overview**
This guide will help you set up the Transfer PIN Verification flow in your WhatsApp Flow Manager to replace manual PIN entry with an interactive flow.

## 📋 **What You Need to Do**

### **Step 1: Add Flow to WhatsApp Flow Manager**

1. **Go to your WhatsApp Flow Manager**
2. **Create a new flow** with the following details:
   - **Flow Name**: `Transfer PIN Verification`
   - **Flow ID**: `3207800556061780` (or your preferred ID)
   - **Description**: `Flow for verifying user PIN during bank transfers`

### **Step 2: Use the JSON Configuration**

Copy and paste this JSON configuration into your WhatsApp Flow Manager:

```json
{
  "version": "7.2",
  "data_api_version": "3.0",
  "routing_model": {
    "PIN_VERIFICATION_SCREEN": []
  },
  "screens": [
    {
      "id": "PIN_VERIFICATION_SCREEN",
      "title": "Transfer PIN Verification",
      "terminal": true,
      "success": true,
      "data": {},
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "transfer_pin_form",
            "children": [
              {
                "type": "TextHeading",
                "text": "Transfer PIN Verification"
              },
              {
                "type": "TextBody",
                "text": "Please enter your 4-digit PIN to complete the transfer."
              },
                             {
                 "type": "TextInput",
                 "required": true,
                 "label": "PIN",
                 "name": "pin",
                 "input-type": "passcode"
               },
              {
                "type": "Footer",
                "label": "Verify PIN",
                "on-click-action": {
                  "name": "data_exchange",
                  "payload": {
                    "pin": "${form.pin}"
                  }
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

### **Step 3: Set Environment Variable**

Add this to your Digital Ocean environment variables:

```bash
WHATSAPP_TRANSFER_PIN_FLOW_ID=3207800556061780
```

## 🔧 **What the Code Does**

### **Before (Manual PIN Entry):**
```javascript
// Old approach - manual PIN entry
await whatsappService.sendTextMessage(user.whatsappNumber, '🔐 Drop your 4-digit PIN');
```

### **After (WhatsApp Flow):**
```javascript
// New approach - WhatsApp Flow
await whatsappService.sendFlowMessage(
  user.whatsappNumber,
  {
    flowId: config.getWhatsappConfig().transferPinFlowId,
    flowToken: 'unused',
    header: { type: 'text', text: 'Transfer PIN Verification' },
    body: `Please enter your 4-digit PIN to complete the transfer of ₦${amount} to ${recipientName}.`,
    footer: 'Secure transfer verification',
    flowCta: 'Enter PIN'
  }
);
```

## 🎯 **Flow Features**

### **✅ PIN Verification Screen**
- **4-digit PIN input** with validation
- **Real-time validation** (exactly 4 digits)
- **Cancel option** to abort transfer
- **Dynamic content** showing transfer details

### **✅ Success Screen**
- **Confirmation message** when PIN is verified
- **Transfer processing** notification
- **Done button** to complete flow

### **✅ Cancelled Screen**
- **Cancellation message** if user cancels
- **Option to try again** later

## 🔄 **How It Works**

1. **User confirms transfer** → System sends transfer PIN flow
2. **User enters PIN** → Flow validates and submits
3. **PIN verification** → System processes transfer with PIN
4. **Success/Error** → User gets appropriate feedback

## 📊 **Benefits**

- 🎯 **Better UX**: Interactive flow instead of manual PIN entry
- 🔒 **More Secure**: WhatsApp's built-in security features
- 📱 **Mobile-Friendly**: Native WhatsApp interface
- ⚡ **Faster**: Streamlined verification process
- 📈 **Trackable**: Better analytics and monitoring

## 🧪 **Testing**

1. **Reset your login session** (if needed)
2. **Send a transfer request**: "Send 100 naira to 9072874728 Opay bank"
3. **Confirm the transfer**: Reply "YES"
4. **You should receive** the transfer PIN flow
5. **Enter your PIN** and complete the flow
6. **Transfer should process** normally

## 🔧 **Troubleshooting**

### **Flow Not Sending?**
- Check if `WHATSAPP_TRANSFER_PIN_FLOW_ID` is set correctly
- Verify the flow ID exists in your WhatsApp Flow Manager
- Check logs for any errors

### **PIN Not Processing?**
- Ensure the flow returns `pin` field in the response
- Check that the PIN validation is working
- Verify the transfer data is preserved in conversation state

### **Transfer Fails?**
- Check if the PIN is being extracted correctly from flow response
- Verify the bank transfer service is receiving the PIN
- Check logs for detailed error messages

## 📝 **Flow Response Format**

The flow should return data in this format:
```json
{
  "pin": "1234",
  "action": "submit_pin"
}
```

## 🎉 **You're All Set!**

Once you've added the flow to your WhatsApp Flow Manager and set the environment variable, the transfer PIN verification will automatically use the interactive flow instead of manual PIN entry!

The system will now provide a much better user experience with secure, interactive PIN verification during bank transfers.

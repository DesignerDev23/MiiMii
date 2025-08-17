# WhatsApp Flow Endpoint Setup Guide

## 🎯 **Overview**
This guide will help you set up the WhatsApp Flow endpoint configuration in WhatsApp Manager for the Transfer PIN Verification flow.

## 📋 **Step-by-Step Setup**

### **Step 1: Generate Keys**

First, run the key generation script:

```bash
node generate_flow_keys.js
```

This will:
- ✅ Generate RSA key pair (2048-bit)
- ✅ Save private key to `keys/flow_private_key.pem`
- ✅ Save public key to `keys/flow_public_key.pem`
- ✅ Display public key for copying

### **Step 2: Set Endpoint URI**

In WhatsApp Flow Manager, set the endpoint URI to:
```
https://api.chatmiimii.com/api/flow/endpoint
```

This is your existing working endpoint that's already configured and healthy.

### **Step 3: Add Phone Number**

Add your WhatsApp Business phone number that's connected to your Cloud API.

### **Step 4: Sign Public Key**

1. **Copy the public key** displayed by the script (or from `keys/flow_public_key_content.txt`)
2. **Paste it in WhatsApp Manager** in the "Public Key" field
3. **Save the configuration**

### **Step 5: Connect Meta App**

1. **Select your Meta App** from the dropdown
2. **Verify the connection** is successful
3. **Ensure permissions** are granted

### **Step 6: Health Check**

Test your endpoint with:

```bash
curl -X GET "https://api.chatmiimii.com/api/flow/endpoint"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-17T12:14:00.435Z",
  "version": "3.0",
  "encryption": {
    "enabled": true,
    "configured": true
  },
  "message": "Flow endpoint is available for WhatsApp Business Manager"
}
```

## 🔧 **Environment Variables**

Add these to your Digital Ocean environment variables:

```bash
# WhatsApp Flow Endpoint Configuration
FLOW_PRIVATE_KEY_PATH=/app/keys/flow_private_key.pem
FLOW_ENDPOINT_SECRET=your-endpoint-secret-here

# WhatsApp Flow IDs
WHATSAPP_TRANSFER_PIN_FLOW_ID=3207800556061780
```

## 🧪 **Testing the Setup**

### **Test 1: Health Check**
```bash
curl -X GET "https://api.chatmiimii.com/api/flow/endpoint"
```

### **Test 2: Send Transfer PIN Flow**
```bash
curl -X POST "https://your-app-domain.com/webhook/flows/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "2349072874728",
    "flowType": "transfer_pin",
    "transferData": {
      "amount": 1000,
      "recipientName": "John Doe",
      "bankName": "Opay Bank",
      "accountNumber": "9072874728"
    }
  }'
```

## 🔍 **Verification Checklist**

- [ ] **Keys generated** and saved securely
- [ ] **Public key uploaded** to WhatsApp Manager
- [ ] **Endpoint URI set** correctly
- [ ] **Phone number added** and verified
- [ ] **Meta app connected** with proper permissions
- [ ] **Health check passes** with 200 status
- [ ] **Environment variables** set in Digital Ocean
- [ ] **Flow ID configured** in your app

## 🚨 **Troubleshooting**

### **Health Check Fails**
- Check if your app is running
- Verify the endpoint URL is correct
- Check server logs for errors

### **Public Key Issues**
- Ensure the key is in PEM format
- Verify it's a 2048-bit RSA key
- Check for extra spaces or characters

### **Flow Not Sending**
- Verify the flow ID is correct
- Check if the flow is published in WhatsApp Manager
- Ensure the endpoint is properly configured

### **Authentication Errors**
- Verify the private key is accessible
- Check environment variables are set correctly
- Ensure the endpoint secret matches

## 📝 **Security Notes**

- 🔒 **Keep private key secure** - never share or commit to version control
- 🔑 **Use strong endpoint secrets** for additional security
- 🛡️ **Enable HTTPS** for all endpoint communications
- 📋 **Monitor logs** for any suspicious activity

## 🎉 **You're Ready!**

Once all steps are completed and verified:

1. **Your endpoint is configured** and ready to receive flow data
2. **Transfer PIN flow** will work with interactive PIN entry
3. **Users will get a better experience** with secure flow-based verification

## 📞 **Support**

If you encounter issues:
1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Verify all configuration steps are completed
4. Test with the provided curl commands

---

**Next Step:** Test the complete flow by sending a transfer request and confirming the PIN verification works with the new WhatsApp Flow! 🚀

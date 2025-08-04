# WhatsApp OAuth Token Issue - Diagnosis & Solution

## 🔍 **Issue Analysis**

Based on the error logs and testing, here are the two main issues identified:

### **1. OAuth Error Code 190 - "Invalid OAuth access token"**
**Root Cause:** Using placeholder Phone Number ID instead of actual WhatsApp Business Phone Number ID

**Current Configuration:**
- ✅ **Token is VALID** (confirmed by Graph API test)
- ❌ **Phone Number ID is FAKE** (`123456789012345`)
- ❌ **Business Account ID is FAKE** (`123456789012345`)

### **2. Onboarding Error - "message.trim is not a function"**
**Root Cause:** Code was expecting string but receiving object with text property
**Status:** ✅ **FIXED** - Updated onboarding service to handle message objects properly

---

## 🛠️ **Required Actions**

### **CRITICAL: Get Your Real WhatsApp Business IDs**

You need to replace the placeholder IDs with your actual WhatsApp Business configuration:

#### **Step 1: Find Your WhatsApp Phone Number ID**

1. Go to [Facebook Business Manager](https://business.facebook.com/)
2. Navigate to **Business Settings**
3. Click **WhatsApp** > **WhatsApp Business Accounts**
4. Select your WhatsApp Business Account
5. Click on **Phone Numbers** tab
6. Your **Phone Number ID** will be displayed (15-digit number)

#### **Step 2: Find Your WhatsApp Business Account ID (WABA ID)**

1. In the same WhatsApp Business Account section
2. Look for "Account ID" or "Business Account ID" 
3. Copy the 15-digit number

#### **Step 3: Update Environment Variables**

Replace these in your DigitalOcean environment variables:

```bash
# Replace with your ACTUAL IDs
WHATSAPP_PHONE_NUMBER_ID=your_actual_15_digit_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_actual_15_digit_business_account_id

# Your token is already correct
WHATSAPP_ACCESS_TOKEN=EAAXQZBHvBuxgBPN2hO6wDaC2TnX2W2Tq2QnjHEYW9r9qmoCzJBa0fEZBJp8XXpiZBeCx6xqalX5PJ1WrAqENxMAyq3LsuqkPEZBJ4fsPGKTKoHSoOC26hDBhzY68hwLDM0RzE5wNAlJS3bPUZAkRsj2khewZB7l1a7OGZAIrhzhaIlQ6WqZBr95RrQhKGiKwdTaVhX2mLbZCrHnlnk4Mv
```

---

## 🧪 **Testing Your Configuration**

After updating the IDs, test with this command:

```bash
curl -X GET \
  "https://graph.facebook.com/v18.0/YOUR_ACTUAL_PHONE_NUMBER_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Success Response:**
```json
{
  "verified_name": "Your Business Name",
  "display_name": "Your Business Name", 
  "id": "your_actual_phone_number_id",
  "status": "CONNECTED"
}
```

---

## 📋 **DigitalOcean Environment Setup**

### **Current .digitalocean/app.yaml Configuration:**
```yaml
env:
  - key: WHATSAPP_ACCESS_TOKEN
    value: ${WHATSAPP_ACCESS_TOKEN}  # ✅ Correct
  - key: WHATSAPP_PHONE_NUMBER_ID
    value: ${WHATSAPP_PHONE_NUMBER_ID}  # ❌ Update this
  - key: WHATSAPP_BUSINESS_ACCOUNT_ID
    value: ${WHATSAPP_BUSINESS_ACCOUNT_ID}  # ❌ Update this
```

### **Action Required:**
1. Go to your DigitalOcean App Platform
2. Navigate to **Settings** > **Environment Variables**
3. Update these variables with your real IDs:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
4. Redeploy your application

---

## 🔧 **Code Fixes Applied**

### **Fixed: Onboarding Service Message Handling**

**Files Updated:**
- `src/services/onboarding.js`

**Changes Made:**
```javascript
// Before (causing error):
const nameParts = message.trim().split(/\s+/);

// After (fixed):
const messageText = typeof message === 'string' ? message : (message?.text || '');
const nameParts = messageText.trim().split(/\s+/);
```

**Functions Fixed:**
- `handleNameCollection()` ✅
- `handlePinSetup()` ✅  
- `parseKycData()` ✅

---

## 🚀 **Deployment Steps**

1. **Update DigitalOcean Environment Variables** (CRITICAL)
2. **Redeploy Application**
3. **Test WhatsApp Webhook:**
   ```bash
   curl "https://your-app-url.ondigitalocean.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test"
   ```

4. **Send Test Message to Your WhatsApp Number**

---

## 📞 **Support Information**

**If you still encounter issues after updating the IDs:**

1. **Check Token Permissions:**
   - Ensure token has `whatsapp_business_messaging` permission
   - Verify token hasn't expired

2. **Verify Phone Number Status:**
   - Phone number must be "CONNECTED" status
   - Check in WhatsApp Manager

3. **Contact Meta Support:**
   - If phone number shows as disconnected
   - If token permissions are missing

---

## 🎯 **Quick Fix Summary**

**Immediate Actions:**
1. ✅ Code issues fixed (message.trim error)
2. ❌ **UPDATE YOUR PHONE NUMBER ID** (most critical)
3. ❌ **UPDATE YOUR BUSINESS ACCOUNT ID** 
4. ❌ **REDEPLOY APPLICATION**

Your WhatsApp access token is valid, but you're using test IDs instead of your real WhatsApp Business configuration. Once you update the IDs, your OAuth errors should disappear!

---

**Need the real IDs?** Go to [Facebook Business Manager](https://business.facebook.com/) → Business Settings → WhatsApp → Phone Numbers
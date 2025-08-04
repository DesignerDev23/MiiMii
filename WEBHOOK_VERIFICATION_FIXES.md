# WhatsApp Webhook Verification Fix Guide

## 🚨 Current Issue
Your WhatsApp webhook is returning `403 Forbidden` when Meta tries to verify it. This means the verify token comparison is failing.

## 🔍 Issue Analysis
After testing your webhook endpoint:
```bash
curl -X GET "https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"
# Returns: 403 Forbidden
```

## ✅ Solution Steps

### Step 1: Update DigitalOcean Environment Variables
1. **Go to**: [DigitalOcean App Platform Dashboard](https://cloud.digitalocean.com/apps)
2. **Select**: Your MiiMii application (miimii-app-p8gzu)
3. **Go to**: Settings → App-level environment variables
4. **Find**: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
5. **Update value to**: `Verify_MiiMii` (exactly this, case-sensitive)
6. **Save changes**

### Step 2: Force Redeploy
After updating the environment variable:
1. **Go to**: Deployments tab
2. **Click**: "Create Deployment"
3. **Wait**: 5-10 minutes for deployment to complete

### Step 3: Verify Fix
Test the webhook after deployment:
```bash
curl -X GET "https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"
# Should return: test123
```

### Step 4: Configure Meta Developer Console
Once verification works:
1. **Go to**: https://developers.facebook.com/
2. **Navigate to**: Your WhatsApp Business App
3. **Go to**: WhatsApp → Configuration
4. **Set Webhook URL**: `https://api.chatmiimii.com/webhook/whatsapp`
5. **Set Verify Token**: `Verify_MiiMii`
6. **Subscribe to**: `messages` and `message_deliveries`
7. **Click**: "Verify and Save"

## 🔧 Alternative Quick Fix (If Above Doesn't Work)

If the environment variable update doesn't work, you can temporarily hardcode the token:

### Option A: Update WhatsApp Service
Edit `src/services/whatsapp.js` to temporarily hardcode the token:

```javascript
// In constructor, temporarily replace:
this.verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
// With:
this.verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'Verify_MiiMii';
```

### Option B: Update Webhook Route
Edit `src/routes/webhook.js` to add logging and fallback:

```javascript
// In the GET /whatsapp route, add logging:
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Webhook verification attempt:', { mode, token, challenge });
  console.log('Expected token:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  
  const result = whatsappService.verifyWebhook(mode, token, challenge);
  
  if (result) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});
```

## 🧪 Testing Commands

### Test webhook verification:
```bash
curl -X GET "https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123"
```

### Test webhook message (once verified):
```bash
curl -X POST https://api.chatmiimii.com/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "test",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "1234567890",
            "phone_number_id": "test_phone_id"
          },
          "messages": [{
            "id": "test_message_id",
            "from": "1234567890",
            "timestamp": "1640995200",
            "text": {
              "body": "Hello MiiMii!"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

## 🎯 Expected Results

After successful fix:
- Webhook verification should return the challenge value
- Meta Developer Console should show "Webhook verified successfully"
- You can subscribe to webhook events
- WhatsApp messages will be received and processed

## 📋 Checklist

- [ ] DigitalOcean environment variable updated to `Verify_MiiMii`
- [ ] App redeployed successfully
- [ ] Webhook verification test passes (returns challenge)
- [ ] Meta Developer Console webhook configured
- [ ] Webhook events subscribed (messages, message_deliveries)
- [ ] Test message sent and received

## 🆘 If Still Not Working

If the issue persists:
1. Check DigitalOcean deployment logs for any errors
2. Verify the environment variable is actually set in the running container
3. Try the hardcoded fallback approach
4. Contact DigitalOcean support if environment variables aren't being applied

The most common cause is that DigitalOcean environment variables take a full redeployment to take effect, not just a restart.
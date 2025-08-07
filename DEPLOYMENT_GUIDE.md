# 🚀 MiiMii Deployment Guide

## ✅ **FIXES IMPLEMENTED**

### **1. Critical Webhook Parsing Fix**
- ✅ **Fixed**: `Cannot read properties of undefined` error in webhook processing
- ✅ **Added**: Proper null checks and error handling in `parseWebhookMessage()`
- ✅ **Improved**: Webhook route with better error handling and logging

### **2. Fincra BVN Implementation**
- ✅ **Updated**: Correct endpoint `/core/bvn-verification` as per [official documentation](https://docs.fincra.com/docs/bvn-resolution-1.md)
- ✅ **Fixed**: Payload structure with `bvn` and `business` parameters
- ✅ **Added**: Proper error handling and activity logging
- ✅ **Added**: Environment variable `FINCRA_BUSINESS_ID` to config

### **3. BellBank Virtual Account Implementation**
- ✅ **Updated**: Correct endpoint `/v1/account/clients/individual` as per [official documentation](https://docs.bellmfb.com/references/virtual-accounts/create-client-individual.md)
- ✅ **Fixed**: Payload structure and authentication
- ✅ **Added**: Proper error handling and activity logging

### **4. Bilal Services Implementation**
- ✅ **Updated**: Authentication using Basic Auth as per [official documentation](https://bilalsadasub.com/api/user)
- ✅ **Fixed**: Airtime purchase endpoint `/topup` with correct payload
- ✅ **Fixed**: Data purchase endpoint `/data` with correct payload
- ✅ **Added**: Network ID detection for Nigerian phone numbers
- ✅ **Added**: Proper error handling and activity logging

### **5. WhatsApp Flow Integration**
- ✅ **Added**: `processFlowCompletion()` method to handle Flow webhooks
- ✅ **Fixed**: Flow data parsing with proper null checks
- ✅ **Added**: Flow completion message handling

## 🔧 **ENVIRONMENT VARIABLES REQUIRED**

### **Digital Ocean App Platform Variables**

```env
# WhatsApp Business API
BOT_ACCESS_TOKEN=your_whatsapp_access_token
BOT_PHONE_NUMBER_ID=your_phone_number_id
BOT_BUSINESS_ACCOUNT_ID=your_business_account_id
BOT_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_ONBOARDING_FLOW_ID=your_onboarding_flow_id
WHATSAPP_LOGIN_FLOW_ID=your_login_flow_id

# BellBank API
BANK_CONSUMER_KEY=your_bellbank_consumer_key
BANK_CONSUMER_SECRET=your_bellbank_consumer_secret
BELLBANK_WEBHOOK_SECRET=your_bellbank_webhook_secret

# Bilal Services
BILAL_USERNAME=your_bilal_username
BILAL_PASSWORD=your_bilal_password
BILAL_WEBHOOK_SECRET=your_bilal_webhook_secret

# Fincra BVN Verification
FINCRA_API_KEY=your_fincra_api_key
FINCRA_SECRET_KEY=your_fincra_secret_key
FINCRA_BUSINESS_ID=your_fincra_business_id

# OpenAI AI/NLP
AI_API_KEY=your_openai_api_key
AI_MODEL=gpt-4-turbo

# Database
DB_CONNECTION_URL=your_postgresql_connection_url
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Server Configuration
NODE_ENV=production
PORT=3000
APP_SECRET=your_jwt_secret
JWT_EXPIRES_IN=30d
WEBHOOK_SECRET=your_webhook_secret

# Admin Dashboard
ADMIN_EMAIL=admin@miimii.com
ADMIN_PASSWORD=your_admin_password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/

# Redis (Optional)
REDIS_URL=your_redis_url
```

## 🧪 **TESTING THE IMPLEMENTATIONS**

### **Run the Test Suite**
```bash
node test_implementations.js
```

This will test:
- ✅ Fincra BVN resolution
- ✅ BellBank virtual account creation
- ✅ Bilal airtime purchase
- ✅ Bilal data purchase
- ✅ Bilal balance check

### **Manual Testing**

#### **1. Test WhatsApp Webhook**
```bash
curl -X POST https://your-domain.com/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "id": "test_message_id",
            "from": "2348012345678",
            "text": {
              "body": "Hi"
            }
          }],
          "contacts": [{
            "profile": {
              "name": "Test User"
            }
          }]
        }
      }]
    }]
  }'
```

#### **2. Test Fincra BVN**
```bash
curl -X POST https://your-domain.com/api/kyc/verify-bvn \
  -H "Content-Type: application/json" \
  -d '{
    "bvn": "12345678901"
  }'
```

#### **3. Test BellBank Virtual Account**
```bash
curl -X POST https://api.chatmiimii.com/api/wallet/create-virtual-account \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "08012345678",
    "bvn": "12345678901",
    "gender": "male",
    "dateOfBirth": "1990-01-01"
  }'
```

## 📋 **DEPLOYMENT CHECKLIST**

### **Pre-Deployment**
- [ ] All environment variables set in Digital Ocean
- [ ] Database migrations run successfully
- [ ] All API keys and secrets configured
- [ ] WhatsApp webhook URL configured
- [ ] SSL certificate installed

### **Post-Deployment**
- [ ] Run test suite: `node test_implementations.js`
- [ ] Test WhatsApp webhook with sample message
- [ ] Test Fincra BVN verification
- [ ] Test BellBank virtual account creation
- [ ] Test Bilal airtime/data purchase
- [ ] Monitor logs for any errors

### **Monitoring**
- [ ] Check application logs in Digital Ocean
- [ ] Monitor webhook delivery status
- [ ] Verify database connections
- [ ] Test external API integrations

## 🚨 **TROUBLESHOOTING**

### **Common Issues**

#### **1. Webhook Parsing Errors**
```javascript
// Check webhook logs
logger.info('Webhook body:', JSON.stringify(req.body));
```

#### **2. Fincra BVN Errors**
- Verify `FINCRA_BUSINESS_ID` is set
- Check API key permissions
- Ensure BVN format is 11 digits

#### **3. BellBank Virtual Account Errors**
- Verify consumer key/secret
- Check token generation
- Ensure all required fields provided

#### **4. Bilal Service Errors**
- Verify username/password
- Check token generation
- Ensure network ID detection works

### **Debug Commands**

```bash
# Check environment variables
node -e "console.log(process.env.FINCRA_BUSINESS_ID)"

# Test database connection
node src/database/connection.js

# Test external APIs
node test_implementations.js

# Monitor logs
tail -f monitoring_log.txt
```

## 📊 **PERFORMANCE MONITORING**

### **Key Metrics to Monitor**
- Webhook response times
- External API call success rates
- Database connection stability
- Memory usage
- Error rates by service

### **Log Analysis**
```bash
# Check for errors
grep "ERROR" monitoring_log.txt

# Check webhook processing
grep "webhook" monitoring_log.txt

# Check API calls
grep "API request" monitoring_log.txt
```

## 🎯 **NEXT STEPS**

1. **Deploy to Production**: Use Digital Ocean App Platform
2. **Configure Webhooks**: Set up webhook URLs in WhatsApp, BellBank, Bilal
3. **Test End-to-End**: Complete user journey testing
4. **Monitor Performance**: Set up monitoring and alerting
5. **Scale as Needed**: Monitor usage and scale resources

## 📞 **SUPPORT**

If you encounter issues:
1. Check the logs in Digital Ocean
2. Run the test suite
3. Verify environment variables
4. Test individual API endpoints
5. Contact support with specific error messages

---

**Status**: ✅ **READY FOR PRODUCTION DEPLOYMENT**

All critical issues have been fixed and implementations updated according to official documentation. The system is now ready for production deployment.


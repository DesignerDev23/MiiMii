# 🧪 MiiMii API Testing Guide

This guide provides step-by-step instructions for testing each API integration to ensure everything works correctly with the actual service providers.

## 📋 Prerequisites

Before testing, ensure you have:
- [ ] All API credentials configured in `.env`
- [ ] Application running (`npm start` or `npm run dev`)
- [ ] Postman or curl for API testing
- [ ] Valid test data (phone numbers, account numbers, etc.)

---

## 🏦 BellBank API Testing

### 1. Test Token Generation

```bash
curl -X POST https://sandbox-baas-api.bellmfb.com/v1/generate-token \
  -H "Content-Type: application/json" \
  -H "consumerKey: YOUR_CONSUMER_KEY" \
  -H "consumerSecret: YOUR_CONSUMER_SECRET" \
  -H "validityTime: 2880"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Token generated successfully",
  "token": "eyJhbGciOiJIUz9..."
}
```

### 2. Test Bank List Retrieval

```bash
curl -X GET https://sandbox-baas-api.bellmfb.com/v1/transfer/banks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Test Account Name Enquiry

```bash
curl -X POST https://sandbox-baas-api.bellmfb.com/v1/transfer/name-enquiry \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bankCode": "010",
    "accountNumber": "1001011000"
  }'
```

### 4. Test Virtual Account Creation

```bash
curl -X POST https://sandbox-baas-api.bellmfb.com/v1/account/clients/individual \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstname": "Test",
    "lastname": "User",
    "middlename": "",
    "phoneNumber": "08012345678",
    "address": "123 Test Street",
    "bvn": "12345678901",
    "gender": "male",
    "dateOfBirth": "1990/01/01",
    "metadata": {}
  }'
```

### 5. Test Bank Transfer

```bash
curl -X POST https://sandbox-baas-api.bellmfb.com/v1/transfer \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "beneficiaryBankCode": "010",
    "beneficiaryAccountNumber": "1001011000",
    "narration": "Test transfer",
    "amount": 100,
    "reference": "MIIMII_TEST_123456",
    "senderName": "Test Sender"
  }'
```

### 6. Test Transaction Status Query

```bash
curl -X GET https://sandbox-baas-api.bellmfb.com/v1/transactions/reference/MIIMII_TEST_123456 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 📱 WhatsApp Business API Testing

### 1. Test Webhook Verification

```bash
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=YOUR_VERIFY_TOKEN"
```

### 2. Test Send Message

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "2348012345678",
    "message": "Hello from MiiMii! This is a test message."
  }'
```

### 3. Test Media Download

```bash
curl -X GET http://localhost:3000/api/whatsapp/media/MEDIA_ID \
  -H "Content-Type: application/json"
```

---

## 🤖 AI Service Testing

### 1. Test Intent Analysis

```bash
curl -X POST http://localhost:3000/test/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Send 5000 naira to John on 08012345678",
    "userContext": {
      "userId": "test-user-123",
      "phoneNumber": "08087654321"
    }
  }'
```

### 2. Test Voice Transcription

```bash
curl -X POST http://localhost:3000/test/transcription \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@test-audio.ogg"
```

### 3. Test OCR Processing

```bash
curl -X POST http://localhost:3000/test/ocr \
  -H "Content-Type: multipart/form-data" \
  -F "image=@test-id-card.jpg"
```

---

## 💰 Wallet and Transaction Testing

### 1. Test Wallet Balance

```bash
curl -X GET http://localhost:3000/api/wallet/balance/08012345678 \
  -H "Content-Type: application/json"
```

### 2. Test Manual Credit

```bash
curl -X POST http://localhost:3000/api/wallet/credit \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "08012345678",
    "amount": 1000,
    "description": "Test credit"
  }'
```

### 3. Test Transfer

```bash
curl -X POST http://localhost:3000/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "08012345678",
    "recipientPhone": "08087654321",
    "amount": 500,
    "description": "Test transfer",
    "pin": "1234"
  }'
```

### 4. Test Transaction History

```bash
curl -X GET http://localhost:3000/api/wallet/transactions/08012345678 \
  -H "Content-Type: application/json"
```

---

## 🔐 Dojah KYC Testing

### 1. Test BVN Basic Validation

```bash
curl -X GET "https://sandbox.dojah.io/api/v1/kyc/bvn?bvn=22222222222" \
  -H "AppId: YOUR_APP_ID" \
  -H "Authorization: YOUR_SECRET_KEY" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "entity": {
    "bvn": {
      "value": "22222222222",
      "status": true
    }
  }
}
```

### 2. Test BVN Validation with Name and DOB Matching

```bash
curl -X GET "https://sandbox.dojah.io/api/v1/kyc/bvn?bvn=22222222222&first_name=John&last_name=Doe&dob=1990-01-01" \
  -H "AppId: YOUR_APP_ID" \
  -H "Authorization: YOUR_SECRET_KEY" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "entity": {
    "bvn": {
      "value": "22222222222",
      "status": true
    },
    "first_name": {
      "confidence_value": 100,
      "status": true
    },
    "last_name": {
      "confidence_value": 95,
      "status": true
    },
    "dob": {
      "confidence_value": 100,
      "status": true
    }
  }
}
```

### 3. Test BVN Validation Error Response

```bash
curl -X GET "https://sandbox.dojah.io/api/v1/kyc/bvn?bvn=12345678901" \
  -H "AppId: YOUR_APP_ID" \
  -H "Authorization: YOUR_SECRET_KEY" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "error": "BVN not found"
}
```

### 4. Test KYC Initiation via MiiMii API

```bash
curl -X POST http://localhost:3000/api/kyc/start \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "08012345678",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01",
    "gender": "male",
    "address": "123 Main Street, Lagos",
    "bvn": "22222222222",
    "nin": "70123456789"
  }'
```

### 5. Test BVN Verification via MiiMii API

```bash
curl -X POST http://localhost:3000/api/kyc/verify-bvn \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "08012345678",
    "bvn": "22222222222"
  }'
```

### 6. Test Document Submission

```bash
curl -X POST http://localhost:3000/api/kyc/submit-documents \
  -H "Content-Type: multipart/form-data" \
  -F "phoneNumber=08012345678" \
  -F "documentType=drivers_license" \
  -F "document=@drivers-license.jpg"
```

### 7. Test KYC Service Directly

```bash
# Test BVN basic lookup
curl -X POST http://localhost:3000/test/kyc/bvn \
  -H "Content-Type: application/json" \
  -d '{"bvn": "22222222222"}'

# Test BVN validation with matching
curl -X POST http://localhost:3000/test/kyc/bvn-validate \
  -H "Content-Type: application/json" \
  -d '{
    "bvn": "22222222222",
    "firstName": "John",
    "lastName": "Doe", 
    "dateOfBirth": "1990-01-01"
  }'
```

---

## 📊 Admin Dashboard Testing

### 1. Test Dashboard Overview

```bash
curl -X GET http://localhost:3000/api/admin/dashboard \
  -H "Content-Type: application/json"
```

### 2. Test User Management

```bash
# List users
curl -X GET http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json"

# Ban user
curl -X POST http://localhost:3000/api/admin/users/USER_ID/ban \
  -H "Content-Type: application/json" \
  -d '{"reason": "Suspicious activity"}'
```

### 3. Test Transaction Monitoring

```bash
curl -X GET "http://localhost:3000/api/admin/transactions?status=pending&limit=10" \
  -H "Content-Type: application/json"
```

---

## 🌐 Webhook Testing

### 1. Test BellBank Webhook

```bash
curl -X POST http://localhost:3000/webhook/bellbank \
  -H "Content-Type: application/json" \
  -d '{
    "event": "collection",
    "reference": "MIIMII_TEST_123456",
    "virtualAccount": "0000000033",
    "externalReference": "24053014560933057683",
    "amountReceived": "1000.0",
    "transactionFee": 20,
    "netAmount": 980,
    "stampDuty": 0,
    "sessionId": "999999999900124053015311246476926",
    "sourceCurrency": "NGN",
    "sourceAccountNumber": "0123456789",
    "sourceAccountName": "John Doe",
    "sourceBankCode": "0001",
    "sourceBankName": "Test Bank",
    "remarks": "Testing",
    "destinationCurrency": "NGN",
    "status": "successful",
    "createdAt": 1717079472957,
    "updatedAt": 1717079473518
  }'
```

### 2. Test WhatsApp Webhook

```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "id": "wamid.test123",
            "from": "2348012345678",
            "timestamp": "1640995200",
            "type": "text",
            "text": {
              "body": "What is my balance?"
            }
          }]
        }
      }]
    }]
  }'
```

---

## 🔍 End-to-End Testing Scenarios

### Scenario 1: New User Onboarding
1. User sends first WhatsApp message
2. User gets welcome message and KYC prompt
3. User completes KYC process
4. Virtual account is created
5. User receives account details

### Scenario 2: Money Transfer (MiiMii to MiiMii)
1. User sends "Send 1000 to John 08087654321"
2. AI recognizes transfer intent
3. System validates recipient exists
4. Transfer is executed instantly (free)
5. Both parties receive notifications

### Scenario 3: Bank Transfer
1. User sends "Send 5000 to GTBank 0123456789"
2. AI recognizes bank transfer intent
3. System validates account via BellBank
4. Fees are calculated and displayed
5. User confirms with PIN
6. Transfer is initiated via BellBank
7. Status updates via webhook

### Scenario 4: Bill Payment
1. User sends "Pay PHCN bill 1234567890 amount 3000"
2. AI recognizes utility payment intent
3. System validates meter number via Bilal
4. Payment is processed
5. User receives confirmation

### Scenario 5: Voice Message Processing
1. User sends voice note saying "What's my balance?"
2. Audio is transcribed via Google Speech
3. AI processes transcribed text
4. Balance is retrieved and sent back

### Scenario 6: Image Processing for KYC
1. User sends ID card image during KYC
2. OCR extracts text from image
3. Data is validated against BVN
4. KYC status is updated

---

## ⚠️ Common Issues and Solutions

### BellBank Issues
- **Token Expired**: Regenerate token (handled automatically)
- **Invalid Account**: Check bank code format (6 digits)
- **Transfer Failed**: Check account validation first

### WhatsApp Issues
- **Webhook Not Received**: Check URL accessibility and verification token
- **Message Not Sent**: Verify phone number format (+234...)
- **Media Download Failed**: Check access token permissions

### AI/NLP Issues
- **Intent Not Recognized**: Check OpenAI API key and model
- **Poor Transcription**: Ensure audio quality and supported format
- **OCR Errors**: Use clear, well-lit images

### Database Issues
- **Connection Failed**: Check DATABASE_URL format
- **Migration Errors**: Run `npm run migrate` manually
- **Duplicate Entries**: Check unique constraints

---

## 📈 Performance Testing

### Load Testing

```bash
# Test concurrent users
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/wallet/balance/0801234567$i &
done
wait

# Test message processing load
for i in {1..50}; do
  curl -X POST http://localhost:3000/webhook/whatsapp \
    -H "Content-Type: application/json" \
    -d '{"entry":[{"changes":[{"value":{"messages":[{"id":"test'$i'","from":"2348012345678","timestamp":"1640995200","type":"text","text":{"body":"balance"}}]}}]}]}' &
done
wait
```

### Memory and CPU Monitoring

```bash
# Monitor application performance
top -p $(pgrep -f "node.*app.js")

# Check memory usage
ps aux | grep node

# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health
```

---

## ✅ Testing Checklist

### Pre-Production
- [ ] All API integrations tested with sandbox/test credentials
- [ ] Webhook endpoints verified and responding correctly
- [ ] Database migrations completed successfully
- [ ] Environment variables configured properly
- [ ] SSL certificates installed (for production)
- [ ] Rate limiting configured and tested
- [ ] Error handling tested with invalid inputs
- [ ] File upload limits tested
- [ ] Logging working correctly
- [ ] Admin dashboard accessible

### Production Readiness
- [ ] All test credentials replaced with production keys
- [ ] Webhook URLs updated to production domain
- [ ] Database backups configured
- [ ] Monitoring and alerting set up
- [ ] Performance benchmarks established
- [ ] Security headers configured
- [ ] CORS settings reviewed
- [ ] Rate limits appropriate for expected load

---

**🎯 Testing Best Practices:**
1. Always test with valid Nigerian phone numbers
2. Use realistic test amounts (₦100 - ₦50,000)
3. Test error scenarios (insufficient funds, invalid accounts)
4. Verify webhook processing with actual external calls
5. Test concurrent operations for race conditions
6. Monitor logs during testing for errors
7. Test rollback scenarios for failed transactions

This comprehensive testing guide ensures your MiiMii platform works correctly with all integrated services before going live! 🚀
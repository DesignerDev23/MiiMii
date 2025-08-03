# 🚀 MiiMii API Testing Guide with Postman

This comprehensive guide will walk you through testing all MiiMii API endpoints using Postman, including complete user account creation workflows.

## 📦 Getting Started

### 1. Import the Postman Collection

1. **Download the Collection**: Get the `postman_collection.json` file from your project
2. **Import to Postman**: 
   - Open Postman
   - Click "Import" 
   - Select the `postman_collection.json` file
   - Click "Import"

### 2. Set Up Environment Variables

Create a new environment in Postman with these variables:

```json
{
  "baseUrl": "https://miimii-app-p8gzu.ondigitalocean.app",
  "testPhone": "08123456789",
  "testPin": "1234",
  "recipientPhone": "08087654321",
  "testBvn": "12345678901",
  "transactionRef": ""
}
```

**Important**: Change `testPhone` to a valid Nigerian phone number for testing.

---

## 🎯 Quick Start: Complete User Onboarding

Follow this step-by-step workflow to create a complete user account and test core functionality:

### Step 1: Health Check ✅
- **Endpoint**: `GET /health`
- **Purpose**: Verify the API is running
- **Expected Response**: `200 OK` with health status

### Step 2: Register New User 👤
- **Endpoint**: `POST /api/users/register`
- **Purpose**: Create a new user account
- **Body**:
```json
{
  "phoneNumber": "{{testPhone}}",
  "firstName": "John",
  "lastName": "Doe"
}
```
- **Expected Response**: User object with wallet information

### Step 3: Set Transaction PIN 🔒
- **Endpoint**: `POST /api/users/set-pin`
- **Purpose**: Set 4-digit PIN for transactions
- **Body**:
```json
{
  "phoneNumber": "{{testPhone}}",
  "pin": "{{testPin}}",
  "confirmPin": "{{testPin}}"
}
```
- **Note**: Required before making any purchases or transfers

### Step 4: Update Profile Information 📝
- **Endpoint**: `PUT /api/users/profile/{{testPhone}}`
- **Purpose**: Complete user profile
- **Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "address": "123 Main Street, Lagos, Nigeria"
}
```

### Step 5: Start KYC Process 📋
- **Endpoint**: `POST /api/users/kyc/start`
- **Purpose**: Submit KYC information for verification
- **Body**:
```json
{
  "phoneNumber": "{{testPhone}}",
  "firstName": "John",
  "lastName": "Doe",
  "middleName": "Smith",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "address": "123 Main Street, Lagos, Nigeria",
  "bvn": "{{testBvn}}"
}
```

### Step 6: Check Onboarding Status 📊
- **Endpoint**: `GET /api/users/onboarding/{{testPhone}}`
- **Purpose**: Check onboarding progress
- **Expected**: Progress percentage and next steps

### Step 7: Fund Wallet (Admin) 💰
- **Endpoint**: `POST /api/wallet/credit`
- **Purpose**: Add money to wallet for testing
- **Body**:
```json
{
  "phoneNumber": "{{testPhone}}",
  "amount": 10000,
  "description": "Initial wallet funding for testing",
  "adminNote": "Test account setup funding"
}
```
- **Note**: This is an admin function for testing

### Step 8: Check Wallet Balance 💳
- **Endpoint**: `GET /api/wallet/balance/{{testPhone}}`
- **Purpose**: Verify wallet has been funded
- **Expected**: Balance of ₦10,000

### Step 9: Test Data Purchase 📱
- **Endpoint**: `POST /api/data/purchase`
- **Purpose**: Test purchasing data
- **Body**:
```json
{
  "phoneNumber": "{{testPhone}}",
  "network": "mtn",
  "planId": "mtn-1gb-300",
  "pin": "{{testPin}}",
  "userPhone": "{{testPhone}}"
}
```

### Step 10: Check Transaction History 📜
- **Endpoint**: `GET /api/wallet/transactions/{{testPhone}}`
- **Purpose**: Review all transactions
- **Expected**: List of transactions including wallet credit and data purchase

---

## 📱 Testing Data Services

### Get Available Networks
```http
GET /api/data/networks
```
**Expected Response**: List of MTN, Airtel, Glo, 9mobile

### Get Data Plans
```http
GET /api/data/plans/mtn
```
**Expected Response**: MTN data plans with prices and sizes

### Detect Network from Phone Number
```http
POST /api/data/detect-network
Content-Type: application/json

{
  "phoneNumber": "08031234567"
}
```

### Purchase Data for Another Number
```http
POST /api/data/purchase
Content-Type: application/json

{
  "phoneNumber": "08031234567",
  "network": "mtn",
  "planId": "mtn-1gb-300",
  "pin": "{{testPin}}",
  "userPhone": "{{testPhone}}"
}
```

---

## 📞 Testing Airtime Services

### Get Airtime Limits
```http
GET /api/airtime/limits
```

### Purchase Airtime
```http
POST /api/airtime/purchase
Content-Type: application/json

{
  "phoneNumber": "08031234567",
  "network": "mtn",
  "amount": 1000,
  "pin": "{{testPin}}",
  "userPhone": "{{testPhone}}"
}
```

### Get Purchase History
```http
GET /api/airtime/history/{{testPhone}}?limit=10&offset=0
```

---

## ⚡ Testing Utility Bills

### Get Utility Categories
```http
GET /api/utility/categories
```

### Get Electricity Providers
```http
GET /api/utility/providers/electricity
```

### Validate Customer
```http
POST /api/utility/validate-customer
Content-Type: application/json

{
  "category": "electricity",
  "provider": "ikedc",
  "customerNumber": "12345678901"
}
```

### Pay Electricity Bill
```http
POST /api/utility/pay
Content-Type: application/json

{
  "userPhone": "{{testPhone}}",
  "category": "electricity",
  "provider": "ikedc",
  "customerNumber": "12345678901",
  "amount": 5000,
  "pin": "{{testPin}}"
}
```

### Pay Cable TV Subscription
```http
POST /api/utility/pay
Content-Type: application/json

{
  "userPhone": "{{testPhone}}",
  "category": "cable",
  "provider": "dstv",
  "customerNumber": "1234567890",
  "amount": 5300,
  "pin": "{{testPin}}",
  "planId": "dstv-confam"
}
```

---

## 💸 Testing Money Transfers

### Transfer Between MiiMii Users
```http
POST /api/transactions/transfer
Content-Type: application/json

{
  "senderPhone": "{{testPhone}}",
  "recipientPhone": "{{recipientPhone}}",
  "amount": 1000,
  "description": "Test transfer between users",
  "pin": "{{testPin}}"
}
```

### Check Transaction Status
```http
GET /api/transactions/{{transactionRef}}
```

---

## 💬 Testing WhatsApp Integration

### Send WhatsApp Message
```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
  "to": "{{testPhone}}",
  "message": "Hello from MiiMii! Your account is now active.",
  "type": "text"
}
```

### Process Incoming Message
```http
POST /api/whatsapp/process-message
Content-Type: application/json

{
  "from": "{{testPhone}}",
  "message": "balance",
  "messageId": "msg_123456"
}
```

---

## 🔧 Testing Admin Operations

### Get Dashboard Statistics
```http
GET /api/admin/dashboard/stats
```

### Get All Users
```http
GET /api/admin/users?page=1&limit=20
```

### Search Users
```http
GET /api/users/search?q=john&limit=10
```

---

## 🧪 Advanced Testing Scenarios

### Scenario 1: Complete User Journey
1. Register user
2. Set PIN
3. Complete profile
4. Start KYC
5. Fund wallet
6. Purchase data
7. Purchase airtime
8. Pay electricity bill
9. Transfer money to friend
10. Check transaction history

### Scenario 2: Error Testing
Test these error scenarios to ensure proper error handling:

#### Insufficient Funds
```http
POST /api/data/purchase
Content-Type: application/json

{
  "phoneNumber": "{{testPhone}}",
  "network": "mtn",
  "planId": "mtn-1gb-300",
  "pin": "{{testPin}}",
  "userPhone": "{{testPhone}}"
}
```
*Test this when wallet balance is less than ₦300*

#### Wrong PIN
```http
POST /api/data/purchase
Content-Type: application/json

{
  "phoneNumber": "{{testPhone}}",
  "network": "mtn", 
  "planId": "mtn-1gb-300",
  "pin": "0000",
  "userPhone": "{{testPhone}}"
}
```

#### Invalid Phone Number
```http
POST /api/data/detect-network
Content-Type: application/json

{
  "phoneNumber": "123456789"
}
```

### Scenario 3: Load Testing
Run multiple requests simultaneously to test system performance:
- Create 10 users with different phone numbers
- Have each user perform transactions
- Monitor response times and error rates

---

## 📊 Expected Responses and Status Codes

### Success Responses
- **200 OK**: Successful GET requests
- **201 Created**: Successful user registration
- **200 OK**: Successful transactions

### Error Responses
- **400 Bad Request**: Invalid input data
- **401 Unauthorized**: Wrong PIN
- **404 Not Found**: User or resource not found
- **422 Unprocessable Entity**: Validation errors
- **500 Internal Server Error**: Server errors

### Sample Success Response
```json
{
  "success": true,
  "message": "Data purchase successful",
  "data": {
    "transaction": {
      "reference": "TXN123456789",
      "amount": 300,
      "phoneNumber": "08031234567",
      "network": "mtn",
      "status": "completed"
    }
  }
}
```

### Sample Error Response
```json
{
  "errors": [
    {
      "field": "phoneNumber",
      "message": "Invalid phone number format"
    }
  ]
}
```

---

## 🔍 Testing Checklist

### Basic Functionality ✅
- [ ] Health check responds
- [ ] User registration works
- [ ] PIN setup successful
- [ ] Profile update works
- [ ] KYC submission successful
- [ ] Wallet funding works
- [ ] Balance retrieval accurate

### Data Services ✅
- [ ] Networks list retrieved
- [ ] Data plans loaded
- [ ] Network detection works
- [ ] Data purchase successful
- [ ] Purchase history accurate

### Airtime Services ✅
- [ ] Airtime limits retrieved
- [ ] Airtime purchase successful
- [ ] Amount validation works
- [ ] Recent recipients loaded

### Utility Services ✅
- [ ] Categories retrieved
- [ ] Providers loaded
- [ ] Customer validation works
- [ ] Bill payment successful
- [ ] Fee estimation accurate

### Transaction Management ✅
- [ ] Money transfer works
- [ ] Transaction lookup successful
- [ ] Transaction filtering works
- [ ] Statistics generated

### WhatsApp Integration ✅
- [ ] Message sending works
- [ ] Message processing works
- [ ] AI intent recognition works

### Admin Functions ✅
- [ ] Dashboard stats loaded
- [ ] User management works
- [ ] Search functionality works

### Error Handling ✅
- [ ] Invalid input handled
- [ ] Insufficient funds detected
- [ ] Wrong PIN rejected
- [ ] Rate limiting works

---

## 🚨 Common Issues and Solutions

### Issue: "User not found"
**Solution**: Make sure to register the user first using the registration endpoint

### Issue: "Invalid PIN"
**Solution**: Ensure PIN is set using the set-pin endpoint before transactions

### Issue: "Insufficient funds"
**Solution**: Use the wallet credit endpoint to fund the wallet before purchases

### Issue: "Network timeout"
**Solution**: Check internet connection and API server status

### Issue: "Invalid phone number format"
**Solution**: Use Nigerian phone numbers in format 080XXXXXXXX (11 digits)

---

## 📱 Valid Nigerian Phone Number Formats

### MTN: 0803, 0806, 0703, 0706, 0813, 0816, 0810, 0814, 0903, 0906
### Airtel: 0802, 0808, 0708, 0812, 0701, 0902, 0907, 0901
### Glo: 0805, 0807, 0705, 0815, 0811, 0905
### 9mobile: 0809, 0818, 0817, 0909, 0908

**Example valid numbers**:
- MTN: 08031234567
- Airtel: 08021234567  
- Glo: 08051234567
- 9mobile: 08091234567

---

## 🎯 Testing Best Practices

1. **Start with the Quick Start workflow** to ensure basic functionality
2. **Use realistic test data** (valid phone numbers, reasonable amounts)
3. **Test error scenarios** to ensure proper error handling
4. **Monitor response times** for performance issues
5. **Check transaction history** after each operation
6. **Test with different Nigerian networks** (MTN, Airtel, Glo, 9mobile)
7. **Verify wallet balance** before and after transactions
8. **Use different phone numbers** for sender and recipient in transfers
9. **Test various utility providers** and amounts
10. **Save successful transaction references** for lookup testing

---

## 📞 Support and Troubleshooting

If you encounter issues:

1. **Check API Status**: Start with the health endpoint
2. **Verify Environment Variables**: Ensure all variables are set correctly
3. **Check Response Logs**: Look at response bodies for error details
4. **Test Prerequisites**: Ensure user is registered and has PIN set
5. **Validate Input Data**: Check phone number formats and required fields
6. **Monitor Network**: Check for internet connectivity issues
7. **Review Documentation**: Refer to API_DOCUMENTATION.md for detailed endpoint specs

---

**Happy Testing! 🚀**

This guide provides everything you need to thoroughly test the MiiMii fintech platform. Follow the workflows step by step to ensure all functionality works correctly before going live.
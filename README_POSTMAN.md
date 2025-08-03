# 🚀 Quick Start: Testing MiiMii API with Postman

This guide helps you quickly set up and test the MiiMii fintech platform using Postman.

## 📦 Setup (5 minutes)

### 1. Import Collection
1. Download `postman_collection.json` from this project
2. Open Postman → Click "Import" → Select the file → Import

### 2. Set Environment Variables
Create a new environment with these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `baseUrl` | `https://miimii-app-p8gzu.ondigitalocean.app` | API base URL |
| `testPhone` | `08123456789` | Your test phone number |
| `testPin` | `1234` | 4-digit PIN for transactions |
| `recipientPhone` | `08087654321` | Second user for transfers |
| `testBvn` | `12345678901` | Test BVN for KYC |

**⚠️ Important**: Use valid Nigerian phone numbers (080XXXXXXXX format)

## 🎯 Quick Test (10 minutes)

Follow this order to test core functionality:

### 1. 🚀 Quick Start Workflow
Run these requests in order from the "Quick Start" folder:

1. **Health Check** - Verify API is running
2. **Register New User** - Create account
3. **Set Transaction PIN** - Enable transactions
4. **Update Profile** - Complete profile
5. **Start KYC Process** - Submit verification info
6. **Fund Wallet (Admin)** - Add ₦10,000 for testing
7. **Check Wallet Balance** - Verify funding
8. **Test Data Purchase** - Buy 1GB data
9. **Check Transaction History** - Review transactions

### 2. 🧪 Test Different Services

**Data Services:**
- Get Networks → Get MTN Plans → Purchase Data

**Airtime Services:**
- Get Limits → Purchase Airtime → Check History

**Utility Bills:**
- Get Categories → Get Providers → Validate Customer → Pay Bill

**Money Transfer:**
- Create second user → Transfer money → Check status

## 📱 Valid Phone Numbers

Use these Nigerian network prefixes:
- **MTN**: 0803, 0806, 0703, 0706, 0813, 0816
- **Airtel**: 0802, 0808, 0708, 0812, 0701, 0902
- **Glo**: 0805, 0807, 0705, 0815, 0811, 0905
- **9mobile**: 0809, 0818, 0817, 0909, 0908

## ✅ Expected Results

### Successful User Registration
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "phoneNumber": "08123456789",
    "firstName": "John",
    "lastName": "Doe",
    "hasPin": false,
    "canTransact": false
  }
}
```

### Successful Data Purchase
```json
{
  "success": true,
  "message": "Data purchase successful",
  "data": {
    "transaction": {
      "reference": "TXN123456789",
      "amount": 300,
      "status": "completed"
    }
  }
}
```

### Wallet Balance After Funding
```json
{
  "success": true,
  "balance": 10000.00,
  "user": {
    "name": "John Doe",
    "phone": "08123456789"
  }
}
```

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| "User not found" | Register user first |
| "Invalid PIN" | Set PIN before transactions |
| "Insufficient funds" | Fund wallet using admin endpoint |
| "Invalid phone format" | Use 11-digit Nigerian numbers |
| Connection errors | Check `baseUrl` variable |

## 🧪 Testing Scenarios

The collection includes pre-configured scenarios:

1. **Complete User Journey** - Full onboarding flow
2. **Error Testing** - Wrong PIN, invalid data, etc.
3. **Multi-User Testing** - Transfers between users
4. **Service Testing** - Data, airtime, utilities
5. **Admin Operations** - Dashboard and management

## 📊 Response Codes

- **200**: Success
- **400**: Bad request (check input)
- **401**: Wrong PIN
- **404**: User/resource not found
- **500**: Server error

## 🎯 Next Steps

After basic testing:

1. **Test Error Scenarios** - Try wrong PINs, invalid numbers
2. **Test All Services** - Data, airtime, utilities, transfers
3. **Create Multiple Users** - Test user-to-user transfers
4. **Check Admin Functions** - Dashboard, user management
5. **Test WhatsApp Integration** - Message processing

## 📞 Need Help?

- **Full Documentation**: See `API_DOCUMENTATION.md`
- **Detailed Testing**: See `POSTMAN_TESTING_GUIDE.md`
- **API Issues**: Check response body for error details
- **Setup Issues**: Verify environment variables

---

**🚀 Ready to test? Start with the "Quick Start" folder in your imported collection!**
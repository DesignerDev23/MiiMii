# 🚀 MiiMii Fintech Platform API Documentation

**Base URL:** `https://miimii-app-p8gzu.ondigitalocean.app`

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [User Management](#user-management)
4. [KYC Management](#kyc-management)
5. [Wallet Operations](#wallet-operations)
6. [Data Services](#data-services)
7. [Airtime Services](#airtime-services)
8. [Utility Bill Payments](#utility-bill-payments)
9. [Transaction Management](#transaction-management)
10. [Admin Operations](#admin-operations)
11. [WhatsApp Integration](#whatsapp-integration)
12. [Error Handling](#error-handling)
13. [Postman Collection](#postman-collection)

---

## 🌟 Overview

The MiiMii Fintech Platform provides a comprehensive suite of financial services through a RESTful API. The platform supports:

- **User Management**: Registration, profile management, PIN operations
- **KYC Verification**: Know Your Customer processes
- **Wallet Services**: Balance management, transactions, virtual accounts
- **Telecom Services**: Data and airtime purchases for all Nigerian networks
- **Utility Payments**: Electricity, cable TV, internet, and water bills
- **Money Transfers**: Peer-to-peer transfers
- **Admin Operations**: Management and analytics
- **WhatsApp Integration**: Conversational interface

---

## 🔐 Authentication

Most endpoints require user identification via phone number. No API keys are required for basic operations, but sensitive operations require PIN validation.

### PIN Validation
```json
{
  "phoneNumber": "08123456789",
  "pin": "1234"
}
```

---

## 👥 User Management

### Register User
**POST** `/api/users/register`

Creates a new user account or returns existing user information.

```json
// Request
{
  "phoneNumber": "08123456789",
  "firstName": "John",
  "lastName": "Doe"
}

// Response
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "phoneNumber": "08123456789",
    "firstName": "John",
    "lastName": "Doe",
    "kycStatus": "incomplete",
    "hasPin": false,
    "canTransact": false
  },
  "wallet": {
    "balance": 0,
    "isActive": true,
    "isFrozen": false
  }
}
```

### Check User Exists
**POST** `/api/users/check-exists`

Verifies if a user exists in the system.

```json
// Request
{
  "phoneNumber": "08123456789"
}

// Response
{
  "success": true,
  "exists": true,
  "user": {
    "phoneNumber": "08123456789",
    "firstName": "John",
    "lastName": "Doe",
    "kycStatus": "verified",
    "hasPin": true,
    "canTransact": true
  }
}
```

### Get User Profile
**GET** `/api/users/profile/{phoneNumber}`

Retrieves detailed user profile information.

### Update User Profile
**PUT** `/api/users/profile/{phoneNumber}`

Updates user profile information.

### Set PIN
**POST** `/api/users/set-pin`

Sets or updates user transaction PIN.

```json
// Request
{
  "phoneNumber": "08123456789",
  "pin": "1234",
  "confirmPin": "1234"
}

// Response
{
  "success": true,
  "message": "PIN set successfully",
  "canTransact": true
}
```

### Get Onboarding Status
**GET** `/api/users/onboarding/{phoneNumber}`

Returns user onboarding progress and next steps.

```json
// Response
{
  "success": true,
  "onboarding": {
    "isComplete": false,
    "progress": 75,
    "checklist": {
      "basicProfile": { "completed": true },
      "pinSetup": { "completed": true },
      "kycVerification": { "completed": false },
      "walletSetup": { "completed": true }
    },
    "nextStep": "kyc_personal_info"
  }
}
```

---

## 📋 KYC Management

### Start KYC Process
**POST** `/api/users/kyc/start`

Initiates the Know Your Customer verification process.

```json
// Request
{
  "phoneNumber": "08123456789",
  "firstName": "John",
  "lastName": "Doe",
  "middleName": "Smith",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "address": "123 Main Street, Lagos, Nigeria",
  "bvn": "12345678901"
}

// Response
{
  "success": true,
  "message": "KYC process started successfully",
  "kyc": {
    "status": "pending",
    "reference": "KYC123456789"
  }
}
```

### Get KYC Status
**GET** `/api/users/kyc/status/{phoneNumber}`

Retrieves current KYC verification status.

---

## 💳 Wallet Operations

### Get Wallet Balance
**GET** `/api/wallet/balance/{phoneNumber}`

Retrieves current wallet balance and user information.

```json
// Response
{
  "success": true,
  "balance": 5000.00,
  "user": {
    "name": "John Doe",
    "phone": "08123456789",
    "kycStatus": "verified"
  }
}
```

### Get Wallet Transactions
**GET** `/api/wallet/transactions/{phoneNumber}?limit=10&offset=0`

Retrieves wallet transaction history.

### Credit Wallet (Admin)
**POST** `/api/wallet/credit`

Credits funds to a user's wallet (admin operation).

```json
// Request
{
  "phoneNumber": "08123456789",
  "amount": 5000,
  "description": "Account funding",
  "adminNote": "Initial balance"
}
```

### Create Virtual Account
**POST** `/api/wallet/create-virtual-account`

Creates a virtual bank account for wallet funding.

---

## 📱 Data Services

### Get Networks
**GET** `/api/data/networks`

Returns all supported mobile networks.

```json
// Response
{
  "success": true,
  "networks": [
    {
      "name": "MTN",
      "code": "mtn",
      "label": "Mtn"
    },
    {
      "name": "AIRTEL",
      "code": "airtel",
      "label": "Airtel"
    }
  ]
}
```

### Get Data Plans
**GET** `/api/data/plans/{network}`

Returns data plans for a specific network.

```json
// Response - GET /api/data/plans/mtn
{
  "success": true,
  "network": "mtn",
  "networkName": "MTN",
  "plans": [
    {
      "id": "mtn-1gb-300",
      "size": "1GB",
      "price": 300,
      "duration": "1 day",
      "code": "3"
    }
  ]
}
```

### Purchase Data
**POST** `/api/data/purchase`

Purchases data bundle for a phone number.

```json
// Request
{
  "phoneNumber": "08031234567",
  "network": "mtn",
  "planId": "mtn-1gb-300",
  "pin": "1234",
  "userPhone": "08123456789"
}

// Response
{
  "success": true,
  "message": "Data purchase successful",
  "data": {
    "transaction": {
      "reference": "TXN123456789",
      "amount": 300,
      "phoneNumber": "08031234567",
      "network": "mtn",
      "planDetails": {
        "size": "1GB",
        "duration": "1 day"
      },
      "status": "completed"
    }
  }
}
```

### Detect Network
**POST** `/api/data/detect-network`

Automatically detects the network operator from a phone number.

```json
// Request
{
  "phoneNumber": "08031234567"
}

// Response
{
  "success": true,
  "networkInfo": {
    "phoneNumber": "08031234567",
    "network": "mtn",
    "networkName": "MTN"
  }
}
```

---

## 📞 Airtime Services

### Get Airtime Limits
**GET** `/api/airtime/limits`

Returns airtime purchase limits and quick amounts.

```json
// Response
{
  "success": true,
  "limits": {
    "minimum": 50,
    "maximum": 50000
  },
  "quickAmounts": [100, 200, 500, 1000, 2000, 5000, 10000],
  "supportedNetworks": [...]
}
```

### Purchase Airtime
**POST** `/api/airtime/purchase`

Purchases airtime for a phone number.

```json
// Request
{
  "phoneNumber": "08031234567",
  "network": "mtn",
  "amount": 1000,
  "pin": "1234",
  "userPhone": "08123456789"
}

// Response
{
  "success": true,
  "message": "Airtime purchase successful",
  "data": {
    "transaction": {
      "reference": "TXN123456789",
      "amount": 1000,
      "fee": 10,
      "totalAmount": 1010,
      "phoneNumber": "08031234567",
      "network": "mtn",
      "status": "completed"
    }
  }
}
```

### Get Recent Recipients
**GET** `/api/airtime/recent-recipients/{phoneNumber}?limit=5`

Returns recent airtime recipients for quick recharge.

---

## ⚡ Utility Bill Payments

### Get Utility Categories
**GET** `/api/utility/categories`

Returns all available utility categories.

```json
// Response
{
  "success": true,
  "categories": [
    {
      "id": "electricity",
      "name": "Electricity",
      "icon": "⚡",
      "providerCount": 10
    },
    {
      "id": "cable",
      "name": "Cable TV",
      "icon": "📺",
      "providerCount": 4
    }
  ]
}
```

### Get Providers
**GET** `/api/utility/providers/{category}`

Returns providers for a specific utility category.

```json
// Response - GET /api/utility/providers/electricity
{
  "success": true,
  "category": "electricity",
  "name": "Electricity",
  "icon": "⚡",
  "providers": [
    {
      "name": "Ikeja Electricity Distribution Company",
      "code": "ikedc"
    }
  ]
}
```

### Get Cable Plans
**GET** `/api/utility/cable-plans/{provider}`

Returns subscription plans for cable TV providers.

```json
// Response - GET /api/utility/cable-plans/dstv
{
  "success": true,
  "provider": "dstv",
  "providerName": "DStv",
  "plans": [
    {
      "id": "dstv-compact",
      "name": "DStv Compact",
      "price": 9000,
      "duration": "30 days"
    }
  ]
}
```

### Validate Customer
**POST** `/api/utility/validate-customer`

Validates customer details before payment.

```json
// Request
{
  "category": "electricity",
  "provider": "ikedc",
  "customerNumber": "12345678901"
}

// Response
{
  "success": true,
  "valid": true,
  "customerNumber": "12345678901",
  "customerName": "John Doe",
  "address": "123 Main Street, Lagos",
  "balance": 2500
}
```

### Pay Utility Bill
**POST** `/api/utility/pay`

Processes utility bill payment.

```json
// Request - Electricity Bill
{
  "userPhone": "08123456789",
  "category": "electricity",
  "provider": "ikedc",
  "customerNumber": "12345678901",
  "amount": 5000,
  "pin": "1234"
}

// Request - Cable TV Subscription
{
  "userPhone": "08123456789",
  "category": "cable",
  "provider": "dstv",
  "customerNumber": "1234567890",
  "amount": 9000,
  "pin": "1234",
  "planId": "dstv-compact"
}

// Response
{
  "success": true,
  "message": "Bill payment successful",
  "data": {
    "transaction": {
      "reference": "TXN123456789",
      "amount": 5000,
      "fee": 75,
      "totalAmount": 5075,
      "category": "electricity",
      "provider": "ikedc",
      "customerNumber": "12345678901",
      "customerName": "John Doe",
      "status": "completed"
    }
  }
}
```

### Estimate Fee
**POST** `/api/utility/estimate-fee`

Calculates fees for utility bill payments.

```json
// Request
{
  "category": "electricity",
  "amount": 5000
}

// Response
{
  "success": true,
  "estimate": {
    "billAmount": 5000,
    "fee": 75,
    "totalAmount": 5075,
    "feeRate": "1.5%"
  }
}
```

---

## 💸 Transaction Management

### Get Transaction by Reference
**GET** `/api/transactions/{reference}`

Retrieves transaction details by reference number.

### Get All Transactions
**GET** `/api/transactions?page=1&limit=20&phoneNumber={phone}&type={type}&status={status}`

Retrieves transactions with filtering options.

### Transfer Money
**POST** `/api/transactions/transfer`

Transfers money between wallets.

```json
// Request
{
  "senderPhone": "08123456789",
  "recipientPhone": "08087654321",
  "amount": 1000,
  "description": "Payment for services",
  "pin": "1234"
}

// Response
{
  "success": true,
  "transfer": {
    "reference": "TXN123456789",
    "amount": 1000,
    "fee": 0,
    "status": "completed",
    "sender": "John Doe",
    "recipient": "Jane Smith"
  }
}
```

### Get Transaction Statistics
**GET** `/api/transactions/stats/overview`

Returns platform-wide transaction statistics.

---

## 🔧 Admin Operations

### Get Dashboard Statistics
**GET** `/api/admin/dashboard/stats`

Returns comprehensive platform statistics.

### Get All Users
**GET** `/api/admin/users?page=1&limit=20`

Retrieves paginated user list.

### Search Users
**GET** `/api/users/search?q={query}&limit=10`

Searches users by name or phone number.

---

## 💬 WhatsApp Integration

### Send Message
**POST** `/api/whatsapp/send-message`

Sends WhatsApp message to user.

```json
// Request
{
  "to": "08123456789",
  "message": "Your transaction was successful!",
  "type": "text"
}
```

### Process Incoming Message
**POST** `/api/whatsapp/process-message`

Processes incoming WhatsApp messages.

```json
// Request
{
  "from": "08123456789",
  "message": "balance",
  "messageId": "msg_123456"
}
```

---

## ❌ Error Handling

All API endpoints return consistent error responses:

```json
// Validation Error (400)
{
  "errors": [
    {
      "field": "phoneNumber",
      "message": "Invalid phone number format"
    }
  ]
}

// Not Found Error (404)
{
  "error": "User not found"
}

// Server Error (500)
{
  "error": "Internal server error"
}
```

### Common Error Codes

- **400**: Bad Request - Invalid input data
- **401**: Unauthorized - Missing or invalid authentication
- **403**: Forbidden - Insufficient permissions
- **404**: Not Found - Resource doesn't exist
- **429**: Too Many Requests - Rate limit exceeded
- **500**: Internal Server Error - Server-side error

---

## 📦 Postman Collection

Import the complete Postman collection to test all endpoints:

**Collection URL**: [Download postman_collection.json](./postman_collection.json)

### Environment Variables

Set these variables in your Postman environment:

```json
{
  "baseUrl": "https://miimii-app-p8gzu.ondigitalocean.app",
  "testPhone": "08123456789",
  "testPin": "1234"
}
```

### Testing Workflow

1. **Register User**: Start with user registration
2. **Set PIN**: Set transaction PIN
3. **Complete KYC**: Submit KYC information
4. **Fund Wallet**: Credit wallet (admin operation)
5. **Test Services**: Purchase data, airtime, or pay bills
6. **Check History**: Review transaction history

---

## 📱 Nigerian Network Codes

### Phone Number Prefixes

**MTN**: 0803, 0806, 0703, 0706, 0813, 0816, 0810, 0814, 0903, 0906

**Airtel**: 0802, 0808, 0708, 0812, 0701, 0902, 0907, 0901

**Glo**: 0805, 0807, 0705, 0815, 0811, 0905

**9mobile**: 0809, 0818, 0817, 0909, 0908

---

## 🔄 Rate Limits

- **Standard endpoints**: 100 requests per 15 minutes per IP
- **Heavy operations**: Additional internal rate limiting
- **WhatsApp integration**: 50 messages per minute

---

## 📊 Response Times

- **User operations**: < 500ms
- **Transaction processing**: < 2 seconds
- **External API calls**: < 30 seconds (with timeout)
- **Utility validation**: < 15 seconds

---

## 🆘 Support

For API support and integration assistance:

- **Documentation**: This guide
- **Postman Collection**: Complete testing suite
- **Error Codes**: Detailed error responses
- **Phone Validation**: Automatic network detection

---

**Last Updated**: January 2024
**API Version**: 1.0.0
# MiiMii Mobile App - Production Ready Guide

## Table of Contents
1. [Overview](#overview)
2. [Environment Setup](#environment-setup)
3. [Authentication Flow](#authentication-flow)
4. [Onboarding Workflow](#onboarding-workflow)
5. [Core Features & API Integration](#core-features--api-integration)
6. [In-App Chat Bot](#in-app-chat-bot)
7. [Error Handling](#error-handling)
8. [Security Best Practices](#security-best-practices)
9. [Testing Checklist](#testing-checklist)
10. [Production Deployment](#production-deployment)

---

## Overview

The MiiMii Mobile App is a fintech application that provides:
- **Traditional App Experience**: Standard UI screens for banking operations
- **Conversational AI**: In-app chat bot (same AI as WhatsApp bot)
- **Unified Backend**: Single source of truth - users can switch between app and WhatsApp seamlessly

### Key Principles
- **Single Source of Truth**: All business logic lives on the backend. The app is a client that consumes APIs.
- **State Synchronization**: User state (onboarding, wallet, transactions) is shared between mobile app and WhatsApp bot.
- **Security First**: JWT authentication, PIN verification, encrypted storage.

---

## Environment Setup

### Required Environment Variables (Backend)
```bash
# Mobile App Authentication
MOBILE_JWT_SECRET=<generate-32-char-random-string>

# Email Service (for OTP)
EMAIL_SERVICE_API_KEY=<your-email-service-key>
EMAIL_FROM_ADDRESS=noreply@miimii.com

# Base URLs
API_BASE_URL=https://api.chatmiimii.com
MOBILE_APP_DEEP_LINK_SCHEME=miimii://
```

### Generate MOBILE_JWT_SECRET
```bash
# Linux/Mac
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### API Base Configuration
- **Base URL**: `https://api.chatmiimii.com/api/mobile`
- **Authentication**: Bearer token in `Authorization` header
- **Content-Type**: `application/json` for all requests

---

## Authentication Flow

### 1. Signup

**Endpoint**: `POST /api/mobile/auth/signup`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "phoneNumber": "+2348012345678",
  "firstName": "Ada",
  "lastName": "Okafor"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Signup successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h",
  "user": {
    "id": "uuid",
    "phoneNumber": "+2348012345678",
    "firstName": "Ada",
    "lastName": "Okafor",
    "kycStatus": "pending",
    "wallet": {
      "balance": 0,
      "virtualAccount": {
        "accountNumber": null,
        "bank": null
      }
    }
  },
  "onboarding": {
    "currentStep": "profile_setup",
    "nextStep": "profile_setup",
    "stepsCompleted": {
      "profile": false,
      "kyc": false,
      "virtualAccount": false,
      "pin": false
    },
    "virtualAccount": null
  }
}
```

**App Behavior**:
1. Validate email format and password strength (min 6 chars)
2. Store JWT token securely (Keychain/Keystore)
3. Check `onboarding.nextStep` to determine which screen to show
4. Navigate to onboarding flow if not completed

---

### 2. Login

**Endpoint**: `POST /api/mobile/auth/login`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response**: Same structure as signup

**App Behavior**:
1. Show loading state during authentication
2. Handle errors:
   - `401`: Invalid credentials → Show error message
   - `403`: Account locked → Show "Account temporarily locked. Try again in 15 minutes"
3. On success, store token and navigate based on onboarding status

---

### 3. Forgot Password (OTP-based)

**Step 1: Request OTP**
**Endpoint**: `POST /api/mobile/auth/forgot-password`

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "If the email exists, an OTP has been sent"
}
```

**App Behavior**:
- Show success message: "Check your email for a 6-digit code"
- Navigate to OTP input screen

**Step 2: Verify OTP (Optional)**
**Endpoint**: `POST /api/mobile/auth/verify-otp`

**Request**:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "email": "user@example.com"
}
```

**App Behavior**:
- If valid, show password reset screen
- If invalid, show error with remaining attempts
- If expired, allow user to request new OTP

**Step 3: Reset Password**
**Endpoint**: `POST /api/mobile/auth/reset-password`

**Request**:
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "NewSecure123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**App Behavior**:
- On success, navigate to login screen
- Show success message: "Password reset successful. Please login with your new password"

---

### 4. Token Refresh

**Endpoint**: `POST /api/mobile/auth/refresh`

**Headers**: `Authorization: Bearer <token>`

**Response**: Same as login (new token + updated user/onboarding state)

**App Behavior**:
- Call this endpoint when token is about to expire (e.g., 1 hour before expiry)
- Update stored token with new one
- Use this to sync user state without full re-login

---

## Onboarding Workflow

The onboarding flow is **mandatory** and must be completed before users can perform transactions. The app should guide users through each step based on `onboarding.nextStep`.

### Onboarding Status Check

**Endpoint**: `GET /api/mobile/onboarding/status`

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "onboarding": {
    "currentStep": "kyc_submission",
    "nextStep": "kyc_submission",
    "stepsCompleted": {
      "profile": true,
      "kyc": false,
      "virtualAccount": false,
      "pin": false
    },
    "virtualAccount": null
  }
}
```

**App Behavior**:
- Call this endpoint on app launch (after authentication)
- Show appropriate screen based on `nextStep`:
  - `profile_setup` → Profile collection screen
  - `kyc_submission` → KYC/BVN screen
  - `virtual_account_creation` → Virtual account display screen
  - `pin_setup` → PIN setup screen
  - `completed` → Main dashboard

---

### Step 1: Profile Setup

**Endpoint**: `POST /api/mobile/onboarding/profile`

**Request**:
```json
{
  "firstName": "Ada",
  "lastName": "Okafor",
  "address": "12 Admiralty Way, Lekki Phase 1, Lagos",
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "onboarding": {
    "currentStep": "kyc_submission",
    "nextStep": "kyc_submission",
    "stepsCompleted": {
      "profile": true,
      "kyc": false,
      "virtualAccount": false,
      "pin": false
    }
  }
}
```

**App Behavior**:
- Collect: First Name, Last Name, Residential Address (required)
- Optional: Email (if not set during signup)
- Validate address format
- On success, automatically navigate to KYC screen

---

### Step 2: KYC Submission (BVN + Banking Setup)

**Endpoint**: `POST /api/mobile/onboarding/kyc`

**Request**:
```json
{
  "dateOfBirth": "1995-05-20",
  "gender": "female",
  "address": "12 Admiralty Way, Lekki Phase 1, Lagos",
  "bvn": "12345678901"
}
```

**Response**:
```json
{
  "success": true,
  "message": "KYC submitted successfully",
  "reference": "KYC-REF-123456",
  "onboarding": {
    "currentStep": "virtual_account_creation",
    "nextStep": "pin_setup",
    "stepsCompleted": {
      "profile": true,
      "kyc": true,
      "virtualAccount": true,
      "pin": false
    },
    "virtualAccount": {
      "accountNumber": "1234567890",
      "bank": "Rubies MFB",
      "accountName": "Ada Okafor"
    }
  }
}
```

**App Behavior**:
- Collect: Date of Birth (YYYY-MM-DD), Gender (male/female), BVN (11 digits)
- Show loading state during KYC verification (can take 10-30 seconds)
- **Important**: Virtual account is automatically created during KYC if successful
- If `virtualAccount` is present in response, skip to PIN setup
- If KYC fails, show error and allow retry

**Backend Process**:
1. Verifies BVN with Fincra
2. Creates Rubies virtual account automatically
3. Updates user KYC status
4. Advances onboarding to PIN setup

---

### Step 3: Virtual Account Display (Usually Auto-completed)

**Endpoint**: `POST /api/mobile/onboarding/virtual-account` (only if needed)

**Use Case**: If virtual account wasn't created during KYC, call this endpoint.

**Response**:
```json
{
  "success": true,
  "virtualAccount": {
    "accountNumber": "1234567890",
    "bank": "Rubies MFB",
    "accountName": "Ada Okafor"
  }
}
```

**App Behavior**:
- Display account details prominently
- Show "Copy Account Number" button
- Display message: "Send money from any bank to this account to fund your wallet"
- Allow user to proceed to PIN setup

---

### Step 4: PIN Setup

**Endpoint**: `POST /api/mobile/onboarding/pin`

**Request**:
```json
{
  "pin": "1234",
  "confirmPin": "1234"
}
```

**Response**:
```json
{
  "success": true,
  "message": "PIN set successfully",
  "onboarding": {
    "currentStep": "completed",
    "nextStep": "completed",
    "stepsCompleted": {
      "profile": true,
      "kyc": true,
      "virtualAccount": true,
      "pin": true
    }
  }
}
```

**App Behavior**:
- Collect 4-digit PIN (mask input)
- Validate: PINs must match, no obvious patterns (1234, 0000, etc.)
- On success, navigate to main dashboard
- **Critical**: User can now perform transactions

---

## Core Features & API Integration

### Wallet Management

#### Get Wallet Summary
**Endpoint**: `GET /api/mobile/me/wallet`

**Response**:
```json
{
  "success": true,
  "wallet": {
    "id": "uuid",
    "balance": 1250.50,
    "availableBalance": 1200.50,
    "ledgerBalance": 1250.50,
    "pendingBalance": 50.00,
    "currency": "NGN",
    "isActive": true,
    "isFrozen": false,
    "virtualAccount": {
      "accountNumber": "1234567890",
      "bank": "Rubies MFB",
      "accountName": "Ada Okafor"
    },
    "limits": {
      "dailyLimit": 500000,
      "dailySpent": 15000,
      "monthlyLimit": 5000000,
      "monthlySpent": 150000
    }
  }
}
```

**App Behavior**:
- Display on home screen
- Show balance prominently
- Display available vs. ledger balance
- Show transfer limits and usage
- Handle frozen wallet state (disable transactions)

---

### Bank Transfers

#### 1. Get Supported Banks
**Endpoint**: `GET /api/mobile/banks`

**Response**:
```json
{
  "success": true,
  "banks": [
    {
      "code": "058",
      "name": "GTBank",
      "type": "commercial"
    },
    {
      "code": "011",
      "name": "First Bank",
      "type": "commercial"
    }
  ]
}
```

**App Behavior**:
- Display as searchable list/dropdown
- Cache for offline use (refresh daily)

---

#### 2. Validate Account Number
**Endpoint**: `POST /api/mobile/transfers/validate-account`

**Request**:
```json
{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

**Response**:
```json
{
  "success": true,
  "accountName": "ADA OKAFOR",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "bankName": "GTBank"
}
```

**App Behavior**:
- Call this immediately after user enters account number
- Show account name for confirmation
- Disable "Continue" button until validation succeeds
- Handle errors (invalid account, network issues)

---

#### 3. Get Transfer Limits
**Endpoint**: `GET /api/mobile/transfers/limits`

**Response**:
```json
{
  "success": true,
  "limits": {
    "minAmount": 100,
    "maxAmount": 5000000,
    "dailyLimit": 500000,
    "dailySpent": 15000,
    "remainingDaily": 485000,
    "monthlyLimit": 5000000,
    "monthlySpent": 150000,
    "remainingMonthly": 4850000
  }
}
```

**App Behavior**:
- Display limits on transfer screen
- Validate amount input against limits
- Show progress bars for daily/monthly usage

---

#### 4. Initiate Transfer
**Endpoint**: `POST /api/mobile/transfers`

**Request**:
```json
{
  "amount": 5000,
  "accountNumber": "0123456789",
  "bankCode": "058",
  "bankName": "GTBank",
  "narration": "Payment for services",
  "pin": "1234"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Transfer initiated successfully",
  "transaction": {
    "id": "uuid",
    "reference": "TXN-123456",
    "amount": 5000,
    "fee": 25,
    "status": "pending",
    "type": "transfer_out",
    "createdAt": "2025-11-15T10:30:00Z"
  }
}
```

**App Behavior**:
- Show PIN input screen before final confirmation
- Display transaction summary (amount, fee, recipient)
- Show loading state during processing
- On success, show receipt screen with transaction details
- **After successful transfer**: Show option to "Save as Beneficiary" on receipt screen
- Handle errors:
  - Insufficient balance
  - Invalid PIN
  - Account limit exceeded
  - Network errors

---

#### 5. OCR Transfer (Extract Bank Details from Image)
**Endpoint**: `POST /api/mobile/transfers/ocr`

**Request**: 
- **Content-Type**: `multipart/form-data`
- **Body**: Form data with `image` field (file upload)
- **File Requirements**:
  - Max size: 10MB
  - Accepted formats: JPEG, PNG, GIF, WebP
  - Image should contain clear bank details (account number, bank name)

**Response**:
```json
{
  "success": true,
  "message": "Bank details extracted successfully",
  "bankDetails": {
    "accountNumber": "0123456789",
    "bankName": "Guaranty Trust Bank",
    "bankCode": "058",
    "accountHolderName": "John Doe"
  },
  "confidence": 0.85,
  "ocrConfidence": 0.92
}
```

**Error Response** (if extraction fails):
```json
{
  "error": "Could not extract valid bank details: Account number not found",
  "extractedData": {
    "accountNumber": null,
    "bankName": "GTBank",
    "accountHolderName": null
  },
  "ocrText": "GTBank\nAccount Number: ...",
  "ocrConfidence": 0.75
}
```

**App Behavior**:
1. **Image Capture/Selection**:
   - Allow user to take photo with camera or select from gallery
   - Show image preview before upload
   - Validate image size and format

2. **Upload & Processing**:
   - Show loading indicator with message: "Extracting bank details..."
   - Display progress if possible (OCR can take 5-15 seconds)
   - Handle timeout (set reasonable timeout, e.g., 30 seconds)

3. **Success Handling**:
   - Display extracted bank details for user confirmation
   - Pre-fill transfer form with:
     - Account number
     - Bank name (and code if matched)
     - Account holder name (if available)
   - Allow user to edit any field before proceeding
   - Show confidence score (optional, for transparency)

4. **Error Handling**:
   - If no text found: "No text detected. Please ensure the image is clear and contains bank details."
   - If partial extraction: Show what was found, allow manual entry
   - If validation fails: Show specific error (e.g., "Account number not found")
   - Provide option to retry with new image
   - Allow manual entry as fallback

5. **Best Practices**:
   - Guide users: "Take a clear photo of the bank account details"
   - Show example of good image (well-lit, focused, contains account number and bank name)
   - Support both handwritten and printed text
   - Cache extracted details temporarily (in case user wants to retry)

**Complete OCR Transfer Flow**:
1. User taps "Scan Bank Details" or "Use OCR" button
2. User captures/selects image
3. App uploads image to `/transfers/ocr`
4. Backend processes image (OCR + AI extraction)
5. App receives extracted bank details
6. App shows confirmation screen with extracted data
7. User confirms or edits details
8. User enters amount and proceeds to transfer
9. App calls `/transfers` endpoint with extracted + user-entered data

**Technical Notes**:
- OCR uses Tesseract.js for text extraction
- AI (OpenAI) analyzes extracted text to identify bank details
- Supports all major Nigerian banks (traditional and digital)
- Handles various image formats and qualities
- Preprocessing enhances image for better OCR accuracy

---

### Airtime Purchase

#### 1. Get Networks
**Endpoint**: `GET /api/mobile/airtime/networks`

**Response**:
```json
{
  "success": true,
  "networks": [
    { "code": "MTN", "name": "MTN Nigeria" },
    { "code": "AIRTEL", "name": "Airtel Nigeria" },
    { "code": "GLO", "name": "Globacom" },
    { "code": "9MOBILE", "name": "9mobile" }
  ]
}
```

#### 2. Purchase Airtime
**Endpoint**: `POST /api/mobile/airtime/purchase`

**Request**:
```json
{
  "phoneNumber": "+2348012345678",
  "network": "MTN",
  "amount": 1000,
  "pin": "1234"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Airtime purchase successful",
  "transaction": {
    "id": "uuid",
    "reference": "AIRTIME-123456",
    "amount": 1000,
    "status": "completed",
    "type": "airtime_purchase"
  }
}
```

**App Behavior**:
- Validate phone number format
- Show network selection
- Allow custom amount or preset amounts (100, 200, 500, 1000, etc.)
- Request PIN before confirmation
- Show success message with transaction reference

---

### Data Purchase

#### 1. Get Networks
**Endpoint**: `GET /api/mobile/data/networks`

**Response**: Same structure as airtime networks

---

#### 2. Get All Data Plans (All Networks)
**Endpoint**: `GET /api/mobile/data/plans/all`

**Description**: Returns all data plans for all networks in a single request. Useful for displaying all available plans in the app.

**Response**:
```json
{
  "success": true,
  "dataPlans": {
    "mtn": {
      "network": "MTN",
      "networkCode": "mtn",
      "plans": [
        {
          "id": "mtn-100mb-100",
          "size": "100MB",
          "price": 100,
          "duration": "1 day",
          "code": "1"
        },
        {
          "id": "mtn-1gb-500",
          "size": "1GB",
          "price": 500,
          "duration": "7 days",
          "code": "5"
        }
      ]
    },
    "airtel": {
      "network": "AIRTEL",
      "networkCode": "airtel",
      "plans": [
        {
          "id": "airtel-1gb-350",
          "size": "1GB",
          "price": 350,
          "duration": "1 day",
          "code": "3"
        }
      ]
    },
    "glo": {
      "network": "GLO",
      "networkCode": "glo",
      "plans": [...]
    },
    "9mobile": {
      "network": "9MOBILE",
      "networkCode": "9mobile",
      "plans": [...]
    }
  },
  "networks": ["mtn", "airtel", "glo", "9mobile"]
}
```

**App Behavior**:
- Fetch all plans once on app load or when entering data purchase screen
- Group plans by network in the UI
- Allow users to filter by network
- Show plan size, price, and duration
- Cache plans to reduce API calls

---

#### 3. Get Data Plans for Specific Network
**Endpoint**: `GET /api/mobile/data/plans?network=MTN`

**Query Parameters**:
- `network` (required): `mtn`, `airtel`, `glo`, or `9mobile` (case-insensitive)

**Response**:
```json
{
  "success": true,
  "network": "MTN",
  "plans": [
    {
      "id": "mtn-100mb-100",
      "size": "100MB",
      "price": 100,
      "duration": "1 day",
      "code": "1"
    },
    {
      "id": "mtn-1gb-500",
      "size": "1GB",
      "price": 500,
      "duration": "7 days",
      "code": "5"
    }
  ]
}
```

**App Behavior**:
- Use when user selects a specific network
- Fetch plans on-demand when network is selected
- Display plans in a scrollable list
- Show plan details (size, price, duration)

#### 2. Get Data Plans
**Endpoint**: `GET /api/mobile/data/plans/:network`

**Example**: `GET /api/mobile/data/plans/MTN`

**Response**:
```json
{
  "success": true,
  "plans": [
    {
      "id": "uuid",
      "name": "1GB - 30 Days",
      "dataSize": "1GB",
      "validity": "30 days",
      "price": 500,
      "network": "MTN",
      "isActive": true
    }
  ]
}
```

#### 3. Purchase Data
**Endpoint**: `POST /api/mobile/data/purchase`

**Request**:
```json
{
  "phoneNumber": "+2348012345678",
  "network": "MTN",
  "planId": "uuid",
  "pin": "1234"
}
```

**Response**: Same structure as airtime purchase

**App Behavior**:
- Display plans grouped by data size or price
- Show plan details (data size, validity, price)
- Request PIN before confirmation
- Handle plan unavailability errors

---

### Bill Payments

#### 1. Get Categories
**Endpoint**: `GET /api/mobile/bills/categories`

**Response**:
```json
{
  "success": true,
  "categories": [
    { "code": "electricity", "name": "Electricity" },
    { "code": "cable", "name": "Cable TV" },
    { "code": "internet", "name": "Internet" }
  ]
}
```

#### 2. Get Providers
**Endpoint**: `GET /api/mobile/bills/providers/:category`

**Example**: `GET /api/mobile/bills/providers/electricity`

**Response**:
```json
{
  "success": true,
  "providers": [
    { "code": "EKEDC", "name": "Eko Electricity Distribution Company" },
    { "code": "IKEDC", "name": "Ikeja Electric" }
  ]
}
```

#### 3. Get Plans (for Cable/Internet)
**Endpoint**: `GET /api/mobile/bills/plans/:provider`

**Response**: Similar to data plans structure

#### 4. Validate Customer
**Endpoint**: `POST /api/mobile/bills/validate`

**Request**:
```json
{
  "category": "electricity",
  "provider": "EKEDC",
  "customerNumber": "12345678901"
}
```

**Response**:
```json
{
  "success": true,
  "customerName": "ADA OKAFOR",
  "customerNumber": "12345678901",
  "outstandingBalance": 5000
}
```

#### 5. Pay Bill
**Endpoint**: `POST /api/mobile/bills/pay`

**Request**:
```json
{
  "category": "electricity",
  "provider": "EKEDC",
  "customerNumber": "12345678901",
  "amount": 5000,
  "pin": "1234",
  "planId": "uuid"
}
```

**Response**: Transaction object similar to transfer

**App Behavior**:
- Guide user through: Category → Provider → Customer Number → Amount → PIN
- Validate customer before allowing payment
- Show outstanding balance if available
- Handle validation errors (invalid customer number)

---

### Transaction History

#### List Transactions
**Endpoint**: `GET /api/mobile/me/transactions`

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `type` (optional: transfer_out, transfer_in, airtime_purchase, data_purchase, bill_payment)
- `category` (optional)
- `status` (optional: pending, completed, failed)
- `startDate` (optional: ISO 8601)
- `endDate` (optional: ISO 8601)

**Response**:
```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "reference": "TXN-123456",
      "amount": 5000,
      "fee": 25,
      "type": "transfer_out",
      "category": "bank_transfer",
      "status": "completed",
      "description": "Transfer to GTBank - 0123456789",
      "createdAt": "2025-11-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**App Behavior**:
- Display in reverse chronological order (newest first)
- Implement pull-to-refresh
- Show loading skeleton during fetch
- Group by date (Today, Yesterday, This Week, etc.)
- Filter by type/status using query parameters
- Show transaction details on tap

---

#### Get Transaction Details
**Endpoint**: `GET /api/mobile/me/transactions/:reference`

**Response**:
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "reference": "TXN-123456",
    "type": "debit",
    "category": "bank_transfer",
    "subCategory": null,
    "amount": 5000,
    "fee": 25,
    "platformFee": 0,
    "providerFee": 0,
    "totalAmount": 5025,
    "currency": "NGN",
    "status": "completed",
    "priority": "normal",
    "source": "api",
    "approvalStatus": "auto_approved",
    "description": "Transfer to GTBank - 0123456789",
    "narration": "Payment for services",
    "recipientDetails": {
      "accountNumber": "0123456789",
      "accountName": "John Doe",
      "bankCode": "058",
      "bankName": "GTBank"
    },
    "senderDetails": null,
    "providerReference": "REF123",
    "providerResponse": {},
    "balanceBefore": 50000,
    "balanceAfter": 44975,
    "metadata": {},
    "retryCount": 0,
    "maxRetries": 3,
    "createdAt": "2025-01-19T10:30:00Z",
    "updatedAt": "2025-01-19T10:30:05Z",
    "processedAt": "2025-01-19T10:30:05Z",
    "nextRetryAt": null,
    "completedAt": "2025-01-19T10:30:05Z",
    "failedAt": null
  }
}
```

**App Behavior**:
- Show full transaction details with all fields
- Display receipt with all metadata
- Allow sharing/exporting receipt
- Show status badge (pending/completed/failed)
- Display balance before/after for context
- Show provider references and responses
- For bank transfers, show option to save as beneficiary

---

#### Save Beneficiary After Transfer
**Endpoint**: `POST /api/mobile/transfers/:reference/save-beneficiary`

**Description**: Save a recipient as a beneficiary after a successful bank transfer. This allows users to quickly access frequently used recipients.

**Request**:
```json
{
  "nickname": "Mom"  // Optional: Custom nickname for the beneficiary
}
```

**Response**:
```json
{
  "success": true,
  "message": "Beneficiary saved successfully",
  "beneficiary": {
    "id": "uuid",
    "name": "John Doe",
    "nickname": "Mom",
    "type": "bank_account",
    "accountNumber": "0123456789",
    "bankName": "GTBank",
    "bankCode": "058",
    "phoneNumber": null,
    "isVerified": true,
    "isFavorite": false,
    "category": "family",
    "totalTransactions": 1,
    "totalAmount": 5000,
    "lastUsedAt": "2025-01-19T10:30:00Z"
  }
}
```

**Requirements**:
- Transaction must exist and belong to the authenticated user
- Transaction must be a bank transfer (`category: "bank_transfer"`)
- Transaction must be completed (`status: "completed"`)
- Transaction must have recipient details (account number or phone number)

**Error Responses**:
- `404`: Transaction not found
- `400`: "Can only save beneficiaries from bank transfers"
- `400`: "Can only save beneficiaries from completed transfers"
- `400`: "Transaction does not have sufficient recipient details to save as beneficiary"

**App Behavior**:
- Show "Save as Beneficiary" button on completed transfer receipt screen
- Allow user to add optional nickname
- If beneficiary already exists, update it (increment transaction count, update last used)
- Show success message and update beneficiaries list
- Navigate to beneficiaries list or stay on receipt screen

**Use Cases**:
1. User completes a transfer to a new recipient
2. On the receipt screen, user taps "Save as Beneficiary"
3. Optionally enters a nickname (e.g., "Mom", "Business Partner")
4. Beneficiary is saved and can be selected for future transfers

---

### Beneficiaries Management

#### List Beneficiaries
**Endpoint**: `GET /api/mobile/beneficiaries`

**Query Parameters**:
- `limit` (default: 50)
- `category` (optional: family, friends, business, other)

**Response**:
```json
{
  "success": true,
  "beneficiaries": [
    {
      "id": "uuid",
      "name": "John Doe",
      "accountNumber": "0123456789",
      "bankCode": "058",
      "bankName": "GTBank",
      "nickname": "Brother",
      "category": "family",
      "isFavorite": true,
      "lastUsedAt": "2025-11-10T08:00:00Z"
    }
  ]
}
```

**App Behavior**:
- Display as address book
- Group by category or show favorites first
- Allow search/filter
- Show "Add New" button

---

#### Create Beneficiary
**Endpoint**: `POST /api/mobile/beneficiaries`

**Request**:
```json
{
  "name": "John Doe",
  "accountNumber": "0123456789",
  "bankCode": "058",
  "bankName": "GTBank",
  "nickname": "Brother",
  "category": "family"
}
```

**Response**: Beneficiary object

**App Behavior**:
- Validate account before saving
- Allow setting nickname and category
- Mark as favorite option

---

#### Update Beneficiary
**Endpoint**: `PATCH /api/mobile/beneficiaries/:id`

**Request**: Same fields as create (all optional)

**App Behavior**: Edit screen with pre-filled data

---

#### Delete Beneficiary
**Endpoint**: `DELETE /api/mobile/beneficiaries/:id`

**App Behavior**: Show confirmation dialog before deletion

---

#### Toggle Favorite
**Endpoint**: `POST /api/mobile/beneficiaries/:id/toggle-favorite`

**App Behavior**: Toggle favorite status with visual feedback

---

## In-App Chat Bot

The chat bot provides a conversational interface to the same AI assistant used in WhatsApp. Users can perform transactions via natural language.

### Send Message
**Endpoint**: `POST /api/mobile/chat/send`

**Request**:
```json
{
  "message": "Send 5k to 0123456789 GTBank"
}
```

**Response**:
```json
{
  "success": true,
  "reply": "Got it! Sending ₦5,000 to GTBank account 0123456789. Just need your PIN to confirm.",
  "intent": "bank_transfer",
  "meta": {
    "userMessageId": "uuid",
    "botMessageId": "uuid"
  }
}
```

**App Behavior**:
- Display chat UI with message bubbles
- Show user messages on right, bot messages on left
- Show typing indicator while waiting for response
- Parse `intent` to show contextual actions (e.g., "Continue Transfer" button)
- Handle errors gracefully (network issues, invalid requests)

---

### Get Chat History
**Endpoint**: `GET /api/mobile/chat/history`

**Query Parameters**:
- `limit` (default: 50, max: 200)
- `before` (optional: ISO 8601 timestamp for pagination)

**Response**:
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Send 5k to 0123456789 GTBank",
      "createdAt": "2025-11-15T10:30:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Got it! Sending ₦5,000...",
      "createdAt": "2025-11-15T10:30:01Z",
      "metadata": {
        "intent": "bank_transfer"
      }
    }
  ]
}
```

**App Behavior**:
- Load history on chat screen open
- Implement infinite scroll for older messages
- Show timestamps (relative: "2 minutes ago", absolute for older)
- Maintain scroll position when new messages arrive

---

### Chat Bot Workflow Integration

**Important**: The chat bot can initiate transactions, but the app should:
1. Show bot's response
2. If bot requests PIN, show PIN input modal
3. Complete transaction via appropriate API endpoint (not through chat)
4. Update chat with transaction result

**Example Flow**:
1. User: "Send 5k to John"
2. Bot: "Got it! Sending ₦5,000 to John Doe (GTBank - 0123456789). Please enter your PIN."
3. App: Show PIN input modal
4. App: Call `POST /api/mobile/transfers` with extracted details + PIN
5. App: Show bot message: "✅ Transfer successful! Reference: TXN-123456"

---

## Notifications

The app includes a comprehensive notification system that alerts users about important events like incoming transfers, completed transactions, failed transfers, and more.

### Notification Types

- **transaction_credit**: Money received (wallet funding, incoming transfers)
- **transaction_debit**: Money sent (outgoing transfers)
- **transfer_incoming**: Incoming bank transfer
- **transfer_outgoing**: Outgoing bank transfer
- **transfer_failed**: Failed transfer attempt
- **airtime_purchase**: Airtime purchase completed
- **data_purchase**: Data purchase completed
- **bill_payment**: Bill payment completed
- **wallet_funded**: Wallet credited
- **account_verified**: Account verification completed
- **pin_changed**: PIN changed
- **security_alert**: Security-related alerts
- **system_announcement**: System-wide announcements
- **promotion**: Promotional messages

### Get Notifications

**Endpoint**: `GET /api/mobile/notifications`

**Query Parameters**:
- `limit` (default: 50, max: 100)
- `offset` (default: 0)
- `isRead` (optional: true/false)
- `type` (optional: filter by notification type)
- `priority` (optional: low, normal, high, urgent)

**Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "uuid",
      "type": "transfer_incoming",
      "title": "💰 Money Received",
      "message": "You received ₦5,000 - Transfer from John Doe",
      "data": {
        "transactionId": "uuid",
        "reference": "TXN-123456",
        "amount": 5000,
        "currency": "NGN",
        "category": "wallet_funding",
        "status": "completed"
      },
      "isRead": false,
      "readAt": null,
      "priority": "normal",
      "actionUrl": "/transactions/TXN-123456",
      "imageUrl": null,
      "createdAt": "2025-11-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**App Behavior**:
- Display notifications in reverse chronological order (newest first)
- Show unread indicator (badge/dot) for unread notifications
- Group by date (Today, Yesterday, This Week, etc.)
- Implement pull-to-refresh
- Show loading skeleton during fetch
- Filter by read/unread status
- Filter by type (transactions, transfers, etc.)
- Tap notification to navigate to `actionUrl` (e.g., transaction details)

---

### Get Unread Count

**Endpoint**: `GET /api/mobile/notifications/unread-count`

**Response**:
```json
{
  "success": true,
  "unreadCount": 5
}
```

**App Behavior**:
- Display unread count as badge on notification icon
- Update count in real-time when notifications are marked as read
- Call this endpoint on app launch and periodically (every 30 seconds when app is active)

---

### Mark Notification as Read

**Endpoint**: `POST /api/mobile/notifications/:id/read`

**Response**:
```json
{
  "success": true,
  "message": "Notification marked as read",
  "notification": {
    "id": "uuid",
    "isRead": true,
    "readAt": "2025-11-15T10:35:00Z"
  }
}
```

**App Behavior**:
- Automatically mark as read when user taps/opens notification
- Update UI to remove unread indicator
- Update unread count badge

---

### Mark All as Read

**Endpoint**: `POST /api/mobile/notifications/read-all`

**Response**:
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "updatedCount": 10
}
```

**App Behavior**:
- Show "Mark all as read" button in notifications screen
- Update all notifications in UI to show as read
- Reset unread count badge to 0

---

### Delete Notification

**Endpoint**: `DELETE /api/mobile/notifications/:id`

**Response**:
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

**App Behavior**:
- Allow swipe-to-delete or long-press menu
- Remove notification from list immediately
- Update unread count if deleted notification was unread

---

### Delete All Read Notifications

**Endpoint**: `DELETE /api/mobile/notifications/read/all`

**Response**:
```json
{
  "success": true,
  "message": "All read notifications deleted",
  "deletedCount": 15
}
```

**App Behavior**:
- Show "Clear read notifications" option in settings or notifications screen
- Remove all read notifications from list
- Keep unread notifications

---

### Notification Best Practices

1. **Real-time Updates**:
   - Poll `/notifications/unread-count` every 30 seconds when app is active
   - Refresh notification list when user opens notifications screen
   - Use WebSocket/push notifications for instant updates (future enhancement)

2. **User Experience**:
   - Show notification preview in app badge/tab
   - Play sound/vibration for high-priority notifications
   - Group similar notifications (e.g., multiple transfers in same day)
   - Show notification timestamp (relative: "2 minutes ago", absolute for older)

3. **Navigation**:
   - Use `actionUrl` to deep link to relevant screen
   - Example: `/transactions/TXN-123456` → Navigate to transaction details
   - Handle invalid/expired action URLs gracefully

4. **Performance**:
   - Cache notifications locally for offline viewing
   - Implement pagination for large notification lists
   - Lazy load notification images if `imageUrl` is present

---

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code | HTTP Status | Description | App Behavior |
|------|-------------|-------------|--------------|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password | Show error message, allow retry |
| `ACCOUNT_LOCKED` | 403 | Too many login attempts | Show lockout message with timer |
| `INSUFFICIENT_BALANCE` | 400 | Not enough funds | Show balance and required amount |
| `INVALID_PIN` | 400 | Wrong PIN entered | Show error, allow retry (max 3 attempts) |
| `LIMIT_EXCEEDED` | 400 | Daily/monthly limit reached | Show limit details and reset time |
| `OTP_EXPIRED` | 400 | OTP code expired | Allow requesting new OTP |
| `OTP_INVALID` | 400 | Wrong OTP code | Show remaining attempts |
| `KYC_REQUIRED` | 403 | KYC not completed | Navigate to onboarding |
| `WALLET_FROZEN` | 403 | Account frozen | Show support contact |
| `NETWORK_ERROR` | 500 | Backend unavailable | Show retry option |

### Error Handling Best Practices

1. **Network Errors**:
   - Show retry button
   - Implement exponential backoff
   - Cache requests for offline retry

2. **Validation Errors**:
   - Show field-specific error messages
   - Highlight invalid fields
   - Prevent submission until valid

3. **Business Logic Errors**:
   - Show user-friendly messages
   - Provide actionable next steps
   - Log errors for debugging

4. **Timeout Handling**:
   - Set reasonable timeouts (30s for API calls)
   - Show "Request taking longer than expected" message
   - Allow cancellation

---

## Security Best Practices

### 1. Token Storage
- **iOS**: Use Keychain Services
- **Android**: Use EncryptedSharedPreferences or Keystore
- **Never**: Store tokens in UserDefaults/SharedPreferences (unencrypted)

### 2. PIN Handling
- **Never** store PIN locally
- Mask PIN input (show dots, not numbers)
- Clear PIN from memory after use
- Implement PIN lockout (disable after 3 failed attempts)

### 3. API Communication
- Use HTTPS only (certificate pinning recommended)
- Validate SSL certificates
- Don't log sensitive data (PINs, tokens, account numbers)

### 4. Data Validation
- Validate all inputs on client (but trust server validation)
- Sanitize user inputs
- Prevent injection attacks

### 5. Session Management
- Implement token refresh before expiry
- Logout on token expiration
- Clear all stored data on logout

### 6. Biometric Authentication (Optional)
- Use Face ID / Touch ID / Fingerprint for PIN entry
- Store biometric auth state securely
- Fallback to PIN if biometric fails

---

## Testing Checklist

### Authentication
- [ ] Signup with valid email/password
- [ ] Signup with invalid email format
- [ ] Signup with weak password
- [ ] Login with correct credentials
- [ ] Login with wrong password (3 attempts → lockout)
- [ ] Forgot password flow (request OTP → verify → reset)
- [ ] OTP expiration (10 minutes)
- [ ] OTP max attempts (5 failures)
- [ ] Token refresh before expiry
- [ ] Token refresh after expiry (should logout)

### Onboarding
- [ ] Profile setup (all fields required)
- [ ] KYC submission with valid BVN
- [ ] KYC submission with invalid BVN
- [ ] Virtual account creation (auto after KYC)
- [ ] PIN setup (4 digits, matching confirmation)
- [ ] Skip completed steps (if already done)
- [ ] Onboarding status check on app launch

### Transactions
- [ ] Bank transfer (validate account → enter amount → PIN → success)
- [ ] OCR transfer (upload image → extract details → confirm → transfer)
- [ ] OCR with clear image (high confidence extraction)
- [ ] OCR with blurry/poor quality image (partial extraction or error)
- [ ] OCR with handwritten text
- [ ] OCR with printed text
- [ ] OCR error handling (no text found, invalid format)
- [ ] Transfer with insufficient balance
- [ ] Transfer exceeding daily limit
- [ ] Airtime purchase (all networks)
- [ ] Data purchase (all networks, all plans)
- [ ] Bill payment (electricity, cable, internet)
- [ ] Bill validation (valid/invalid customer number)
- [ ] Transaction history (pagination, filters)
- [ ] Transaction details view

### Beneficiaries
- [ ] Add beneficiary (with account validation)
- [ ] Edit beneficiary
- [ ] Delete beneficiary
- [ ] Toggle favorite
- [ ] Use beneficiary in transfer

### Chat Bot
- [ ] Send message and receive reply
- [ ] Chat history loading
- [ ] Chat history pagination
- [ ] Intent recognition (transfer, airtime, data, bills)
- [ ] Error handling in chat

### Notifications
- [ ] Get notifications list (with pagination)
- [ ] Get unread count
- [ ] Mark notification as read
- [ ] Mark all as read
- [ ] Delete notification
- [ ] Delete all read notifications
- [ ] Filter notifications (by type, read status, priority)
- [ ] Notification appears for incoming transfer
- [ ] Notification appears for outgoing transfer
- [ ] Notification appears for failed transfer
- [ ] Notification appears for wallet funding
- [ ] Notification deep linking (actionUrl navigation)

### Error Scenarios
- [ ] Network offline (show cached data if available)
- [ ] API timeout
- [ ] Server error (500)
- [ ] Invalid response format
- [ ] Token expiration during active session

### Edge Cases
- [ ] Very long transaction lists (pagination)
- [ ] Special characters in inputs
- [ ] Rapid button taps (prevent double submission)
- [ ] App backgrounding during transaction
- [ ] Low memory scenarios

---

## Production Deployment

### Pre-Launch Checklist

1. **Backend**:
   - [ ] Run self-healing scripts on production DB (including notifications table)
   - [ ] Set `MOBILE_JWT_SECRET` environment variable
   - [ ] Configure email service for OTP delivery
   - [ ] Enable rate limiting on mobile endpoints
   - [ ] Set up monitoring and alerting
   - [ ] Test all endpoints in production environment
   - [ ] Verify notification creation on transaction events

2. **Mobile App**:
   - [ ] Remove debug logs and test data
   - [ ] Set production API base URL
   - [ ] Enable certificate pinning
   - [ ] Configure crash reporting (Sentry, Firebase Crashlytics)
   - [ ] Set up analytics (Firebase Analytics, Mixpanel)
   - [ ] Test on multiple devices and OS versions
   - [ ] Performance testing (load times, memory usage)

3. **Security**:
   - [ ] Remove OTP from API responses (email only)
   - [ ] Enable API rate limiting
   - [ ] Implement DDoS protection
   - [ ] Security audit of authentication flow
   - [ ] Penetration testing

4. **Documentation**:
   - [ ] User guide/help section in app
   - [ ] Support contact information
   - [ ] Terms of service and privacy policy
   - [ ] API documentation for internal use

### Monitoring & Analytics

**Key Metrics to Track**:
- User signups and activations
- Onboarding completion rate
- Transaction success rate
- API response times
- Error rates by endpoint
- Chat bot usage and success rate
- User retention

**Alerts to Set Up**:
- High error rate (>5%)
- API response time >2s
- Failed transaction rate >10%
- Authentication failures spike
- Database connection issues

### Support & Maintenance

1. **User Support**:
   - In-app support chat/email
   - FAQ section
   - Help documentation

2. **Maintenance Windows**:
   - Schedule during low-traffic hours
   - Notify users in advance
   - Implement graceful degradation

3. **Version Updates**:
   - Force update for critical security fixes
   - Optional updates for features
   - Backward compatibility for API changes

---

## API Endpoint Summary

### Authentication
- `POST /api/mobile/auth/signup` - Create account
- `POST /api/mobile/auth/login` - Login
- `POST /api/mobile/auth/refresh` - Refresh token
- `POST /api/mobile/auth/forgot-password` - Request OTP
- `POST /api/mobile/auth/verify-otp` - Verify OTP
- `POST /api/mobile/auth/reset-password` - Reset password

### Onboarding
- `GET /api/mobile/onboarding/status` - Check status
- `POST /api/mobile/onboarding/profile` - Set profile
- `POST /api/mobile/onboarding/kyc` - Submit KYC
- `POST /api/mobile/onboarding/virtual-account` - Create virtual account
- `POST /api/mobile/onboarding/pin` - Set PIN

### Wallet & Profile
- `GET /api/mobile/me` - Get profile
- `PUT /api/mobile/me` - Update profile
- `GET /api/mobile/me/wallet` - Get wallet summary

### Transactions
- `GET /api/mobile/me/transactions` - List transactions
- `GET /api/mobile/me/transactions/:reference` - Get transaction details

### Transfers
- `GET /api/mobile/banks` - Get banks
- `POST /api/mobile/transfers/validate-account` - Validate account
- `GET /api/mobile/transfers/limits` - Get limits
- `GET /api/mobile/transfers/recent` - Get recent transfers
- `POST /api/mobile/transfers/ocr` - Extract bank details from image (OCR)
- `POST /api/mobile/transfers` - Initiate transfer

### Airtime
- `GET /api/mobile/airtime/networks` - Get networks
- `POST /api/mobile/airtime/purchase` - Purchase airtime

### Data
- `GET /api/mobile/data/networks` - Get networks
- `GET /api/mobile/data/plans/:network` - Get plans
- `POST /api/mobile/data/purchase` - Purchase data

### Bills
- `GET /api/mobile/bills/categories` - Get categories
- `GET /api/mobile/bills/providers/:category` - Get providers
- `GET /api/mobile/bills/plans/:provider` - Get plans (cable/internet)
- `POST /api/mobile/bills/validate` - Validate customer
- `POST /api/mobile/bills/pay` - Pay bill

### Beneficiaries
- `GET /api/mobile/beneficiaries` - List beneficiaries
- `POST /api/mobile/beneficiaries` - Create beneficiary
- `PATCH /api/mobile/beneficiaries/:id` - Update beneficiary
- `DELETE /api/mobile/beneficiaries/:id` - Delete beneficiary
- `POST /api/mobile/beneficiaries/:id/toggle-favorite` - Toggle favorite

### Chat
- `POST /api/mobile/chat/send` - Send message
- `GET /api/mobile/chat/history` - Get chat history

### Notifications
- `GET /api/mobile/notifications` - List notifications
- `GET /api/mobile/notifications/unread-count` - Get unread count
- `POST /api/mobile/notifications/:id/read` - Mark as read
- `POST /api/mobile/notifications/read-all` - Mark all as read
- `DELETE /api/mobile/notifications/:id` - Delete notification
- `DELETE /api/mobile/notifications/read/all` - Delete all read notifications

---

## Conclusion

This guide provides everything needed to build and deploy the MiiMii Mobile App. The backend APIs are production-ready and follow industry best practices for security and reliability.

**Key Takeaways**:
1. Always check onboarding status on app launch
2. All transactions require PIN verification
3. Chat bot complements traditional UI - use both
4. Handle errors gracefully with user-friendly messages
5. Security is paramount - never compromise on token/PIN storage

For questions or issues, refer to the Postman collection (`postman/MiiMii_Mobile_API.postman_collection.json`) for detailed API documentation.

---

**Last Updated**: November 2025
**Version**: 1.0.0


# Admin API Endpoints - Updated Documentation

## Base URL
```
https://chatmiimii.com/api/admin
```

## Authentication
All endpoints require Bearer token authentication:
```
Authorization: Bearer <ADMIN_TOKEN>
```

---

## 🆕 NEW ENDPOINTS

### 1. Sync Data Plans from Bilal Dashboard
Fetch all available data plans from your Bilal dashboard.

**Endpoint:** `POST /api/admin/data-plans/sync`

**Headers:**
```json
{
  "Authorization": "Bearer <ADMIN_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:** None

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Data plans synced successfully from Bilal dashboard",
  "data": {
    "networks": ["MTN", "AIRTEL", "GLO", "9MOBILE"],
    "totalPlans": 29,
    "plansByNetwork": {
      "MTN": 11,
      "AIRTEL": 5,
      "GLO": 6,
      "9MOBILE": 3
    }
  }
}
```

**Error Response (500):**
```json
{
  "error": "Failed to sync data plans",
  "details": "Error message here"
}
```

---

### 2. Get Data Plans (Cached or Fresh)
View all data plans or specific network plans.

**Endpoint:** `GET /api/admin/data-plans`

**Query Parameters:**
- `network` (optional): Filter by network - `MTN`, `AIRTEL`, `GLO`, or `9MOBILE`
- `refresh` (optional): Set to `true` to force fetch fresh plans

**Headers:**
```json
{
  "Authorization": "Bearer <ADMIN_TOKEN>"
}
```

**Examples:**

**Get all cached plans:**
```
GET /api/admin/data-plans
```

**Get MTN plans only:**
```
GET /api/admin/data-plans?network=MTN
```

**Force refresh all plans:**
```
GET /api/admin/data-plans?refresh=true
```

**Get fresh MTN plans:**
```
GET /api/admin/data-plans?network=MTN&refresh=true
```

**Response (200 OK):**
```json
{
  "success": true,
  "plans": {
    "MTN": [
      {
        "id": 1,
        "title": "500MB",
        "size": "500MB",
        "price": 350,
        "validity": "30days to 7days",
        "type": "SME",
        "network": "MTN"
      },
      {
        "id": 2,
        "title": "1GB",
        "size": "1GB",
        "price": 550,
        "validity": "30 days",
        "type": "SME",
        "network": "MTN"
      }
    ],
    "AIRTEL": [...],
    "GLO": [...],
    "9MOBILE": [...]
  },
  "networks": ["MTN", "AIRTEL", "GLO", "9MOBILE"],
  "totalPlans": 29
}
```

**Error Response (400):**
```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Invalid value",
      "path": "network",
      "location": "query"
    }
  ]
}
```

---

## 📝 UPDATED ENDPOINTS

### 3. Get Users List (Enhanced with BVN & Rubies Data)
List all users with enhanced KYC and virtual account information.

**Endpoint:** `GET /api/admin/users`

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20): Items per page
- `search` (optional): Search by name or phone number
- `kycStatus` (optional): Filter by KYC status - `incomplete`, `pending`, `verified`, `rejected`

**Headers:**
```json
{
  "Authorization": "Bearer <ADMIN_TOKEN>"
}
```

**Examples:**

**Get first page:**
```
GET /api/admin/users?page=1&limit=20
```

**Search users:**
```
GET /api/admin/users?search=Sadiq
```

**Filter by KYC status:**
```
GET /api/admin/users?kycStatus=verified
```

**Response (200 OK):**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 21,
    "pages": 2
  },
  "users": [
    {
      "id": "ee4442e9-e9d3-4312-a208-9da4b9f8449b",
      "name": "Sadiq Maikaba",
      "whatsappNumber": "+2349071102959",
      "email": null,
      "kycStatus": "not_required",
      "bvnVerified": false,
      "bvnVerificationDate": null,
      "onboardingStep": "completed",
      "isActive": true,
      "isBanned": false,
      "balance": 0.00,
      "virtualAccountNumber": "1000000981",
      "virtualAccountBank": "RUBIES MFB",
      "lastSeen": "2025-09-29T18:28:12.714Z",
      "createdAt": "2025-09-23T17:18:05.633Z"
    }
  ]
}
```

**New Fields Added:**
- `bvnVerified`: Boolean - Whether BVN has been verified with Rubies
- `bvnVerificationDate`: Date - When BVN was verified
- `onboardingStep`: String - Current onboarding status (`completed`, `name_collection`, etc.)
- `virtualAccountNumber`: String - Rubies virtual account number
- `virtualAccountBank`: String - Always "RUBIES MFB"

---

## 📚 EXISTING ENDPOINTS (No Changes)

### 4. Dashboard Overview
**Endpoint:** `GET /api/admin/dashboard`

**Response:**
```json
{
  "success": true,
  "overview": {
    "totalUsers": 21,
    "activeUsers": 18,
    "totalTransactions": 150,
    "totalVolume": 1250000.00,
    "pendingTransactions": 2,
    "openTickets": 3
  },
  "kycStats": {
    "verified": 10,
    "pending": 5,
    "incomplete": 3,
    "not_required": 3
  },
  "transactionTypes": [
    {
      "type": "bank_transfer",
      "count": 50,
      "volume": 500000.00
    }
  ],
  "recentTransactions": [...]
}
```

---

### 5. Get User Details
**Endpoint:** `GET /api/admin/users/:userId`

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "name": "John Doe",
    "whatsappNumber": "+2348012345678",
    "email": "john@example.com",
    "kycStatus": "verified",
    "bvnVerified": true,
    "onboardingStep": "completed",
    "wallet": {
      "balance": 5000.00,
      "availableBalance": 5000.00,
      "virtualAccountNumber": "1000000123",
      "virtualAccountBank": "RUBIES MFB"
    },
    "transactions": [...],
    "createdAt": "2023-11-01T10:00:00.000Z"
  }
}
```

---

### 6. Freeze Wallet
**Endpoint:** `POST /api/admin/users/:userId/wallet/freeze`

**Request Body:**
```json
{
  "reason": "Suspicious activity detected"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet frozen successfully"
}
```

---

### 7. Unfreeze Wallet
**Endpoint:** `POST /api/admin/users/:userId/wallet/unfreeze`

**Response:**
```json
{
  "success": true,
  "message": "Wallet unfrozen successfully"
}
```

---

### 8. Credit Wallet
**Endpoint:** `POST /api/admin/users/:userId/wallet/credit`

**Request Body:**
```json
{
  "amount": 1000,
  "description": "Bonus credit"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet credited successfully",
  "newBalance": 6000.00
}
```

---

### 9. Debit Wallet
**Endpoint:** `POST /api/admin/users/:userId/wallet/debit`

**Request Body:**
```json
{
  "amount": 500,
  "description": "Penalty deduction"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet debited successfully",
  "newBalance": 5500.00
}
```

---

### 10. Get Transactions
**Endpoint:** `GET /api/admin/transactions`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `userId` (optional): Filter by user ID
- `status` (optional): Filter by status
- `type` (optional): Filter by transaction type
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter

**Example:**
```
GET /api/admin/transactions?page=1&limit=50&status=completed&type=bank_transfer
```

**Response:**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  },
  "transactions": [
    {
      "id": "txn-uuid",
      "reference": "TXN1759170468350",
      "type": "bank_transfer",
      "amount": 1000.00,
      "status": "completed",
      "user": {
        "name": "Sadiq Maikaba",
        "whatsappNumber": "+2349071102959"
      },
      "createdAt": "2025-09-29T18:28:12.714Z"
    }
  ]
}
```

---

### 11. Ban User
**Endpoint:** `POST /api/admin/users/:userId/ban`

**Request Body:**
```json
{
  "reason": "Fraudulent activity"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User banned successfully"
}
```

---

### 12. Unban User
**Endpoint:** `POST /api/admin/users/:userId/unban`

**Response:**
```json
{
  "success": true,
  "message": "User unbanned successfully"
}
```

---

### 13. Get Support Tickets
**Endpoint:** `GET /api/admin/support-tickets`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by status - `open`, `in_progress`, `resolved`, `closed`
- `priority` (optional): Filter by priority - `low`, `medium`, `high`, `urgent`

**Response:**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  },
  "tickets": [
    {
      "id": "ticket-uuid",
      "subject": "Cannot complete transfer",
      "description": "Getting error when trying to send money",
      "status": "open",
      "priority": "high",
      "user": {
        "name": "John Doe",
        "whatsappNumber": "+2348012345678"
      },
      "createdAt": "2025-10-01T10:00:00.000Z"
    }
  ]
}
```

---

### 14. Update Support Ticket
**Endpoint:** `PUT /api/admin/support-tickets/:ticketId`

**Request Body:**
```json
{
  "status": "in_progress",
  "priority": "high",
  "response": "We are investigating your issue"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ticket updated successfully",
  "ticket": {
    "id": "ticket-uuid",
    "status": "in_progress",
    "priority": "high"
  }
}
```

---

### 15. Create Support Ticket (Admin)
**Endpoint:** `POST /api/admin/support-tickets`

**Request Body:**
```json
{
  "userId": "user-uuid",
  "subject": "Account verification required",
  "description": "Please verify your BVN",
  "priority": "medium"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Support ticket created successfully",
  "ticket": {
    "id": "ticket-uuid",
    "subject": "Account verification required",
    "status": "open"
  }
}
```

---

## 🔐 Authentication Endpoint

### Login
**Endpoint:** `POST /api/admin/auth/login`

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "your_password"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (401):**
```json
{
  "error": "Invalid credentials"
}
```

---

## 📊 Complete API Summary

### New Endpoints (2):
1. `POST /api/admin/data-plans/sync` - Sync data plans from Bilal
2. `GET /api/admin/data-plans` - Get data plans (cached or fresh)

### Updated Endpoints (1):
1. `GET /api/admin/users` - Enhanced with BVN and virtual account fields

### Total Available Endpoints: 15+

---

## 🎨 Dashboard Implementation Examples

### Example 1: Display Data Plans with Sync Button

```javascript
// Fetch current plans
const getDataPlans = async () => {
  const response = await fetch('https://chatmiimii.com/api/admin/data-plans', {
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  const data = await response.json();
  return data.plans;
};

// Sync plans from Bilal dashboard
const syncPlans = async () => {
  const response = await fetch('https://chatmiimii.com/api/admin/data-plans/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  alert(`Synced ${data.data.totalPlans} plans!`);
  // Refresh plans list
  await getDataPlans();
};
```

---

### Example 2: Display User List with Enhanced Fields

```javascript
const getUsersList = async (page = 1) => {
  const response = await fetch(
    `https://chatmiimii.com/api/admin/users?page=${page}&limit=20`,
    {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  );
  const data = await response.json();
  
  // Display users with new fields
  data.users.forEach(user => {
    console.log({
      name: user.name,
      phone: user.whatsappNumber,
      balance: user.balance,
      virtualAccount: user.virtualAccountNumber,
      bvnVerified: user.bvnVerified,
      onboardingStatus: user.onboardingStep
    });
  });
};
```

---

### Example 3: Refresh Plans Button

```javascript
const refreshPlans = async (network = null) => {
  const url = network 
    ? `https://chatmiimii.com/api/admin/data-plans?network=${network}&refresh=true`
    : 'https://chatmiimii.com/api/admin/data-plans?refresh=true';
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  
  const data = await response.json();
  console.log(`Refreshed ${data.totalPlans} plans`);
  return data.plans;
};
```

---

## 🔄 Rate Limits

- No rate limits currently implemented
- Recommended: Cache data plans locally and sync periodically (e.g., every hour)
- Use `refresh=true` sparingly to avoid excessive API calls to Bilal

---

## 🐛 Error Handling

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Invalid value",
      "path": "fieldName",
      "location": "body|query|params"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Error message",
  "details": "Detailed error (only in development)"
}
```

---

## 📞 Support

For API issues or questions, contact the development team.

**Last Updated:** October 2, 2025
**Version:** 2.0


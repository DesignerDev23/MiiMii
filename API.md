# MiiMii.AI API Documentation

This document provides an overview of the MiiMii.AI API endpoints and their usage.

## Base URL
```
https://your-domain.com
```

## Authentication
Most endpoints require authentication via WhatsApp Business API webhook verification.

## Webhook Endpoints

### WhatsApp Webhook
```http
POST /webhook/whatsapp
```

Handles incoming WhatsApp messages and status updates.

**Headers:**
- `Content-Type: application/json`
- `X-Hub-Signature-256`: WhatsApp webhook signature

**Body:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "phone_number_id",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "+1234567890",
              "phone_number_id": "phone_number_id"
            },
            "contacts": [...],
            "messages": [...]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

### BellBank Webhook
```http
POST /webhook/bellbank
```

Handles transfer status updates from BellBank API.

## User Endpoints

### Get User Balance
```http
GET /api/user/balance
```

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 1500.00,
    "currency": "NGN"
  }
}
```

### Get Transaction History
```http
GET /api/user/transactions?limit=10&offset=0
```

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 10)
- `offset` (optional): Number of transactions to skip (default: 0)
- `type` (optional): Filter by transaction type (debit/credit)
- `category` (optional): Filter by category (transfer/airtime/data)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "type": "debit",
        "category": "bank_transfer",
        "amount": 1000.00,
        "fee": 25.00,
        "description": "Transfer to John Doe",
        "reference": "TXN1234567890",
        "status": "completed",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 50,
    "limit": 10,
    "offset": 0
  }
}
```

## Transfer Endpoints

### Initiate Bank Transfer
```http
POST /api/transfer
```

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "accountNumber": "1234567890",
  "bankCode": "044",
  "amount": 1000,
  "narration": "Transfer to John Doe",
  "pin": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reference": "TXN1234567890",
    "amount": 1000,
    "fee": 25,
    "totalAmount": 1025,
    "status": "processing",
    "estimatedArrival": "5-15 minutes"
  }
}
```

### Validate Bank Account
```http
POST /api/transfer/validate
```

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "accountNumber": "1234567890",
  "bankCode": "044"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "accountNumber": "1234567890",
    "accountName": "JOHN DOE",
    "bankCode": "044",
    "bank": "Access Bank"
  }
}
```

## Airtime Endpoints

### Purchase Airtime
```http
POST /api/airtime
```

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "phoneNumber": "07035437910",
  "network": "MTN",
  "amount": 100,
  "pin": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reference": "Airtime_1234567890",
    "network": "MTN",
    "phoneNumber": "07035437910",
    "amount": 100,
    "status": "successful"
  }
}
```

### Get Available Networks
```http
GET /api/airtime/networks
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "MTN",
      "code": "mtn",
      "label": "MTN"
    },
    {
      "name": "AIRTEL",
      "code": "airtel",
      "label": "Airtel"
    }
  ]
}
```

## Data Endpoints

### Purchase Data
```http
POST /api/data
```

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "phoneNumber": "07035437910",
  "network": "MTN",
  "dataPlan": {
    "id": 1,
    "dataplan": "1GB",
    "amount": 1000
  },
  "pin": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reference": "Data_1234567890",
    "network": "MTN",
    "phoneNumber": "07035437910",
    "dataPlan": "1GB",
    "amount": 1000,
    "status": "successful"
  }
}
```

### Get Data Plans
```http
GET /api/data/plans?network=MTN
```

**Query Parameters:**
- `network` (required): Network name (MTN, AIRTEL, GLO, 9MOBILE)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "dataplan": "1GB",
      "amount": 1000,
      "validity": "30 days"
    },
    {
      "id": 2,
      "dataplan": "2GB",
      "amount": 1800,
      "validity": "30 days"
    }
  ]
}
```

## Admin Endpoints

### Get System Status
```http
GET /api/admin/status
```

**Headers:**
- `Authorization: Bearer <admin_token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "2.0.0",
    "services": {
      "database": "connected",
      "whatsapp": "connected",
      "bilal": "connected",
      "bellbank": "connected"
    }
  }
}
```

### Get Transaction Statistics
```http
GET /api/admin/stats?period=daily
```

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `period` (optional): Statistics period (daily, weekly, monthly)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTransactions": 1500,
    "totalVolume": 2500000,
    "totalFees": 37500,
    "successRate": 98.5,
    "period": "daily"
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Input validation failed
- `INSUFFICIENT_BALANCE`: User has insufficient balance
- `INVALID_PIN`: PIN verification failed
- `SERVICE_UNAVAILABLE`: External service is unavailable
- `TRANSACTION_FAILED`: Transaction processing failed
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied
- `NOT_FOUND`: Resource not found
- `INTERNAL_ERROR`: Server error

## Rate Limiting

- **Webhook endpoints**: No rate limiting
- **User endpoints**: 100 requests per minute per user
- **Admin endpoints**: 1000 requests per minute per admin

## Webhook Verification

WhatsApp webhooks are verified using the `X-Hub-Signature-256` header. The signature is generated using HMAC-SHA256 with your webhook secret.

## Support

For API support:
- **Email**: contactcenter@chatmiimiiai.com
- **Phone**: +234 907 110 2959, +234 701 405 5875
- **Documentation**: Check README.md for detailed setup instructions



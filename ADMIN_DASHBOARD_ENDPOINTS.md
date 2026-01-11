# Admin Dashboard API Endpoints Implementation Guide

## Overview

This document provides implementation notes for integrating the new admin endpoints into the admin dashboard frontend.

## New Endpoints

### 1. User Beneficiaries Endpoint

**Endpoint:** `GET /api/admin/users/:userId/beneficiaries`

**Purpose:** Retrieve all beneficiaries for a specific user with pagination and search functionality.

#### Request Parameters

**Path Parameters:**
- `userId` (UUID, required) - The ID of the user whose beneficiaries to retrieve

**Query Parameters:**
- `page` (number, optional, default: 1) - Page number for pagination
- `limit` (number, optional, default: 20) - Number of beneficiaries per page
- `search` (string, optional) - Search term to filter beneficiaries by name, nickname, account number, or phone number

#### Example Request

```javascript
// Get first page of beneficiaries for a user
GET /api/admin/users/936cff60-c5fd-4352-86fc-dbc182e9f8df/beneficiaries?page=1&limit=20

// Search for beneficiaries
GET /api/admin/users/936cff60-c5fd-4352-86fc-dbc182e9f8df/beneficiaries?search=musa&page=1&limit=20
```

#### Response Format

```json
{
  "success": true,
  "beneficiaries": [
    {
      "id": "uuid",
      "userId": "uuid",
      "type": "bank_account",
      "name": "MUSA ABDULKADIR",
      "phoneNumber": null,
      "accountNumber": "7650311255",
      "bankCode": "000017",
      "bankName": "WEMA BANK",
      "nickname": "my mum",
      "category": "family",
      "isVerified": true,
      "isFavorite": false,
      "isActive": true,
      "totalTransactions": 5,
      "totalAmount": 5000.00,
      "averageAmount": 1000.00,
      "lastUsedAt": "2026-01-10T16:03:00.000Z",
      "createdAt": "2026-01-09T18:17:00.000Z",
      "updatedAt": "2026-01-10T16:03:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

#### Implementation Notes

**Frontend Implementation:**
1. **User Detail Page:** Add a "Beneficiaries" tab/section on the user detail page
2. **Table Display:** Show beneficiaries in a table with columns:
   - Name/Nickname (show nickname if available, otherwise name)
   - Account Number / Phone Number
   - Bank Name
   - Type (Bank Account / Phone Number / MiiMii User)
   - Total Transactions
   - Total Amount
   - Last Used Date
   - Actions (View Details, Delete)
3. **Search Functionality:** Add a search input that filters beneficiaries in real-time
4. **Pagination:** Implement pagination controls (Previous/Next buttons, page numbers)
5. **Empty State:** Show message when user has no beneficiaries

**Example React Component Structure:**
```jsx
<UserBeneficiaries 
  userId={userId}
  onBeneficiaryClick={handleBeneficiaryClick}
/>
```

---

### 2. Transfer Charges Endpoint

**Endpoint:** `GET /api/admin/transfer-charges`

**Purpose:** Retrieve all platform fee transactions (₦5 charges) with pagination and date filtering.

#### Request Parameters

**Query Parameters:**
- `startDate` (string, optional) - Start date for filtering (ISO 8601 format: `YYYY-MM-DD`)
- `endDate` (string, optional) - End date for filtering (ISO 8601 format: `YYYY-MM-DD`)
- `page` (number, optional, default: 1) - Page number for pagination
- `limit` (number, optional, default: 50) - Number of charges per page

#### Example Request

```javascript
// Get all transfer charges
GET /api/admin/transfer-charges?page=1&limit=50

// Get charges for a specific date range
GET /api/admin/transfer-charges?startDate=2026-01-01&endDate=2026-01-31&page=1&limit=50
```

#### Response Format

```json
{
  "success": true,
  "charges": [
    {
      "id": "uuid",
      "reference": "PFEE1234567890",
      "userId": "uuid",
      "user": {
        "id": "uuid",
        "firstName": "Musa",
        "lastName": "Abdulkadir",
        "whatsappNumber": "+2349072874728"
      },
      "amount": 5.00,
      "description": "Platform fee for transfer TXN1234567890",
      "parentTransactionReference": "TXN1234567890",
      "createdAt": "2026-01-10T16:03:00.000Z"
    }
  ],
  "summary": {
    "totalCharges": 150.00,
    "totalCount": 30
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 30,
    "totalPages": 1
  }
}
```

#### Implementation Notes

**Frontend Implementation:**
1. **Revenue/Charges Page:** Create a new page or section for "Transfer Charges" or "Platform Fees"
2. **Date Range Filter:** Add date picker inputs for `startDate` and `endDate`
3. **Table Display:** Show charges in a table with columns:
   - Date/Time
   - User (Name + WhatsApp Number)
   - Amount (N5.00)
   - Parent Transaction Reference (link to original transaction)
   - Description
   - Actions (View Transaction Details)
4. **Summary Card:** Display summary information:
   - Total Charges (sum of all amounts)
   - Total Count (number of charges)
   - Average Charge (calculated from summary)
5. **Export Functionality:** Consider adding CSV/Excel export for charges
6. **Pagination:** Implement pagination controls

**Example React Component Structure:**
```jsx
<TransferCharges 
  onDateRangeChange={handleDateRangeChange}
  onExport={handleExport}
/>
```

---

### 3. Transfer Charges Summary Endpoint

**Endpoint:** `GET /api/admin/transfer-charges/summary`

**Purpose:** Get aggregated statistics for transfer charges (platform fees).

#### Request Parameters

**Query Parameters:**
- `startDate` (string, optional) - Start date for filtering (ISO 8601 format: `YYYY-MM-DD`)
- `endDate` (string, optional) - End date for filtering (ISO 8601 format: `YYYY-MM-DD`)

#### Example Request

```javascript
// Get summary for all time
GET /api/admin/transfer-charges/summary

// Get summary for a specific date range
GET /api/admin/transfer-charges/summary?startDate=2026-01-01&endDate=2026-01-31
```

#### Response Format

```json
{
  "success": true,
  "summary": {
    "totalCharges": 150.00,
    "totalCount": 30,
    "averageCharge": 5.00,
    "chargesByDate": {
      "2026-01-10": {
        "count": 5,
        "amount": 25.00
      },
      "2026-01-09": {
        "count": 3,
        "amount": 15.00
      }
    }
  }
}
```

#### Implementation Notes

**Frontend Implementation:**
1. **Dashboard Widget:** Add a summary card/widget on the main dashboard showing:
   - Total Charges (all time or for selected period)
   - Total Count
   - Average Charge
2. **Charts/Graphs:** Use the `chargesByDate` data to create:
   - Line chart showing daily charges over time
   - Bar chart showing charges by date
3. **Date Range Selector:** Allow users to select date ranges (Today, This Week, This Month, Custom Range)
4. **Real-time Updates:** Consider polling this endpoint periodically for live updates

**Example React Component Structure:**
```jsx
<TransferChargesSummary 
  dateRange={dateRange}
  onDateRangeChange={handleDateRangeChange}
/>
```

---

## Implementation Checklist

### User Beneficiaries
- [ ] Create beneficiaries table component
- [ ] Add search input with debouncing
- [ ] Implement pagination controls
- [ ] Add empty state handling
- [ ] Add loading states
- [ ] Add error handling
- [ ] Link to user detail page from beneficiaries
- [ ] Add beneficiary detail modal/page

### Transfer Charges
- [ ] Create transfer charges page/component
- [ ] Add date range picker
- [ ] Create charges table with all columns
- [ ] Display summary card (total charges, count)
- [ ] Implement pagination
- [ ] Add export functionality (optional)
- [ ] Link parent transaction references to transaction details
- [ ] Add loading and error states

### Transfer Charges Summary
- [ ] Create summary widget/card component
- [ ] Add date range selector
- [ ] Display key metrics (total, count, average)
- [ ] Create charts/graphs using chargesByDate data
- [ ] Add real-time updates (optional)
- [ ] Add loading states

## API Integration Examples

### JavaScript/TypeScript Fetch Example

```typescript
// Get User Beneficiaries
async function getUserBeneficiaries(userId: string, page: number = 1, limit: number = 20, search?: string) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search })
  });
  
  const response = await fetch(
    `/api/admin/users/${userId}/beneficiaries?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch beneficiaries');
  }
  
  return await response.json();
}

// Get Transfer Charges
async function getTransferCharges(
  startDate?: string, 
  endDate?: string, 
  page: number = 1, 
  limit: number = 50
) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(startDate && { startDate }),
    ...(endDate && { endDate })
  });
  
  const response = await fetch(
    `/api/admin/transfer-charges?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch transfer charges');
  }
  
  return await response.json();
}

// Get Transfer Charges Summary
async function getTransferChargesSummary(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const response = await fetch(
    `/api/admin/transfer-charges/summary?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch transfer charges summary');
  }
  
  return await response.json();
}
```

### Axios Example

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/admin',
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});

// Get User Beneficiaries
export const getUserBeneficiaries = async (
  userId: string, 
  params: { page?: number; limit?: number; search?: string } = {}
) => {
  const { data } = await api.get(`/users/${userId}/beneficiaries`, { params });
  return data;
};

// Get Transfer Charges
export const getTransferCharges = async (
  params: { startDate?: string; endDate?: string; page?: number; limit?: number } = {}
) => {
  const { data } = await api.get('/transfer-charges', { params });
  return data;
};

// Get Transfer Charges Summary
export const getTransferChargesSummary = async (
  params: { startDate?: string; endDate?: string } = {}
) => {
  const { data } = await api.get('/transfer-charges/summary', { params });
  return data;
};
```

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "details": "Additional error details (in development mode only)"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (user not found, etc.)
- `500` - Internal Server Error

## Authentication

All endpoints require admin authentication. Include the authentication token in the request headers:

```
Authorization: Bearer <admin_token>
```

## Notes

1. **Date Format:** All dates should be in ISO 8601 format (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`)
2. **Pagination:** Page numbers start at 1 (not 0)
3. **Search:** The search parameter searches across multiple fields (name, nickname, account number, phone number)
4. **Platform Fees:** All transfer charges are exactly N5.00 (flat fee)
5. **Internal Transactions:** Platform fee transactions are marked as internal and hidden from user transaction history but visible to admins

## UI/UX Recommendations

1. **Loading States:** Show skeleton loaders or spinners while data is being fetched
2. **Error Messages:** Display user-friendly error messages with retry options
3. **Empty States:** Show helpful messages when no data is available
4. **Responsive Design:** Ensure tables and cards work well on mobile devices
5. **Data Refresh:** Consider auto-refresh for summary widgets (every 30-60 seconds)
6. **Export:** Add CSV/Excel export buttons for charges data
7. **Filters:** Make date range filters easily accessible and intuitive
8. **Tooltips:** Add tooltips explaining what platform fees are

## Testing Checklist

- [ ] Test pagination (first page, last page, middle pages)
- [ ] Test search functionality (empty search, partial matches, no results)
- [ ] Test date range filters (single day, date range, invalid dates)
- [ ] Test with users who have no beneficiaries
- [ ] Test with date ranges that have no charges
- [ ] Test error handling (network errors, invalid user IDs)
- [ ] Test loading states
- [ ] Test responsive design on mobile devices

